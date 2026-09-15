import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { user, orders, orderItems, products, cartItems } from "@/server/db/schema";
import { createCheckout } from "@/features/checkout/application/checkout-service";
import { createOrReusePendingOrder } from "@/features/checkout/infrastructure/checkout-repo";
import { hasDatabase } from "./has-database";

/**
 * Tests d'intégration de `createCheckout` (avant la session Stripe) contre une
 * base réelle. La session Stripe elle-même n'est pas testée ici (exige un
 * compte — couvert par le runbook) : on teste les gardes-fous du service, qui
 * sont exécutés AVANT tout appel Stripe.
 */
const runId = Date.now();

describe.skipIf(!hasDatabase)("createCheckout (intégration)", () => {
  const email = `it-checkout-${runId}@biblio.test`;
  let userId = "";
  const productIds: string[] = [];
  const orderIds: string[] = [];

  async function seedProduct(priceInCents: number, currency: string, published = true) {
    const id = randomUUID();
    productIds.push(id);
    await db.insert(products).values({
      id,
      slug: `it-checkout-${runId}-${productIds.length}`,
      title: `Produit checkout ${productIds.length}`,
      author: "Tests",
      format: "epub",
      priceInCents,
      currency,
      published,
    });
    return id;
  }

  async function addToCart(productId: string) {
    await db.insert(cartItems).values({ userId, productId, quantity: 1 }).onConflictDoNothing();
  }

  beforeAll(async () => {
    const [u] = await db
      .insert(user)
      .values({ id: randomUUID(), name: "Checkout IT", email, role: "customer" })
      .returning({ id: user.id });
    userId = u.id;
  });

  afterAll(async () => {
    for (const id of orderIds) {
      await db
        .delete(orderItems)
        .where(eq(orderItems.orderId, id))
        .catch(() => undefined);
      await db
        .delete(orders)
        .where(eq(orders.id, id))
        .catch(() => undefined);
    }
    await db
      .delete(cartItems)
      .where(eq(cartItems.userId, userId))
      .catch(() => undefined);
    for (const id of productIds) {
      await db
        .delete(products)
        .where(eq(products.id, id))
        .catch(() => undefined);
    }
    await db
      .delete(user)
      .where(eq(user.id, userId))
      .catch(() => undefined);
  });

  it("panier vide → EMPTY_CART (et aucun appel Stripe)", async () => {
    const res = await createCheckout(userId);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("EMPTY_CART");
    const rows = await db.select().from(orders).where(eq(orders.userId, userId));
    expect(rows).toHaveLength(0);
  });

  it("refuse une devise étrangère au niveau PostgreSQL (boutique USD mono-devise)", async () => {
    // La contrainte SQL rend un panier multi-devise impossible à persister. La
    // règle MIXED_CURRENCY reste défensive dans le service pour les données
    // historiques, mais ce test couvre la frontière réellement atteignable.
    await expect(seedProduct(200, "eur")).rejects.toThrow("products_currency_usd");
    const rows = await db.select().from(orders).where(eq(orders.userId, userId));
    expect(rows).toHaveLength(0);
  });

  it("panier mono-devises sans clé Stripe → PAYMENT_ERROR (chemin honnête, pas de fake)", async () => {
    // STRIPE_SECRET_KEY est vide en test → getStripe() lève → 502 côté route.
    // Ce qui est prouvé ici : la garde devise est passée (pas de MIXED_CURRENCY)
    // et une commande pending A ÉTÉ CRÉÉE (le checkout a bien avancé jusqu'à
    // l'appel Stripe).
    await db.delete(cartItems).where(eq(cartItems.userId, userId));
    const usd = await seedProduct(300, "usd");
    await addToCart(usd);

    const res = await createCheckout(userId);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("PAYMENT_ERROR");
    const ordersRows = await db.select().from(orders).where(eq(orders.userId, userId));
    expect(ordersRows).toHaveLength(1);
    expect(ordersRows[0].status).toBe("pending");
    orderIds.push(ordersRows[0].id);
  });

  it("produit non publié du panier → ignoré côté serveur (source de vérité BDD)", async () => {
    await db.delete(cartItems).where(eq(cartItems.userId, userId));
    const hidden = await seedProduct(400, "usd", false);
    await addToCart(hidden);

    const res = await createCheckout(userId);
    // le panier « vide côté serveur » → EMPTY_CART, jamais un checkout secret
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("EMPTY_CART");
  });

  it("le même fingerprint concurrent réutilise une seule commande et un seul snapshot", async () => {
    const productId = await seedProduct(375, "usd");
    const input = {
      userId,
      items: [
        {
          productId,
          title: "Intention sûre",
          priceInCents: 375,
          quantity: 1,
          currency: "usd",
        },
      ],
      totalInCents: 375,
      currency: "usd",
      checkoutKey: `it-stable-intent-${randomUUID()}`,
    };

    const [first, second] = await Promise.all([
      createOrReusePendingOrder(input),
      createOrReusePendingOrder(input),
    ]);

    expect(first.id).toBe(second.id);
    expect([first.created, second.created].filter(Boolean)).toHaveLength(1);
    orderIds.push(first.id);
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, first.id));
    expect(items).toHaveLength(1);
    expect(items[0].productId).toBe(productId);
  });
});
