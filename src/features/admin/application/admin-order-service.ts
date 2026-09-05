/**
 * Service applicatif admin — gestion des commandes.
 * Liste toutes les commandes (avec email/nom client) et permet de changer le statut.
 */
import { adminOrderStatusSchema } from "../domain/admin-schemas";
import type { AdminError, AdminOrderView } from "../domain/admin-types";
import {
  listAllOrdersWithUsers,
  getOrderById,
  updateOrderStatusById,
  refundOrderById,
} from "../infrastructure/admin-repo";
import { orderStatusLabel } from "@/features/orders/domain/order-status";
import { canTransition } from "@/features/orders/domain/order-transitions";
import type { OrderStatus } from "@/features/checkout/domain/checkout-types";
import type { Order } from "@/server/db/schema";

export async function viewAllOrders(): Promise<AdminOrderView[]> {
  const { orders, items } = await listAllOrdersWithUsers();

  const itemsByOrder = new Map<string, typeof items>();
  for (const item of items) {
    const list = itemsByOrder.get(item.orderId) ?? [];
    list.push(item);
    itemsByOrder.set(item.orderId, list);
  }

  return orders.map((order) => {
    const orderItems = itemsByOrder.get(order.id) ?? [];
    const status = order.status as OrderStatus;
    return {
      id: order.id,
      userId: order.userId,
      userEmail: order.userEmail,
      userName: order.userName,
      status,
      statusLabel: orderStatusLabel(status),
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

export async function updateOrderStatus(
  id: string,
  raw: unknown,
): Promise<{ ok: true; order: Order } | { ok: false; error: AdminError }> {
  const existing = await getOrderById(id);
  if (!existing) {
    return { ok: false, error: { code: "NOT_FOUND", status: 404 } };
  }

  const parsed = adminOrderStatusSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "VALIDATION", status: 400, message: parsed.error.message },
    };
  }

  // L-1 : machine à états — toute transition non autorisée est refusée
  // (refunded/failed terminaux, pas de paid → pending, pas d'identité…).
  if (!canTransition(existing.status as OrderStatus, parsed.data.status)) {
    return {
      ok: false,
      error: {
        code: "INVALID_STATE",
        status: 409,
        message: `Transition impossible : ${existing.status} → ${parsed.data.status}.`,
      },
    };
  }

  // H-6 : le remboursement révoque les entitlements accordés par cette
  // commande (même transaction, voir refundOrderById).
  if (parsed.data.status === "refunded") {
    const order = await refundOrderById(id);
    if (!order) {
      return { ok: false, error: { code: "NOT_FOUND", status: 404 } };
    }
    return { ok: true, order };
  }

  const order = await updateOrderStatusById(id, parsed.data.status);
  if (!order) {
    return { ok: false, error: { code: "NOT_FOUND", status: 404 } };
  }
  return { ok: true, order };
}
