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
  | { code: "UNAUTHORIZED" }
  | { code: "EMPTY_CART" }
  | { code: "MIXED_CURRENCY" }
  | { code: "INVALID_LICENSE_QUANTITY" }
  | { code: "ALREADY_OWNED"; productIds: string[] }
  | { code: "CHECKOUT_NOT_AVAILABLE" }
  | { code: "PAYMENT_ERROR" };
