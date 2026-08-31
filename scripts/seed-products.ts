/**
 * Seed de données de démonstration pour le catalogue.
 * - Idempotent : crée (ou met à jour) via le slug, ne duplique pas.
 * - Produits marqués publiés = visibles publiquement.
 * - Ne touche PAS à `file_url` sur une mise à jour : la valeur est posée par
 *   `npm run books:upload` (stockage objet).
 *
 * Usage : npm run seed:products
 */
import "./load-env";

import { db } from "../src/server/db";
import { products } from "../src/server/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { SEED_PRODUCTS } from "./seed-data";

async function main() {
  for (const p of SEED_PRODUCTS) {
    const existing = await db
      .select({ id: products.id, fileUrl: products.fileUrl })
      .from(products)
      .where(eq(products.slug, p.slug))
      .limit(1);

    if (existing.length > 0) {
      // Mise à jour : on conserve le `file_url` déjà mappé (s'il existe).
      // Monnaie de la boutique = USD (Stripe Checkout mono-devise).
      await db
        .update(products)
        .set({ ...p, currency: "usd", published: true, updatedAt: new Date() })
        .where(eq(products.slug, p.slug));
    } else {
      await db.insert(products).values({
        ...p,
        id: randomUUID(),
        currency: "usd",
        fileUrl: null,
        published: true,
      });
    }
  }
  console.log(`✓ Catalogue seeded : ${SEED_PRODUCTS.length} produits (publiés).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
