import { parseProductListQuery } from "./product-query-schema";
import { ProductListParams } from "../domain/product-types";
import {
  listPublishedProducts,
  getPublishedProductBySlug,
  listPublishedGenres,
} from "../infrastructure/product-repo";

/**
 * Service applicatif du catalogue : parse + délègue au dépôt.
 * Les données sont toujours filtrées côté serveur (produits publiés).
 */
export async function queryPublishedProducts(rawInput: unknown) {
  const query = parseProductListQuery(rawInput);
  const params: ProductListParams = {
    q: query.q,
    genre: query.genre,
    language: query.language,
    format: query.format,
    sort: query.sort,
    page: query.page,
    pageSize: query.pageSize,
  };
  return listPublishedProducts(params);
}

export async function queryProductBySlug(slug: string) {
  return getPublishedProductBySlug(slug);
}

export async function queryGenres() {
  return listPublishedGenres();
}
