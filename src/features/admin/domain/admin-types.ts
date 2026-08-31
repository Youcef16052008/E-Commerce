/**
 * Types de domaine de l'espace administrateur (CRUD produits + gestion commandes).
 */
import type { OrderStatus } from "@/features/checkout/domain/checkout-types";

export type AdminProductStatusFilter = "all" | "published" | "draft";

export interface AdminProductListParams {
  q?: string;
  status?: AdminProductStatusFilter;
  page?: number;
  pageSize?: number;
}

export interface AdminProductCreateInput {
  title: string;
  author: string;
  description?: string | null;
  genre?: string | null;
  language?: string | null;
  format: "epub" | "pdf";
  priceInCents: number;
  currency: "usd";
  coverUrl?: string | null;
  fileUrl?: string | null;
  published: boolean;
  slug?: string;
}

export type AdminProductUpdateInput = Partial<AdminProductCreateInput>;

export interface AdminOrderItemView {
  productId: string;
  title: string;
  quantity: number;
  priceInCents: number;
  lineTotalInCents: number;
  currency: string;
}

export interface AdminOrderView {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  status: OrderStatus;
  statusLabel: string;
  totalInCents: number;
  currency: string;
  createdAt: Date;
  paidAt: Date | null;
  itemCount: number;
  items: AdminOrderItemView[];
}

export type AdminErrorCode =
  "UNAUTHORIZED" | "FORBIDDEN" | "VALIDATION" | "NOT_FOUND" | "SLUG_TAKEN" | "PRODUCT_REFERENCED";

export type AdminError = {
  code: AdminErrorCode;
  status: number;
  message?: string;
};
