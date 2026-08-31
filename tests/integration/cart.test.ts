import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { user, cartItems, products } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { addToCart, viewCart } from "@/features/cart/application/cart-service";

/**
 * Tests d'intégration du panier contre la base réelle.
 * Nécessite DATABASE_URL + migrations + seed:products.
 */
const runtime = process.env as Record<string, string>;

describe("Panier (intégration)", () => {
  const email = `it-cart-${Date.now()}@biblio.test`;
  let userId = "";
  let productId = "";

  beforeAll(async () => {
    if (!runtime.DATABASE_URL) throw new Error("DATABASE_URL manquant.");
    // utilisateur de test
    const ins = await db
      .insert(user)
      .values({ id: randomUUID(), name: "Cart IT", email, role: "customer" })
      .returning({ id: user.id });
    userId = ins[0].id;
    // un produit publié existant quelconque
    const p = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.published, true))
      .limit(1);
    expect(p).toHaveLength(1);
    productId = p[0].id;
  });

  afterAll(async () => {
    await db.delete(cartItems).where(eq(cartItems.userId, userId));
    await db.delete(user).where(eq(user.email, email));
  });

  it("ajoute un produit et calcule le total serveur", async () => {
    const res = await addToCart(userId, { productId, quantity: 2 });
    expect(res).toEqual({ ok: true });

    const cart = await viewCart(userId);
    expect(cart.totalQuantity).toBe(2);
    const line = cart.items.find((i) => i.productId === productId);
    expect(line).toBeDefined();
    expect(line!.lineTotalInCents).toBe(line!.unitPriceInCents * 2);
  });

  it("rejette une quantité hors bornes", async () => {
    const res = await addToCart(userId, { productId, quantity: 999 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("INVALID_QUANTITY");
  });
});
