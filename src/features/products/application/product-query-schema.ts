import { z } from "zod";

/**
 * Schéma de validation de la requête du catalogue (query string).
 * Centralisé aux frontières : utilisé par la page serveur et l'API.
 */
const sortEnum = z.enum(["newest", "price_asc", "price_desc", "title"]);
const formatEnum = z.enum(["epub", "pdf"]);
const PAGE_SIZE_DEFAULT = 12;
const PAGE_SIZE_MAX = 48;

export const productListQuerySchema = z.object({
  q: z.string().trim().min(0).max(120).optional().catch(undefined),
  genre: z.string().trim().max(60).optional().catch(undefined),
  language: z.string().trim().max(10).optional().catch(undefined),
  format: formatEnum.optional().catch(undefined),
  sort: sortEnum.optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).catch(PAGE_SIZE_DEFAULT),
});

export type ProductListQuery = z.infer<typeof productListQuerySchema>;
export { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX };

export function parseProductListQuery(input: unknown): ProductListQuery {
  return productListQuerySchema.parse(input);
}
