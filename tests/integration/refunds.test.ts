import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { user, orders, orderItems, products, entitlements, refunds } from "@/server/db/schema";
import { recordRefund, reconcileOrderWithStripe } from "@/features/checkout/infrastructure/checkout-repo";
import { hasDatabase, hasStripe } from "./has-database";

/**
 * Tests d'intégration des remboursements Stripe.
 * - Enregistrement idempotent d'un refund.
 * - Passage automatique de la commande en `refunded` si total couvert.
 * - Réconciliation basique avec l'état distant (mock via service).
 */

const runId = Date.now();

describe.skipIf(!hasDatabase)("Remboursements (intégration)", () => {
  const email = `it-refund-${runId}@biblio.test`;
  let userId = "";
  let productId = "";
  let orderId = "";
  let entitlementId = "";

  beforeAll(async () => {
    const [u] = await db
      .insert(user)
      .values({ id: randomUUID(), name: "Refund IT", email, role: "customer" })
      .returning({ id: user.id });
    userId = u.id;

    const [p] = await db
      .insert(products)
      .values({
        id: randomUUID(),
        slug: `it-refund-${runId}`,
        title: "Produit remboursement IT",
        author: "Tests",
        format: "epub",
        priceInCents: 500,
        currency: "usd",
        published: true,
      })
      .returning({ id: products.id });
    productId = p.id;

    orderId = randomUUID();
    await db.insert(orders).values({
      id: orderId,
      userId,
      status: "paid",
      totalInCents: 500,
      currency: "usd",
      paidAt: new Date(),
    });

    await db.insert(orderItems).values({
      orderId,
      productId,
      titleSnapshot: "Produit remboursement IT",
      priceInCents: 500,
      quantity: 1,
      currency: "usd",
    });

    const [e] = await db
      .insert(entitlements)
      .values({
        id: randomUUID(),
        userId,
        productId,
        orderId,
      })
      .returning({ id: entitlements.id });
    entitlementId = e.id;
  });

  afterAll(async () => {
    await db.delete(refunds).where(eq(refunds.orderId, orderId)).catch(() => undefined);
    await db.delete(entitlements).where(eq(entitlements.id, entitlementId)).catch(() => undefined);
    await db.delete(orderItems).where(eq(orderItems.orderId, orderId)).catch(() => undefined);
    await db.delete(orders).where(eq(orders.id, orderId)).catch(() => undefined);
    await db.delete(products).where(eq(products.id, productId)).catch(() => undefined);
    await db.delete(user).where(eq(user.id, userId)).catch(() => undefined);
  });

  it("enregistre un nouveau refund et passe la commande en refunded quand total couvert", async () => {
    const created = await recordRefund({
      orderId,
      stripeRefundId: `re_${randomUUID()}`,
      amountInCents: 500,
      currency: "usd",
      status: "succeeded",
      reason: "requested_by_customer",
    });
    expect(created).toBe(true);

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    expect(order.status).toBe("refunded");
    expect(order.refundAmountInCents).toBe(500);
    expect(order.refundedAt).toBeInstanceOf(Date);
  });

  it("est idempotent sur le même stripe_refund_id (doublon ignoré)", async () => {
    const sharedRefundId = `re_${randomUUID()}`;
    const created = await recordRefund({
      orderId,
      stripeRefundId: sharedRefundId,
      amountInCents: 500,
      currency: "usd",
      status: "succeeded",
      reason: "requested_by_customer",
    });
    expect(created).toBe(true);

    const second = await recordRefund({
      orderId,
      stripeRefundId: sharedRefundId,
      amountInCents: 500,
      currency: "usd",
      status: "succeeded",
    });
    expect(second).toBe(false);
  });

  it("enregistre un refund partiel sans basculer en refunded (montant restant)", async () => {
    const partialOrderId = randomUUID();
    await db.insert(orders).values({
      id: partialOrderId,
      userId,
      status: "paid",
      totalInCents: 1000,
      currency: "usd",
      paidAt: new Date(),
    });

    const created = await recordRefund({
      orderId: partialOrderId,
      stripeRefundId: `re_partial_${randomUUID()}`,
      amountInCents: 300,
      currency: "usd",
      status: "succeeded",
    });
    expect(created).toBe(true);

    const [partial] = await db.select().from(orders).where(eq(orders.id, partialOrderId)).limit(1);
    expect(partial.status).toBe("paid");
    expect(partial.refundAmountInCents).toBe(300);

    await db.delete(orders).where(eq(orders.id, partialOrderId)).catch(() => undefined);
  });

  it.skipIf(!hasStripe)("réconcilie l'ordre et renvoie un rapport exploitable", async () => {
    const report = await reconcileOrderWithStripe(orderId);
    expect(report.ok).toBe(true);
    expect(report.orderId).toBe(orderId);
    expect(report.totalRefunded).toBe(500);
    expect(report.refunds).toBeDefined();
    expect(report.refunds).toHaveLength(1);
    expect(report.refunds![0].amountInCents).toBe(500);
  });
});
