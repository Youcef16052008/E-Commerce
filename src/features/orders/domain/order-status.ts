/**
 * Libellés et styles de statut des commandes (fonctions pures, testées).
 * Cohérence : mêmes statuts que le checkout (pending → paid → fulfilled, etc.).
 */
import type { OrderStatus } from "@/features/checkout/domain/checkout-types";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "En attente de paiement",
  paid: "Payée",
  fulfilled: "Livrée",
  failed: "Échec du paiement",
  refunded: "Remboursée",
};

export const ORDER_STATUS_STYLES: Record<OrderStatus, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-800",
  paid: "border-emerald-200 bg-emerald-50 text-emerald-800",
  fulfilled: "border-sky-200 bg-sky-50 text-sky-800",
  failed: "border-red-200 bg-red-50 text-red-800",
  refunded: "border-neutral-200 bg-neutral-100 text-neutral-600",
};

export function orderStatusLabel(status: OrderStatus): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}

export function orderStatusStyle(status: OrderStatus): string {
  return ORDER_STATUS_STYLES[status] ?? ORDER_STATUS_STYLES.pending;
}
