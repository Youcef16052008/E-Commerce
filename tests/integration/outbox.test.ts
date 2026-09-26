import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import {
  mailLog,
  orderItems,
  orders,
  outboxJobs,
  paymentExceptionRows,
  products,
  refunds,
  user,
} from "@/server/db/schema";
import { runOutbox } from "@/features/outbox/application/outbox-service";
import { viewPersistedExceptions } from "@/features/outbox/application/exceptions-view-service";
import { GET as cronGet } from "@/app/api/cron/outbox/route";
import { hasDatabase } from "./has-database";

/**
 * Outbox (L6.1) contre une base réelle : enfilement sans doublon, drain,
 * matérialisation des exceptions, reçus/avis journalisés (provider console),
 * idempotence sur second passage, route Cron protégée.
 */
const runId = Date.now();

describe.skipIf(!hasDatabase)("Outbox (intégration)", () => {
  let buyerId = "";
  let ghostId = "";
  let productId = "";
  const paidOrderId = randomUUID(); // payée, avec entitlement manquant → exception
  const refundedOrderId = randomUUID();
  const ghostOrderId = randomUUID(); // acheteur anonymisé → jamais d'e-mail

  beforeAll(async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const [b] = await db
      .insert(user)
      .values({ id: randomUUID(), name: "Outbox Buyer", email: `it-outbox-${runId}@biblio.test` })
      .returning({ id: user.id });
    buyerId = b.id;
    const [g] = await db
      .insert(user)
      .values({
        id: randomUUID(),
        name: "Compte supprimé",
        email: `deleted-${runId}@anonymised.invalid`,
      })
      .returning({ id: user.id });
    ghostId = g.id;
    const [p] = await db
      .insert(products)
      .values({
        id: randomUUID(),
        slug: `it-outbox-${runId}`,
        title: "Livre Outbox",
        author: "Test",
        priceInCents: 50,
        published: true,
      })
      .returning({ id: products.id });
    productId = p.id;

    await db.insert(orders).values([
      {
        id: paidOrderId,
        userId: buyerId,
        status: "paid",
        totalInCents: 50,
        paidAt: new Date(),
        stripeCheckoutSessionId: `cs_test_${runId}`,
        stripePaymentIntentId: `pi_test_${runId}`,
      },
      {
        id: refundedOrderId,
        userId: buyerId,
        status: "refunded",
        totalInCents: 50,
        paidAt: new Date(),
        stripeCheckoutSessionId: `cs_test_r${runId}`,
        stripePaymentIntentId: `pi_test_r${runId}`,
      },
      {
        id: ghostOrderId,
        userId: ghostId,
        status: "fulfilled",
        totalInCents: 50,
        paidAt: new Date(),
        stripeCheckoutSessionId: `cs_test_g${runId}`,
        stripePaymentIntentId: `pi_test_g${runId}`,
      },
    ]);
    for (const orderId of [paidOrderId, refundedOrderId, ghostOrderId]) {
      await db.insert(orderItems).values({
        orderId,
        productId,
        titleSnapshot: "Livre Outbox",
        priceInCents: 50,
        quantity: 1,
      });
    }
    await db.insert(refunds).values({
      id: randomUUID(),
      orderId: refundedOrderId,
      requestedByUserId: buyerId,
      previousOrderStatus: "paid",
      status: "succeeded",
      amountInCents: 50,
      currency: "usd",
      stripeRefundId: `re_test_${runId}`,
      completedAt: new Date(),
    });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    const ids = [paidOrderId, refundedOrderId, ghostOrderId];
    await db.delete(mailLog).where(inArray(mailLog.orderId, ids));
    await db.delete(paymentExceptionRows).where(inArray(paymentExceptionRows.orderId, ids));
    await db.delete(refunds).where(inArray(refunds.orderId, ids));
    await db.delete(orderItems).where(inArray(orderItems.orderId, ids));
    await db.delete(orders).where(inArray(orders.id, ids));
    await db.delete(products).where(eq(products.id, productId));
    await db.delete(user).where(inArray(user.id, [buyerId, ghostId]));
    await db
      .delete(outboxJobs)
      .where(
        inArray(outboxJobs.kind, ["reconcile_payments", "send_receipts", "send_refund_notices"]),
      );
  });

  it("premier passage : 3 travaux enfilés et traités, exceptions matérialisées, mails journalisés", async () => {
    const summary = await runOutbox({ limit: 10 });
    expect(summary.enqueued.sort()).toEqual(
      ["reconcile_payments", "send_receipts", "send_refund_notices"].sort(),
    );
    expect(summary.processed.map((p) => p.outcome)).toEqual(["done", "done", "done"]);

    const view = await viewPersistedExceptions();
    const mine = view.items.filter((i) => i.orderId === paidOrderId);
    expect(mine.map((i) => i.kind)).toContain("PAID_ORDER_MISSING_ENTITLEMENT");
    expect(mine[0]!.productTitle).toBe("Livre Outbox");
    expect(view.lastRunAt).not.toBeNull();

    const logs = await db
      .select()
      .from(mailLog)
      .where(inArray(mailLog.orderId, [paidOrderId, refundedOrderId, ghostOrderId]));
    const byTag = new Map(logs.map((l) => [l.tag, l]));
    expect(byTag.get(`receipt:${paidOrderId}`)).toMatchObject({
      provider: "console",
      delivered: false,
    });
    expect(byTag.get(`refund:${refundedOrderId}:50`)).toMatchObject({ provider: "console" });
    expect(byTag.get(`receipt:${ghostOrderId}`)).toMatchObject({
      recipient: "-",
      error: "unmailable",
    });
    expect(byTag.get(`receipt:${refundedOrderId}`)).toBeUndefined(); // remboursée ≠ payée
  });

  it("second passage : idempotent (rien de nouveau à envoyer) et l'exception se résout", async () => {
    // Résout l'écart : on livre le droit manquant.
    const { entitlements } = await import("@/server/db/schema");
    await db.insert(entitlements).values({
      id: randomUUID(),
      userId: buyerId,
      productId,
      orderId: paidOrderId,
    });

    const summary = await runOutbox({ limit: 10 });
    const results = Object.fromEntries(summary.processed.map((p) => [p.kind, p.result as never]));
    expect(results.send_receipts).toMatchObject({ sent: 0, errored: 0 });
    expect(results.send_refund_notices).toMatchObject({ sent: 0 });

    const view = await viewPersistedExceptions();
    expect(view.items.some((i) => i.orderId === paidOrderId)).toBe(false);
    const [row] = await db
      .select()
      .from(paymentExceptionRows)
      .where(eq(paymentExceptionRows.orderId, paidOrderId));
    expect(row!.resolvedAt).not.toBeNull();

    await db.delete(entitlements).where(eq(entitlements.orderId, paidOrderId));
  });

  it("route Cron : 503 sans secret, 401 mauvais Bearer, 200 avec le bon", async () => {
    const saved = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    expect((await cronGet(new Request("http://x/api/cron/outbox"))).status).toBe(503);
    process.env.CRON_SECRET = "it-cron-secret-0123456789";
    expect(
      (
        await cronGet(
          new Request("http://x/api/cron/outbox", { headers: { authorization: "Bearer nope" } }),
        )
      ).status,
    ).toBe(401);
    const ok = await cronGet(
      new Request("http://x/api/cron/outbox", {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      }),
    );
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { processed: unknown[] };
    expect(Array.isArray(body.processed)).toBe(true);
    if (saved === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = saved;
  });
});
