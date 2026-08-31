import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { orders, orderItems } from "@/server/db/schema";

/**
 * Dépôt de l'historique des commandes.
 * Lit les commandes de l'utilisateur (plus récentes d'abord) et tous leurs
 * articles en une seconde requête (snapshot des produits, jamais supprimés).
 */
export async function listOrdersWithItems(userId: string) {
  const orderRows = await db
    .select()
    .from(orders)
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.createdAt));

  if (orderRows.length === 0) return { orders: orderRows, items: [] };

  const itemRows = await db
    .select()
    .from(orderItems)
    .where(
      inArray(
        orderItems.orderId,
        orderRows.map((o) => o.id),
      ),
    );

  return { orders: orderRows, items: itemRows };
}
