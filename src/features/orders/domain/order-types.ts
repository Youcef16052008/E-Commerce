/**
 * Types de domaine de l'historique des commandes.
 * Une `OrderView` est une commande enrichie : statut lisible + articles (snapshot).
 */
import type { OrderStatus } from "@/features/checkout/domain/checkout-types";

export interface OrderItemView {
  productId: string;
  title: string;
  quantity: number;
  priceInCents: number;
  lineTotalInCents: number;
  currency: string;
}

export interface OrderView {
  id: string;
  status: OrderStatus;
  statusLabel: string;
  totalInCents: number;
  currency: string;
  createdAt: Date;
  paidAt: Date | null;
  itemCount: number;
  items: OrderItemView[];
}

export type OrdersError = { code: "UNAUTHORIZED" };
