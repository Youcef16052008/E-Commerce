import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { products } from "@/server/db/schema";
import type { MappedProduct } from "../domain/gutendex-types";

/**
 * Dépôt de l'import de catalogue : recherche par `source + source_id`
 * (idempotence) et insertion d'un produit mappé.
 */

export async function findImportedProduct(sourceId: string) {
  const rows = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.source, "gutenberg"), eq(products.sourceId, sourceId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function insertImportedProduct(
  product: MappedProduct & {
    source: string;
    fileUrl: string | null;
    coverUrl: string | null;
    published: boolean;
  },
) {
  await db.insert(products).values({
    ...product,
    id: crypto.randomUUID().replace(/-/g, ""),
  });
}
