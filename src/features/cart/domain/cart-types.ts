/**
 * Types de domaine du panier.
 * Le panier est persistant en BDD (table `cart_items`) et lié à un utilisateur.
 * Un `CartItemView` est la ligne enrichie (produit + montant calculé côté serveur).
 */

/** Bornes de quantité appliquées par ligne (partagées côté client et serveur). */
export const MIN_QUANTITY = 1;
export const MAX_QUANTITY = 10;

export interface CartItemView {
  productId: string;
  slug: string;
  title: string;
  author: string;
  genre: string | null;
  format: string;
  coverUrl: string | null;
  quantity: number;
  unitPriceInCents: number;
  lineTotalInCents: number;
  currency: string;
}

export interface CartSummary {
  items: CartItemView[];
  totalQuantity: number;
  totalInCents: number;
  currency: string;
}

/** Évènements d'erreur applicatifs du panier. */
export type CartError =
  | { code: "UNAUTHORIZED" }
  | { code: "PRODUCT_NOT_FOUND" }
  | { code: "INVALID_QUANTITY" }
  | { code: "PRODUCT_NOT_PUBLISHED" };
