import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { products } from "@/server/db/schema";
import {
  bulkActionSchema,
  parseProductCsv,
  productsToCsv,
  type ProductCsvRow,
} from "../domain/product-csv";
import type { AdminError } from "../domain/admin-types";
import { listAllProducts } from "../infrastructure/admin-repo";
import { adminProductListQuerySchema } from "../domain/admin-schemas";

/**
 * Admin en masse (L6.3) : publication groupée, export CSV, import CSV (upsert
 * par slug, mode simulation par défaut). Aucun lien avec le paiement.
 */

export async function bulkPublish(
  raw: unknown,
): Promise<{ ok: true; updated: number; action: string } | { ok: false; error: AdminError }> {
  const parsed = bulkActionSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION", status: 400, message: parsed.error.message } };
  }
  const { action, ids } = parsed.data;
  const rows = await db
    .update(products)
    .set({ published: action === "publish", updatedAt: new Date() })
    .where(inArray(products.id, ids))
    .returning({ id: products.id });
  return { ok: true, updated: rows.length, action };
}

/** Export CSV : mêmes filtres que la liste (`q`, `status`), sans pagination (max 5 000). */
export async function exportProductsCsv(rawQuery: unknown): Promise<string> {
  const q = adminProductListQuerySchema.parse(rawQuery);
  const result = await listAllProducts({
    q: q.q,
    status: q.status ?? "all",
    page: 1,
    pageSize: 5000,
  });
  const rows: ProductCsvRow[] = result.items.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    author: p.author,
    genre: p.genre,
    language: p.language,
    format: p.format,
    priceInCents: p.priceInCents,
    currency: p.currency,
    published: p.published,
    description: p.description,
    coverUrl: p.coverUrl,
    fileUrl: p.fileUrl,
  }));
  return productsToCsv(rows);
}

export interface ImportReport {
  dryRun: boolean;
  parsed: number;
  errors: { line: number; message: string }[];
  toCreate: string[];
  toUpdate: string[];
  created: number;
  updated: number;
}

/**
 * Import CSV. `dryRun=true` (défaut) : analyse + plan (créations / mises à jour)
 * sans écrire. Toute erreur de validation bloque l'écriture entière : un fichier
 * partiellement appliqué est pire qu'un fichier refusé.
 */
export async function importProductsCsv(
  text: string,
  options: { dryRun?: boolean } = {},
): Promise<ImportReport> {
  const dryRun = options.dryRun ?? true;
  const { rows, errors } = parseProductCsv(text);
  const slugs = rows.map((r) => r.slug);
  const existing = slugs.length
    ? await db
        .select({ id: products.id, slug: products.slug })
        .from(products)
        .where(inArray(products.slug, slugs))
    : [];
  const bySlug = new Map(existing.map((e) => [e.slug, e.id]));
  const toCreate = rows.filter((r) => !bySlug.has(r.slug)).map((r) => r.slug);
  const toUpdate = rows.filter((r) => bySlug.has(r.slug)).map((r) => r.slug);

  const report: ImportReport = {
    dryRun,
    parsed: rows.length,
    errors,
    toCreate,
    toUpdate,
    created: 0,
    updated: 0,
  };
  if (dryRun || errors.length > 0 || rows.length === 0) return report;

  await db.transaction(async (tx) => {
    for (const r of rows) {
      const data = {
        slug: r.slug,
        title: r.title,
        author: r.author,
        description: r.description,
        genre: r.genre,
        language: r.language ?? "fr",
        format: r.format,
        priceInCents: r.priceInCents,
        currency: r.currency,
        coverUrl: r.coverUrl,
        fileUrl: r.fileUrl,
        published: r.published,
      };
      const id = bySlug.get(r.slug);
      if (id) {
        await tx
          .update(products)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(products.id, id));
        report.updated++;
      } else {
        await tx.insert(products).values({ id: randomUUID(), ...data });
        report.created++;
      }
    }
  });
  return report;
}
