/**
 * Infra — agrégations SQL du tableau de bord admin (Slice 8).
 *
 * Chaque chiffre est calculé en base (count / sum / groupBy) : zéro N+1
 * (une poignée de requêtes agrégées, exécutées en parallèle), zéro chiffre
 * hardcodé dans le code. Les règles métier (quels statuts comptent dans le
 * revenu) viennent du domaine (`REVENUE_ORDER_STATUSES`).
 */
import { count, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { products, orders, orderItems, user } from "@/server/db/schema";
import type { OrderStatus } from "@/features/checkout/domain/checkout-types";
import {
  RECENT_ORDERS_LIMIT,
  REVENUE_ORDER_STATUSES,
  TOP_PRODUCTS_LIMIT,
  buildOrdersByStatus,
} from "../domain/admin-stats-types";
import type { AdminRecentOrder, AdminStats, AdminTopProduct } from "../domain/admin-stats-types";

/** Agrégat produits : total, publiés, brouillons (une seule requête). */
async function fetchProductTotals() {
  const [row] = await db
    .select({
      total: count(),
      published: sql<number>`count(*) filter (where ${products.published})`.mapWith(Number),
      draft: sql<number>`count(*) filter (where not ${products.published})`.mapWith(Number),
    })
    .from(products);

  return {
    productsTotal: row?.total ?? 0,
    productsPublished: row?.published ?? 0,
    productsDraft: row?.draft ?? 0,
  };
}

/** Agrégat commandes : total + répartition par statut (une seule requête groupBy). */
async function fetchOrderTotals() {
  const rows = await db
    .select({
      status: orders.status,
      count: count(),
    })
    .from(orders)
    .groupBy(orders.status);

  return rows.map((r) => ({ status: r.status as OrderStatus, count: r.count }));
}

/**
 * Agrégat revenu : `sum(total_in_cents)` + compteur, UNiquement sur les
 * statuts `paid`/`fulfilled` (règle métier du domaine). `coalesce` → 0 si
 * aucune commande éligible.
 */
async function fetchRevenue() {
  const [row] = await db
    .select({
      revenueInCents: sql<number>`coalesce(sum(${orders.totalInCents}), 0)`.mapWith(Number),
      paidOrdersCount: count(),
    })
    .from(orders)
    .where(inArray(orders.status, [...REVENUE_ORDER_STATUSES]));

  return {
    revenueInCents: row?.revenueInCents ?? 0,
    paidOrdersCount: row?.paidOrdersCount ?? 0,
  };
}

/** Nombre de clients (utilisateurs de rôle `customer` — jamais l'admin). */
async function fetchCustomersTotal() {
  const [row] = await db.select({ total: count() }).from(user).where(eq(user.role, "customer"));
  return row?.total ?? 0;
}

/** 5 dernières commandes (avec email/nom du client). */
async function fetchRecentOrders(): Promise<AdminRecentOrder[]> {
  return db
    .select({
      id: orders.id,
      userEmail: user.email,
      userName: user.name,
      status: orders.status,
      totalInCents: orders.totalInCents,
      currency: orders.currency,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .innerJoin(user, eq(orders.userId, user.id))
    .orderBy(desc(orders.createdAt))
    .limit(RECENT_ORDERS_LIMIT);
}

/**
 * Top 5 produits par unités vendues, commandes paid/fulfilled uniquement.
 * Titre repris du `title_snapshot` (fidèle à ce qui a été vendu, même si le
 * produit change de titre ensuite).
 */
async function fetchTopProducts(): Promise<AdminTopProduct[]> {
  return db
    .select({
      productId: orderItems.productId,
      title: orderItems.titleSnapshot,
      unitsSold: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`.mapWith(Number),
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(inArray(orders.status, [...REVENUE_ORDER_STATUSES]))
    .groupBy(orderItems.productId, orderItems.titleSnapshot)
    .orderBy(desc(sql`sum(${orderItems.quantity})`))
    .limit(TOP_PRODUCTS_LIMIT);
}

/**
 * Assemble les statistiques admin. Une seule fonction d'entrée : les
 * agrégats indépendants tournent en parallèle (pas de séquence séquentielle
 * ni de requête par ligne).
 */
export async function fetchAdminStats(): Promise<AdminStats> {
  const [productTotals, orderRows, revenue, customersTotal, recentOrders, topProducts] =
    await Promise.all([
      fetchProductTotals(),
      fetchOrderTotals(),
      fetchRevenue(),
      fetchCustomersTotal(),
      fetchRecentOrders(),
      fetchTopProducts(),
    ]);

  // Répartition complète (status absents → 0, helper pur du domaine) ;
  // total = somme des statuts (même requête, pas de second aller BDD).
  const ordersByStatus = buildOrdersByStatus(orderRows);
  const ordersTotal = Object.values(ordersByStatus).reduce((sum, n) => sum + n, 0);

  return {
    ...productTotals,
    ordersTotal,
    ordersByStatus,
    ...revenue,
    currency: "usd",
    customersTotal,
    recentOrders,
    topProducts,
  };
}
