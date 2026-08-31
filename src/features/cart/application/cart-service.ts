import { addToCartSchema, updateQuantitySchema } from "./cart-actions-schema";
import { MAX_QUANTITY } from "../domain/cart-types";
import type { CartError, CartSummary } from "../domain/cart-types";
import {
  getCart,
  upsertCartItem,
  setCartItemQuantity,
  removeCartItem,
  getPublishedProduct,
} from "../infrastructure/cart-repo";

/**
 * Service applicatif du panier.
 * - Exige un utilisateur connecté.
 * - Valide les intrants via Zod.
 * - Le prix/l'état du produit vient toujours du serveur.
 */
export async function viewCart(userId: string): Promise<CartSummary> {
  return getCart(userId);
}

export async function addToCart(
  userId: string,
  rawInput: unknown,
): Promise<{ ok: true } | { ok: false; error: CartError }> {
  const parsed = addToCartSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: { code: "INVALID_QUANTITY" } };
  }
  const { productId, quantity } = parsed.data;

  const product = await getPublishedProduct(productId);
  if (!product) {
    return { ok: false, error: { code: "PRODUCT_NOT_FOUND" } };
  }

  await upsertCartItem(userId, productId, quantity, MAX_QUANTITY);
  return { ok: true };
}

export async function updateQuantity(
  userId: string,
  productId: string,
  rawInput: unknown,
): Promise<{ ok: true } | { ok: false; error: CartError }> {
  const parsed = updateQuantitySchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: { code: "INVALID_QUANTITY" } };
  }
  await setCartItemQuantity(userId, productId, parsed.data.quantity);
  return { ok: true };
}

export async function removeFromCart(userId: string, productId: string) {
  await removeCartItem(userId, productId);
}
