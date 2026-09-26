import { and, asc, count, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/server/db";
import { products } from "@/server/db/schema";
import type { ProductListParams, ProductListResult } from "../domain/product-types";
import type { Product } from "@/server/db/schema";
import { toPrefixTsQuery } from "../domain/search-query";

/**
 * Dépôt de lecture du catalogue.
 * Ne retourne que les produits publiés (l'espace public ne voit jamais un brouillon).
 */
export async function listPublishedProducts(
  params: ProductListParams,
): Promise<ProductListResult<Product>> {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 12;
  const offset = (page - 1) * pageSize;

  const conditions = [eq(products.published, true)];

  // Recherche plein texte Postgres (L6.2) : colonne générée `search_vector`
  // (titre A > auteur B > description C > genre D), index GIN, préfixes.
  const tsQuery = toPrefixTsQuery(params.q);
  const tsq = tsQuery ? sql`to_tsquery('simple', ${tsQuery})` : null;
  if (tsq) {
    conditions.push(sql`${products.searchVector} @@ ${tsq}`);
  }
  if (params.genre) {
    conditions.push(eq(products.genre, params.genre));
  }
  if (params.language) {
    conditions.push(eq(products.language, params.language));
  }
  if (params.format) {
    conditions.push(eq(products.format, params.format));
  }

  const where = and(...conditions);

  const [{ value: total }] = await db.select({ value: count() }).from(products).where(where);

  const orderBy = ((): SQL[] => {
    // Sans tri explicite, une recherche est classée par pertinence, puis récence.
    if (tsq && (!params.sort || params.sort === "newest")) {
      return [sql`ts_rank_cd(${products.searchVector}, ${tsq}) desc`, desc(products.createdAt)];
    }
    switch (params.sort) {
      case "price_asc":
        return [asc(products.priceInCents)];
      case "price_desc":
        return [desc(products.priceInCents)];
      case "title":
        return [asc(products.title)];
      case "newest":
      default:
        return [desc(products.createdAt)];
    }
  })();

  const items = await db
    .select()
    .from(products)
    .where(where)
    .orderBy(...orderBy)
    .limit(pageSize)
    .offset(offset);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return { items, total, page, pageSize, totalPages };
}

export async function getPublishedProductBySlug(slug: string): Promise<Product | null> {
  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.slug, slug), eq(products.published, true)))
    .limit(1);
  return rows[0] ?? null;
}

/** Liste des genres en vente (pour le filtre), dérivée des produits publiés. */
export async function listPublishedGenres(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ genre: products.genre })
    .from(products)
    .where(and(eq(products.published, true), sql`${products.genre} IS NOT NULL`))
    .orderBy(asc(products.genre));
  return rows.map((r) => r.genre as string);
}
