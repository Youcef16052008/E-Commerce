/**
 * Types de domaine du checkout.
 * Le montant est toujours calculé côté serveur depuis le panier (et des prix en base).
 */
export type OrderStatus = "pending" | "paid" | "fulfilled" | "failed" | "refunded";

export interface CheckoutResult {
  /** URL de redirection vers Stripe Checkout */
  url: string;
  orderId: string;
}

export type CheckoutError =
  { code: "UNAUTHORIZED" } | { code: "EMPTY_CART" } | { code: "PAYMENT_ERROR" };
