import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { cartItems, products } from "@/server/db/schema";
import type { CartItemView, CartSummary } from "../domain/cart-types";

/**
 * Dépôt du panier. Persistance en BDD (table cart_items), liée à un utilisateur.
 * Le prix est TOUJOURS relu depuis la table `products` (source de vérité), jamais
 * depuis le client. Les produits dépubliés sont exclus de la liste.
 */
export async function getCart(userId: string): Promise<CartSummary> {
  const rows = await db
    .select({
      productId: products.id,
      slug: products.slug,
      title: products.title,
      author: products.author,
      genre: products.genre,
      format: products.format,
      coverUrl: products.coverUrl,
      quantity: cartItems.quantity,
      unitPriceInCents: products.priceInCents,
      currency: products.currency,
    })
    .from(cartItems)
    .innerJoin(products, eq(cartItems.productId, products.id))
    .where(and(eq(cartItems.userId, userId), eq(products.published, true)))
    .orderBy(products.title);

  const items: CartItemView[] = rows.map((r) => ({
    productId: r.productId,
    slug: r.slug,
    title: r.title,
    author: r.author,
    genre: r.genre,
    format: r.format,
    coverUrl: r.coverUrl,
    quantity: r.quantity,
    unitPriceInCents: r.unitPriceInCents,
    lineTotalInCents: r.unitPriceInCents * r.quantity,
    currency: r.currency,
  }));

  const totalInCents = items.reduce((sum, i) => sum + i.lineTotalInCents, 0);
  const totalQuantity = items.reduce((sum, i) => sum + i.quantity, 0);
  const currency = items[0]?.currency ?? "usd";

  return { items, totalQuantity, totalInCents, currency };
}

/**
 * Ajoute un produit au panier, avec plafond de quantité par ligne.
 * Renvoie la nouvelle quantité totale de la ligne.
 */
export async function upsertCartItem(
  userId: string,
  productId: string,
  quantity: number,
  maxQuantity: number,
) {
  const existing = await db
    .select({ quantity: cartItems.quantity })
    .from(cartItems)
    .where(and(eq(cartItems.userId, userId), eq(cartItems.productId, productId)))
    .limit(1);

  const newQuantity = Math.min((existing[0]?.quantity ?? 0) + quantity, maxQuantity);

  if (existing.length > 0) {
    await db
      .update(cartItems)
      .set({ quantity: newQuantity })
      .where(and(eq(cartItems.userId, userId), eq(cartItems.productId, productId)));
  } else {
    await db.insert(cartItems).values({ userId, productId, quantity: newQuantity });
  }

  return newQuantity;
}

export async function setCartItemQuantity(userId: string, productId: string, quantity: number) {
  const updated = await db
    .update(cartItems)
    .set({ quantity })
    .where(and(eq(cartItems.userId, userId), eq(cartItems.productId, productId)))
    .returning({ quantity: cartItems.quantity });
  return updated[0]?.quantity ?? null;
}

export async function removeCartItem(userId: string, productId: string) {
  await db
    .delete(cartItems)
    .where(and(eq(cartItems.userId, userId), eq(cartItems.productId, productId)));
}

export async function clearCart(userId: string) {
  await db.delete(cartItems).where(eq(cartItems.userId, userId));
}

/** Vérifie qu'un produit existe et est publié. */
export async function getPublishedProduct(productId: string) {
  const rows = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.published, true)))
    .limit(1);
  return rows[0] ?? null;
}
