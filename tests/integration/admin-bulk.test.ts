import { describe, expect, it, afterAll } from "vitest";
import { like } from "drizzle-orm";
import { db } from "@/server/db";
import { products } from "@/server/db/schema";
import {
  bulkPublish,
  exportProductsCsv,
  importProductsCsv,
} from "@/features/admin/application/admin-bulk-service";
import { parseProductCsv } from "@/features/admin/domain/product-csv";
import { hasDatabase } from "./has-database";

/** Admin en masse (L6.3) : import simulé/appliqué (upsert slug), export, publication groupée. */
const tag = `it-bulk-${Date.now()}`;

describe.skipIf(!hasDatabase)("Admin bulk / CSV (intégration)", () => {
  afterAll(async () => {
    await db.delete(products).where(like(products.slug, `${tag}%`));
  });

  const csv = (price: number, published: string) =>
    [
      "slug,title,author,format,price_cents,published,genre",
      `${tag}-a,Alpha ${tag},Auteur A,epub,${price},${published},Roman`,
      `${tag}-b,Beta ${tag},Auteur B,pdf,${price},${published},Essai`,
    ].join("\n");

  it("simulation : plan sans écriture", async () => {
    const r = await importProductsCsv(csv(50, "false"));
    expect(r).toMatchObject({ dryRun: true, parsed: 2, created: 0, updated: 0 });
    expect(r.toCreate.sort()).toEqual([`${tag}-a`, `${tag}-b`]);
    expect(
      await db
        .select()
        .from(products)
        .where(like(products.slug, `${tag}%`)),
    ).toHaveLength(0);
  });

  it("application : création puis mise à jour par slug (upsert)", async () => {
    const first = await importProductsCsv(csv(50, "false"), { dryRun: false });
    expect(first).toMatchObject({ created: 2, updated: 0, errors: [] });
    const second = await importProductsCsv(csv(75, "true"), { dryRun: false });
    expect(second).toMatchObject({ created: 0, updated: 2 });
    const rows = await db
      .select()
      .from(products)
      .where(like(products.slug, `${tag}%`));
    expect(rows.map((r) => r.priceInCents)).toEqual([75, 75]);
    expect(rows.every((r) => r.published)).toBe(true);
  });

  it("une erreur de ligne bloque toute l'écriture", async () => {
    const bad = csv(50, "false") + `\n${tag}-c,Gamma,Auteur C,epub,-5,true,`;
    const r = await importProductsCsv(bad, { dryRun: false });
    expect(r.errors).toHaveLength(1);
    expect(r.created + r.updated).toBe(0);
    const rows = await db
      .select()
      .from(products)
      .where(like(products.slug, `${tag}%`));
    expect(rows.map((r) => r.priceInCents)).toEqual([75, 75]); // inchangé
  });

  it("publication groupée + export CSV filtré", async () => {
    const rows = await db
      .select({ id: products.id })
      .from(products)
      .where(like(products.slug, `${tag}%`));
    const res = await bulkPublish({ action: "unpublish", ids: rows.map((r) => r.id) });
    expect(res).toEqual({ ok: true, updated: 2, action: "unpublish" });

    const out = await exportProductsCsv({ q: tag, status: "draft" });
    const parsed = parseProductCsv(out);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows.map((r) => r.slug).sort()).toEqual([`${tag}-a`, `${tag}-b`]);
    expect(parsed.rows.every((r) => r.published === false)).toBe(true);
    expect(out.startsWith("slug,title,author")).toBe(true);
  });
});
