import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { user, orders, orderItems, products, cartItems } from "@/server/db/schema";
import { createCheckout } from "@/features/checkout/application/checkout-service";
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

  it("panier multi-devises → MIXED_CURRENCY (L-2 : la règle est forcée, pas supposée)", async () => {
    const usd = await seedProduct(200, "usd");
    const eur = await seedProduct(200, "eur");
    await addToCart(usd);
    await addToCart(eur);

    const res = await createCheckout(userId);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("MIXED_CURRENCY");
    // aucune commande créée : le refus précède la création
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
});
