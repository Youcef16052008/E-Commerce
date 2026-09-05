/**
 * Machine à états des statuts de commande (registre L-1).
 *
 * Transitions autorisées (hors webhook, qui a ses propres gardes au dépôt) :
 *
 *   pending   → paid, failed   (confirmation manuelle / échec constaté)
 *   paid      → fulfilled, refunded
 *   fulfilled → refunded
 *   failed    → (terminal — un nouvel achat crée une nouvelle commande)
 *   refunded  → (terminal)
 *
 * Tout le reste est refusé (y compris la « transition » identité) : on n'édite
 * pas l'historique, on crée des commandes.
 */
import type { OrderStatus } from "@/features/checkout/domain/checkout-types";

export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["paid", "failed"],
  paid: ["fulfilled", "refunded"],
  fulfilled: ["refunded"],
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
