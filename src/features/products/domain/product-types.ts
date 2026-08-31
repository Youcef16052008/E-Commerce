/**
 * Types de domaine du catalogue.
 * Les types de colonnes Drizzle sont exposés via `Product` (schema.ts) ;
 * ce module définit les types applicatifs (paramètres, valeurs de tri).
 */
export type ProductFormat = "epub" | "pdf";
export type SortKey = "newest" | "price_asc" | "price_desc" | "title";

export interface ProductListParams {
  q?: string;
  genre?: string;
  language?: string;
  format?: ProductFormat;
  sort?: SortKey;
  page?: number;
  pageSize?: number;
}

export interface ProductListResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
