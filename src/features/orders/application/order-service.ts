import { listOrdersWithItems } from "../infrastructure/order-repo";
import { orderStatusLabel } from "../domain/order-status";
import type { OrderStatus } from "@/features/checkout/domain/checkout-types";
import type { OrderView } from "../domain/order-types";

/**
 * Service applicatif de l'historique des commandes.
 * - Liste uniquement les commandes de l'utilisateur (aucune fuite entre comptes).
 * - Statuts libellés en français (cohérents avec le checkout).
 * - Les totaux sont relus depuis la base (source de vérité), jamais recalculés
 *   depuis le client.
 */
export async function viewOrders(userId: string): Promise<OrderView[]> {
  const { orders, items } = await listOrdersWithItems(userId);

  const itemsByOrder = new Map<string, typeof items>();
  for (const item of items) {
    const list = itemsByOrder.get(item.orderId) ?? [];
    list.push(item);
    itemsByOrder.set(item.orderId, list);
  }

  return orders.map((order) => {
    const orderItems = itemsByOrder.get(order.id) ?? [];
    return {
      id: order.id,
      status: order.status as OrderStatus,
      statusLabel: orderStatusLabel(order.status as OrderStatus),
      totalInCents: order.totalInCents,
      currency: order.currency,
      createdAt: order.createdAt,
      paidAt: order.paidAt,
      itemCount: orderItems.reduce((sum, i) => sum + (i.quantity ?? 1), 0),
      items: orderItems.map((i) => ({
        productId: i.productId,
        title: i.titleSnapshot,
        quantity: i.quantity ?? 1,
        priceInCents: i.priceInCents,
        lineTotalInCents: i.priceInCents * (i.quantity ?? 1),
        currency: i.currency,
      })),
    };
  });
}
