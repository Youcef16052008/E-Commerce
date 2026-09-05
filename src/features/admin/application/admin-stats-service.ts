/**
 * Service applicatif — statistiques du tableau de bord admin (Slice 8).
 *
 * `viewAdminStats()` : agrégats BDD (repo) + enrichissement d'affichage
 * (libellés FR des statuts, montants et dates formatés en fr-FR).
 * Toute règle métier (quels statuts comptent dans le revenu) vit dans le
 * domaine ; ici on ne fait que transformer vers le DTO de vue.
 */
import { orderStatusLabel } from "@/features/orders/domain/order-status";
import { formatPrice } from "@/shared/lib/format";
import { fetchAdminStats } from "../infrastructure/admin-stats-repo";
import { ADMIN_ORDER_STATUSES } from "../domain/admin-stats-types";
import type { AdminStats, AdminStatsView, AdminRecentOrder } from "../domain/admin-stats-types";
import type { OrderStatus } from "@/features/checkout/domain/checkout-types";

function formatDateLabel(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function toRecentOrderView(order: AdminRecentOrder): AdminStatsView["recentOrders"][number] {
  return {
    ...order,
    statusLabel: orderStatusLabel(order.status),
    totalFormatted: formatPrice(order.totalInCents, order.currency),
    dateLabel: formatDateLabel(order.createdAt),
  };
}

/**
 * Vue complète des statistiques (DTO + libellés FR).
 * Chiffres 100 % BDD — voir `fetchAdminStats()`.
 */
export async function viewAdminStats(): Promise<AdminStatsView> {
  const stats: AdminStats = await fetchAdminStats();

  const ordersByStatusLabel = {} as Record<OrderStatus, string>;
  for (const status of ADMIN_ORDER_STATUSES) {
    ordersByStatusLabel[status] = orderStatusLabel(status);
  }

  return {
    ...stats,
    revenueFormatted: formatPrice(stats.revenueInCents, stats.currency),
    ordersByStatusLabel,
    recentOrders: stats.recentOrders.map(toRecentOrderView),
  };
}
