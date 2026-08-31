import { z } from "zod";
import { MAX_QUANTITY, MIN_QUANTITY } from "../domain/cart-types";

/**
 * Schémas de validation des actions du panier (côté serveur).
 * Centralisés aux frontières — le client ne décide jamais du prix ni de la quantité libre.
 */
export const addToCartSchema = z.object({
  productId: z.string().trim().min(1).max(64),
  quantity: z.coerce.number().int().min(MIN_QUANTITY).max(MAX_QUANTITY).default(1),
});

export const updateQuantitySchema = z.object({
  quantity: z.coerce.number().int().min(MIN_QUANTITY).max(MAX_QUANTITY),
});

export type AddToCartInput = z.infer<typeof addToCartSchema>;
export type UpdateQuantityInput = z.infer<typeof updateQuantitySchema>;
