import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import Stripe from "stripe";
import { db } from "@/server/db";
import { user, orders, orderItems, products, entitlements, cartItems } from "@/server/db/schema";
import { POST } from "@/app/api/webhooks/stripe/route";
import {
  createPendingOrder,
  fulfillPaidOrder,
} from "@/features/checkout/infrastructure/checkout-repo";
import { hasDatabase } from "./has-database";

/**
 * Tests d'intégration du fulfillment (registre de durcissement H-1..H-4).
 * Parcours COMPLET : route HTTP (signature brute) → service → dépôt (transaction),
 * contre une base réelle. C'est exactement le chemin que Vercel exécute.
 *
 * - H-1 : la route attend le traitement (testé ici en appelant POST() —
 *   le comportement observable est : état BDD cohérent APRÈS la réponse 200).
 * - H-3 : `payment_status !== "paid"` → pas de fulfillment ; montant ≠ → refus.
 * - H-3b : `async_payment_succeeded` / `async_payment_failed` gérés.
 * - H-4 : fulfillment atomique et idempotent (aucun état partiel).
 */

const TEST_SECRET = "whsec_fulfillment_it_0123456789abcdef";
const stripe = new Stripe("sk_test_placeholder");

const runId = Date.now();
const userIds: string[] = [];
const productIds: string[] = [];

function sign(payload: string) {
  return stripe.webhooks.generateTestHeaderString({ payload, secret: TEST_SECRET });
}

function sessionEvent(id: string, type: string, session: Record<string, unknown>): string {
  return JSON.stringify({
    id,
    object: "event",
    type,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: { id: "cs_test_local", object: "checkout.session", ...session },
    },
  });
}

async function postWebhook(payload: string) {
  const req = new NextRequest("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": sign(payload), "content-type": "application/json" },
    body: payload,
  });
  return POST(req);
}

async function seedUser(): Promise<string> {
  const email = `it-fulfill-${runId}-${userIds.length}@biblio.test`;
  const [u] = await db
    .insert(user)
    .values({ id: randomUUID(), name: "Fulfillment IT", email, role: "customer" })
    .returning({ id: user.id });
  userIds.push(u.id);
  return u.id;
}

async function seedProduct(priceInCents: number): Promise<string> {
  const id = randomUUID();
  productIds.push(id);
  await db.insert(products).values({
    id,
    slug: `it-fulfill-${runId}-${productIds.length}`,
    title: `Produit fulfillment IT ${productIds.length}`,
    author: "Tests",
    format: "epub",
    priceInCents,
    currency: "usd",
    published: true,
  });
  return id;
}

async function getOrder(id: string) {
  const rows = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  return rows[0] ?? null;
}

async function countEntitlements(userId: string) {
  const rows = await db
    .select({ id: entitlements.id })
    .from(entitlements)
    .where(eq(entitlements.userId, userId));
  return rows.length;
}

describe.skipIf(!hasDatabase)("Fulfillment webhooks (intégration)", () => {
  beforeAll(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";
    process.env.STRIPE_WEBHOOK_SECRET = TEST_SECRET;
  });

  afterAll(async () => {
    // Nettoyage par utilisateur (couvre aussi tout ordre orphelin) :
    // orders → (cascade) order_items + entitlements ; puis produits ; puis users.
    for (const id of userIds) {
      await db.delete(orders).where(eq(orders.userId, id));
    }
    for (const id of productIds) {
      await db
        .delete(products)
        .where(eq(products.id, id))
        .catch(() => undefined);
    }
    for (const id of userIds) {
      await db.delete(user).where(eq(user.id, id));
    }
  });

  it("H-1/H-3 : paiement synchrone — la route 200 seulement après fulfillment complet", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(600);
    const { orderId } = await createPendingOrder(
      userId,
      [{ productId, title: "Livre A", priceInCents: 600, quantity: 2, currency: "usd" }],
      1200,
      "usd",
    );
    // panier non vide avant fulfillment
    await db.insert(cartItems).values({ userId, productId, quantity: 2 }).onConflictDoNothing();

    const payload = sessionEvent(`evt_sync_${orderId}`, "checkout.session.completed", {
      metadata: { orderId, userId },
      payment_status: "paid",
      amount_total: 1200,
      currency: "usd",
    });
    const res = await postWebhook(payload);

    expect(res.status).toBe(200);
    // APRÈS la réponse : l'état BDD est final (pas de travail en arrière-plan)
    const order = await getOrder(orderId);
    expect(order?.status).toBe("paid");
    expect(order?.paidAt).toBeInstanceOf(Date);
    expect(await countEntitlements(userId)).toBe(1);
    const cart = await db
      .select({ userId: cartItems.userId })
      .from(cartItems)
      .where(eq(cartItems.userId, userId));
    expect(cart).toHaveLength(0);
  });

  it("H-4 : le replay exact du même événement est idempotent (pas de double grant)", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(300);
    const { orderId } = await createPendingOrder(
      userId,
      [{ productId, title: "Livre B", priceInCents: 300, quantity: 1, currency: "usd" }],
      300,
      "usd",
    );

    const payload = sessionEvent(`evt_replay_${orderId}`, "checkout.session.completed", {
      metadata: { orderId, userId },
      payment_status: "paid",
      amount_total: 300,
      currency: "usd",
    });
    expect((await postWebhook(payload)).status).toBe(200);
    expect(await countEntitlements(userId)).toBe(1);

    // même événement Stripe (même id) renvoyé — Stripe le refait en cas de doute
    expect((await postWebhook(payload)).status).toBe(200);
    const order = await getOrder(orderId);
    expect(order?.status).toBe("paid");
    expect(await countEntitlements(userId)).toBe(1);
  });

  it("H-3 : completed avec payment_status « unpaid » (paiement différé) ne fulfille PAS", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(450);
    const { orderId } = await createPendingOrder(
      userId,
      [{ productId, title: "Livre C", priceInCents: 450, quantity: 1, currency: "usd" }],
      450,
      "usd",
    );

    const completed = sessionEvent(`evt_deferred_${orderId}`, "checkout.session.completed", {
      metadata: { orderId, userId },
      payment_status: "unpaid",
      amount_total: 450,
      currency: "usd",
    });
    expect((await postWebhook(completed)).status).toBe(200);
    expect((await getOrder(orderId))?.status).toBe("pending");
    expect(await countEntitlements(userId)).toBe(0);

    // l'argent arrive ensuite → async_payment_succeeded → fulfillment
    const succeeded = sessionEvent(
      `evt_deferred_ok_${orderId}`,
      "checkout.session.async_payment_succeeded",
      {
        metadata: { orderId, userId },
        payment_status: "paid",
        amount_total: 450,
        currency: "usd",
      },
    );
    expect((await postWebhook(succeeded)).status).toBe(200);
    expect((await getOrder(orderId))?.status).toBe("paid");
    expect(await countEntitlements(userId)).toBe(1);
  });

  it("H-3 : montant Stripe ≠ montant de la commande → fulfillment refusé", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(990);
    const { orderId } = await createPendingOrder(
      userId,
      [{ productId, title: "Livre D", priceInCents: 990, quantity: 1, currency: "usd" }],
      990,
      "usd",
    );

    const payload = sessionEvent(`evt_mismatch_${orderId}`, "checkout.session.completed", {
      metadata: { orderId, userId },
      payment_status: "paid",
      amount_total: 1, // le client n'a PAS payé le total
      currency: "usd",
    });
    expect((await postWebhook(payload)).status).toBe(200);
    expect((await getOrder(orderId))?.status).toBe("pending");
    expect(await countEntitlements(userId)).toBe(0);
  });

  it("H-3b : async_payment_failed passe la commande en « failed » (et pas plus)", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(210);
    const { orderId } = await createPendingOrder(
      userId,
      [{ productId, title: "Livre E", priceInCents: 210, quantity: 1, currency: "usd" }],
      210,
      "usd",
    );

    const failed = sessionEvent(
      `evt_async_fail_${orderId}`,
      "checkout.session.async_payment_failed",
      {
        metadata: { orderId, userId },
        payment_status: "unpaid",
        amount_total: 210,
        currency: "usd",
      },
    );
    expect((await postWebhook(failed)).status).toBe(200);
    expect((await getOrder(orderId))?.status).toBe("failed");
    expect(await countEntitlements(userId)).toBe(0);

    // l'échec ne doit PAS écraser un paiement réalisé après coup
    const succeeded = sessionEvent(
      `evt_async_ok_${orderId}`,
      "checkout.session.async_payment_succeeded",
      {
        metadata: { orderId, userId },
        payment_status: "paid",
        amount_total: 210,
        currency: "usd",
      },
    );
    expect((await postWebhook(succeeded)).status).toBe(200);
    expect((await getOrder(orderId))?.status).toBe("paid");
    expect(await countEntitlements(userId)).toBe(1);
  });

  it("H-3b : async_payment_failed ne remplace jamais une commande payée", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(150);
    const { orderId } = await createPendingOrder(
      userId,
      [{ productId, title: "Livre F", priceInCents: 150, quantity: 1, currency: "usd" }],
      150,
      "usd",
    );

    const ok = sessionEvent(`evt_paid_first_${orderId}`, "checkout.session.completed", {
      metadata: { orderId, userId },
      payment_status: "paid",
      amount_total: 150,
      currency: "usd",
    });
    expect((await postWebhook(ok)).status).toBe(200);
    expect((await getOrder(orderId))?.status).toBe("paid");

    const lateFail = sessionEvent(
      `evt_fail_late_${orderId}`,
      "checkout.session.async_payment_failed",
      {
        metadata: { orderId, userId },
        payment_status: "unpaid",
        amount_total: 150,
        currency: "usd",
      },
    );
    expect((await postWebhook(lateFail)).status).toBe(200);
    expect((await getOrder(orderId))?.status).toBe("paid");
    expect(await countEntitlements(userId)).toBe(1);
  });

  it("H-4 : fulfillPaidOrder sur commande déjà soldée → null, aucun changement", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(75);
    const { orderId } = await createPendingOrder(
      userId,
      [{ productId, title: "Livre G", priceInCents: 75, quantity: 1, currency: "usd" }],
      75,
      "usd",
    );

    expect(await fulfillPaidOrder(userId, orderId)).toBe(1);
    expect(await fulfillPaidOrder(userId, orderId)).toBeNull();
    expect(await countEntitlements(userId)).toBe(1);
  });

  it("H-4 : fulfillPaidOrder sur commande refundée → null, pas d'entitlement", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(125);
    const { orderId } = await createPendingOrder(
      userId,
      [{ productId, title: "Livre H", priceInCents: 125, quantity: 1, currency: "usd" }],
      125,
      "usd",
    );

    await db.update(orders).set({ status: "refunded" }).where(eq(orders.id, orderId));
    expect(await fulfillPaidOrder(userId, orderId)).toBeNull();
    const order = await getOrder(orderId);
    expect(order?.status).toBe("refunded");
    expect(await countEntitlements(userId)).toBe(0);
  });

  it("sécurité : orderId inconnu ou user incohérent → jamais de fulfillment", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(80);
    const { orderId } = await createPendingOrder(
      userId,
      [{ productId, title: "Livre I", priceInCents: 80, quantity: 1, currency: "usd" }],
      80,
      "usd",
    );
    const otherUserId = await seedUser();

    // metadata user qui ne correspond pas à la commande → inconnue pour lui
    const payload = sessionEvent(`evt_cross_user_${orderId}`, "checkout.session.completed", {
      metadata: { orderId, userId: otherUserId },
      payment_status: "paid",
      amount_total: 80,
      currency: "usd",
    });
    expect((await postWebhook(payload)).status).toBe(200);
    expect((await getOrder(orderId))?.status).toBe("pending");
    expect(await countEntitlements(userId)).toBe(0);
    expect(await countEntitlements(otherUserId)).toBe(0);
  });

  it("signature invalide → 400, aucun effet de bord", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(90);
    const { orderId } = await createPendingOrder(
      userId,
      [{ productId, title: "Livre J", priceInCents: 90, quantity: 1, currency: "usd" }],
      90,
      "usd",
    );

    const payload = sessionEvent(`evt_badsig_${orderId}`, "checkout.session.completed", {
      metadata: { orderId, userId },
      payment_status: "paid",
      amount_total: 90,
      currency: "usd",
    });
    const req = new NextRequest("http://localhost/api/webhooks/stripe", {
      method: "POST",
      headers: {
        "stripe-signature": sign(payload + "altéré"),
        "content-type": "application/json",
      },
      body: payload,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect((await getOrder(orderId))?.status).toBe("pending");
  });

  it("H-2 : chaque checkout crée une nouvelle commande, les anciennes pending sont purgées", async () => {
    const userId = await seedUser();
    const p1 = await seedProduct(500);
    const p2 = await seedProduct(700);

    const a = await createPendingOrder(
      userId,
      [{ productId: p1, title: "Livre P1", priceInCents: 500, quantity: 1, currency: "usd" }],
      500,
      "usd",
    );
    const b = await createPendingOrder(
      userId,
      [{ productId: p2, title: "Livre P2", priceInCents: 700, quantity: 1, currency: "usd" }],
      700,
      "usd",
    );

    expect(a.orderId).not.toBe(b.orderId);
    // l'ancienne pending A a été supprimée (avec ses items)
    expect(await getOrder(a.orderId)).toBeNull();
    const itemsA = await db.select().from(orderItems).where(eq(orderItems.orderId, a.orderId));
    expect(itemsA).toHaveLength(0);
    // la nouvelle B existe avec SON item
    expect((await getOrder(b.orderId))?.status).toBe("pending");
    const itemsB = await db.select().from(orderItems).where(eq(orderItems.orderId, b.orderId));
    expect(itemsB).toHaveLength(1);
    expect(itemsB[0].productId).toBe(p2);
  });

  it("H-2 (régression) : même total, panier différent → PAS de réutilisation de l'ancienne commande", async () => {
    const userId = await seedUser();
    const p1 = await seedProduct(500);
    const p2 = await seedProduct(500);

    const a = await createPendingOrder(
      userId,
      [{ productId: p1, title: "Livre P1", priceInCents: 500, quantity: 1, currency: "usd" }],
      500,
      "usd",
    );
    // même total (500) mais autre produit : l'ancien code réutilisait `a`
    const b = await createPendingOrder(
      userId,
      [{ productId: p2, title: "Livre P2", priceInCents: 500, quantity: 1, currency: "usd" }],
      500,
      "usd",
    );

    expect(a.orderId).not.toBe(b.orderId);
    expect(await getOrder(a.orderId)).toBeNull();
    const itemsB = await db.select().from(orderItems).where(eq(orderItems.orderId, b.orderId));
    expect(itemsB).toHaveLength(1);
    expect(itemsB[0].productId).toBe(p2);
  });

  it("H-2 : les commandes payées ne sont JAMAIS supprimées par le nettoyage", async () => {
    const userId = await seedUser();
    const p1 = await seedProduct(300);
    const p2 = await seedProduct(400);

    const a = await createPendingOrder(
      userId,
      [{ productId: p1, title: "Livre P1", priceInCents: 300, quantity: 1, currency: "usd" }],
      300,
      "usd",
    );
    expect(await fulfillPaidOrder(userId, a.orderId)).toBe(1);

    const b = await createPendingOrder(
      userId,
      [{ productId: p2, title: "Livre P2", priceInCents: 400, quantity: 1, currency: "usd" }],
      400,
      "usd",
    );

    expect((await getOrder(a.orderId))?.status).toBe("paid");
    expect(await countEntitlements(userId)).toBe(1);
    expect((await getOrder(b.orderId))?.status).toBe("pending");
  });
});
