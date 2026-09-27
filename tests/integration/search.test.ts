import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { like } from "drizzle-orm";
import { db } from "@/server/db";
import { products } from "@/server/db/schema";
import { listPublishedProducts } from "@/features/products/infrastructure/product-repo";
import { hasDatabase } from "./has-database";

/**
 * Recherche plein texte (L6.2) contre une base réelle : colonne générée
 * `search_vector` + `biblio_unaccent` + index GIN (migration 0009).
 */
const runId = Date.now();
const tag = `it-fts-${runId}`;

describe.skipIf(!hasDatabase)("Recherche catalogue FTS (intégration)", () => {
  beforeAll(async () => {
    await db.insert(products).values([
      {
        id: randomUUID(),
        slug: `${tag}-miserables`,
        title: `Les Misérables ${tag}`,
        author: "Victor Hugo",
        description: "Jean Valjean, Cosette, les barricades de Paris.",
        genre: "Roman",
        priceInCents: 50,
        published: true,
      },
      {
        id: randomUUID(),
        slug: `${tag}-hugo-poemes`,
        title: `Les Contemplations ${tag}`,
        author: "Victor Hugo",
        description: "Recueil de poèmes.",
        genre: "Poésie",
        priceInCents: 50,
        published: true,
      },
      {
        id: randomUUID(),
        slug: `${tag}-brouillon`,
        title: `Misérables brouillon ${tag}`,
        author: "Anonyme",
        priceInCents: 50,
        published: false,
      },
      {
        id: randomUUID(),
        slug: `${tag}-valjean-desc`,
        title: `Un titre neutre ${tag}`,
        author: "Quelqu'un",
        description: "Ce livre parle longuement de Valjean.",
        genre: "Essai",
        priceInCents: 50,
        published: true,
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(products).where(like(products.slug, `${tag}%`));
  });

  const titles = async (q: string, sort?: "newest" | "title" | "price_asc" | "price_desc") =>
    (await listPublishedProducts({ q: `${q} ${tag}`, pageSize: 48, sort })).items.map(
      (p) => p.title,
    );

  it("accent-insensible dans les deux sens", async () => {
    expect(await titles("miserables")).toEqual([`Les Misérables ${tag}`]);
    expect(await titles("MISÉRABLES")).toEqual([`Les Misérables ${tag}`]);
  });

  it("préfixe : « miser » suffit ; les brouillons restent invisibles", async () => {
    const r = await titles("miser");
    expect(r).toEqual([`Les Misérables ${tag}`]);
    expect(r.some((t) => t.includes("brouillon"))).toBe(false);
  });

  it("cherche aussi l'auteur et la description ; le titre pèse plus", async () => {
    expect((await titles("hugo")).sort()).toEqual(
      [`Les Misérables ${tag}`, `Les Contemplations ${tag}`].sort(),
    );
    // « valjean » : présent en description (C) des deux ; ordre stable par pertinence puis récence
    const v = await titles("valjean");
    expect(v).toHaveLength(2);
    expect(v).toContain(`Un titre neutre ${tag}`);
  });

  it("plusieurs mots = ET ; tri explicite respecté", async () => {
    expect(await titles("hugo cosette")).toEqual([`Les Misérables ${tag}`]);
    expect(await titles("hugo", "title")).toEqual([
      `Les Contemplations ${tag}`,
      `Les Misérables ${tag}`,
    ]);
  });

  it("entrée hostile : opérateurs tsquery neutralisés, pas d'erreur SQL", async () => {
    const r = await listPublishedProducts({ q: "hugo & (miser:* | !x) '" + tag, pageSize: 48 });
    expect(r.total).toBeGreaterThanOrEqual(0);
  });
});
