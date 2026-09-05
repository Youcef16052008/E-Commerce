/**
 * Domaine — statistiques du tableau de bord admin (Slice 8).
 *
 * Règle métier centrale : le revenu cumule UNIQUEMENT les commandes dont le
 * statut est `paid` ou `fulfilled`. Les commandes `pending`, `failed` et
 * `refunded` n'apportent JAMAIS au revenu (elles peuvent en revanche
 * apparaître dans le compteur total et la répartition par statut).
 *
 * Tous les types ici sont des DTO purs (aucun `any`, aucune dépendance BDD) ;
 * les agrégations SQL vivent dans `infrastructure/admin-stats-repo.ts`.
 */
import type { OrderStatus } from "@/features/checkout/domain/checkout-types";

/** Énumération complète des statuts (ordre d'affichage stable). */
export const ADMIN_ORDER_STATUSES: readonly OrderStatus[] = [
  "pending",
  "paid",
  "fulfilled",
  "failed",
  "refunded",
];

/** Statuts qui comptent dans le revenu (jamais pending/failed/refunded). */
export const REVENUE_ORDER_STATUSES: readonly OrderStatus[] = ["paid", "fulfilled"];

/** Nombre de dernières commandes affichées sur le tableau de bord. */
export const RECENT_ORDERS_LIMIT = 5;

/** Nombre de top produits affichés (par unités vendues, paid/fulfilled). */
export const TOP_PRODUCTS_LIMIT = 5;

/** Vrai si ce statut alimente le revenu (paid + fulfilled uniquement). */
export function isRevenueStatus(status: OrderStatus): boolean {
  return REVENUE_ORDER_STATUSES.includes(status);
}

/** Répartition par statut initialisée à zéro pour TOUS les status connus. */
export function emptyOrdersByStatus(): Record<OrderStatus, number> {
  const record = {} as Record<OrderStatus, number>;
  for (const status of ADMIN_ORDER_STATUSES) {
    record[status] = 0;
  }
  return record;
}

/**
 * Conduit des lignes `groupBy` (`{ status, count }`) vers une répartition
 * complète : les status absents de la base restent à 0 (jamais `undefined`).
 * Pure et testée — aucune dépendance BDD.
 */
export function buildOrdersByStatus(
  rows: { status: OrderStatus; count: number }[],
): Record<OrderStatus, number> {
  const record = emptyOrdersByStatus();
  for (const row of rows) {
    if (row.status in record) {
      record[row.status] += row.count;
    }
  }
  return record;
}

/** Client : dernière commande (aperçu du tableau de bord). */
export interface AdminRecentOrder {
  id: string;
  userEmail: string;
  userName: string;
  status: OrderStatus;
  totalInCents: number;
  currency: string;
  createdAt: Date;
}

/** Produit le plus vendu (aperçu du tableau de bord). */
export interface AdminTopProduct {
  productId: string;
  title: string;
  unitsSold: number;
}

/**
 * Chiffres du tableau de bord admin — TOUS issus de la BDD (zéro hardcode).
 * `revenueInCents` / `paidOrdersCount` ne comptent que paid + fulfilled.
 */
export interface AdminStats {
  productsTotal: number;
  productsPublished: number;
  productsDraft: number;
  ordersTotal: number;
  ordersByStatus: Record<OrderStatus, number>;
  revenueInCents: number;
  currency: "usd";
  paidOrdersCount: number;
  customersTotal: number;
  recentOrders: AdminRecentOrder[];
  topProducts: AdminTopProduct[];
}

/** Dernière commande, enrichie pour l'affichage (libellés + formats FR). */
export interface AdminRecentOrderView extends AdminRecentOrder {
  statusLabel: string;
  totalFormatted: string;
  dateLabel: string;
}

/**
 * DTO de vue du tableau de bord : `AdminStats` + éléments d'affichage
 * (montant formaté, libellés FR des statuts, commandes formatées).
 * Les nombres restent identiques aux agrégats BDD — aucun calcul ici.
 */
export interface AdminStatsView extends AdminStats {
  revenueFormatted: string;
  ordersByStatusLabel: Record<OrderStatus, string>;
  recentOrders: AdminRecentOrderView[];
}
