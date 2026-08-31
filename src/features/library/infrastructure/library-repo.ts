import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { entitlements, products } from "@/server/db/schema";
import type { LibraryItem } from "../domain/library-types";

/**
 * Dépôt de la bibliothèque : accès aux droits d'achat (entitlements) de l'utilisateur.
 * Les produits retirés du catalogue restent visibles dans la bibliothèque (l'achat
 * demeure), donc on joint `products` SANS filtre `published`.
 */
export async function listUserLibrary(userId: string): Promise<LibraryItem[]> {
  const rows = await db
    .select({
      productId: products.id,
      slug: products.slug,
      title: products.title,
      author: products.author,
      genre: products.genre,
      format: products.format,
      coverUrl: products.coverUrl,
      fileUrl: products.fileUrl,
      purchasedAt: entitlements.createdAt,
    })
    .from(entitlements)
    .innerJoin(products, eq(entitlements.productId, products.id))
    .where(eq(entitlements.userId, userId))
    .orderBy(desc(entitlements.createdAt));

  return rows;
}

/** Vérifie si l'utilisateur a un droit d'accès sur le produit donné. */
export async function userHasEntitlement(userId: string, productId: string): Promise<boolean> {
  const rows = await db
    .select({ id: entitlements.id })
    .from(entitlements)
    .where(and(eq(entitlements.userId, userId), eq(entitlements.productId, productId)))
    .limit(1);
  return rows.length > 0;
}

/** Récupère le fichier associé à un produit (pour download). */
export async function getProductFile(productId: string) {
  const rows = await db
    .select({ fileUrl: products.fileUrl, id: products.id })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  return rows[0] ?? null;
}
