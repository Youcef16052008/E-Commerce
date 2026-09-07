import type { OrderStatus } from "@/features/checkout/domain/checkout-types";

/**
 * Manual, operational transitions only.
 *
 * Payment states (`pending`, `paid`, `failed`, `refunded`) are facts supplied
 * by Stripe webhooks and refund workflows, never an admin dropdown. An operator
 * can only acknowledge that a paid digital order has been fulfilled.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: [],
  paid: ["fulfilled"],
  fulfilled: [],
  failed: [],
  refunded: [],
};

/** True si la transition `from → to` est autorisée (jamais `from → from`). */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return false;
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Transitions autorisées depuis un statut (pour l'UI : options du sélecteur). */
export function allowedTransitions(from: OrderStatus): readonly OrderStatus[] {
  return ORDER_TRANSITIONS[from] ?? [];
}
