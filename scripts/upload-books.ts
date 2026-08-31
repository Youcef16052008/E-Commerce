/**
 * Upload des e-books de démonstration vers le stockage objet (MinIO/R2/S3)
 * et mapping `products.file_url = s3://<bucket>/books/<slug>.<format>`.
 *
 * Prérequis :
 * 1. `npm run seed:products` (produits en base) ;
 * 2. `npm run books:generate` (fichiers dans ./books) ;
 * 3. stockage configuré (`STORAGE_*`, voir `.env.example`).
 *
 * Idempotent : relançable sans effet de bord (écrasement des objets).
 *
 * Usage : npm run books:upload
 */
import "./load-env";

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../src/server/db";
import { products } from "../src/server/db/schema";
import { isStorageConfigured, uploadObject } from "../src/server/storage";
import { SEED_PRODUCTS, type SeedProduct } from "./seed-data";

const BOOKS_DIR = path.resolve(process.cwd(), "books");

function objectKey(p: SeedProduct): string {
  return `books/${p.slug}.${p.format}`;
}

function contentTypeFor(p: SeedProduct): string {
  return p.format === "epub" ? "application/epub+zip" : "application/pdf";
}

async function main() {
  const bucket = process.env.STORAGE_BUCKET?.trim();
  if (!isStorageConfigured() || !bucket) {
    console.error(
      "✗ Stockage non configuré. Renseignez STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY, " +
        "STORAGE_BUCKET et STORAGE_ACCOUNT_ID (R2) ou STORAGE_ENDPOINT (MinIO) dans .env.",
    );
    process.exit(1);
  }

  let uploaded = 0;
  for (const p of SEED_PRODUCTS) {
    const file = path.join(BOOKS_DIR, `${p.slug}.${p.format}`);
    if (!existsSync(file)) {
      console.warn(`~ Fichier manquant : ${file} — lancez "npm run books:generate".`);
      continue;
    }

    const existing = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.slug, p.slug))
      .limit(1);
    if (existing.length === 0) {
      console.warn(`~ Produit absent : ${p.slug} — lancez "npm run seed:products".`);
      continue;
    }

    const key = objectKey(p);
    await uploadObject(key, readFileSync(file), contentTypeFor(p));

    const fileUrl = `s3://${bucket}/${key}`;
    await db
      .update(products)
      .set({ fileUrl, updatedAt: new Date() })
      .where(eq(products.slug, p.slug));

    console.log(`✓ ${key} → ${fileUrl}`);
    uploaded += 1;
  }

  console.log(`\n✓ ${uploaded}/${SEED_PRODUCTS.length} fichiers uploadés et mappés.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
