import { describe, expect, it } from "vitest";
import {
  PRODUCT_CSV_COLUMNS,
  bulkActionSchema,
  parseCsv,
  parseProductCsv,
  productsToCsv,
} from "@/features/admin/domain/product-csv";

/** CSV produits (L6.3) : analyse RFC 4180, validation, aller-retour. */

describe("parseCsv", () => {
  it("guillemets, virgules et retours à la ligne dans les champs, BOM, CRLF", () => {
    const text = '\uFEFFa,b\r\n"x, y","li""ne\nbreak"\r\n\r\n';
    expect(parseCsv(text)).toEqual([
      ["a", "b"],
      ["x, y", 'li"ne\nbreak'],
    ]);
  });
  it("dernière ligne sans retour final", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseProductCsv", () => {
  const header = "slug,title,author,format,price_cents,published,genre,currency";
  it("colonnes dans un ordre libre, casse ignorée, défauts appliqués", () => {
    const r = parseProductCsv(
      `${header.toUpperCase()}\ncandide,Candide,Voltaire,EPUB,50,oui,Conte,`,
    );
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({
      slug: "candide",
      format: "epub",
      priceInCents: 50,
      published: true,
      genre: "Conte",
      currency: "usd",
      description: null,
      coverUrl: null,
      fileUrl: null,
    });
  });
  it("colonnes obligatoires manquantes → erreur ligne 1", () => {
    const r = parseProductCsv("slug,title\na,b");
    expect(r.rows).toEqual([]);
    expect(r.errors[0]).toMatchObject({ line: 1 });
    expect(r.errors[0]!.message).toContain("author");
  });
  it("erreurs ligne à ligne : slug invalide, prix négatif, format inconnu, doublon", () => {
    const r = parseProductCsv(
      [
        header,
        "Bad Slug,T,A,epub,50,true,,",
        "ok,T,A,epub,-1,true,,",
        "ok2,T,A,mobi,50,true,,",
        "dup,T,A,epub,50,true,,",
        "dup,T,A,epub,50,true,,",
      ].join("\n"),
    );
    expect(r.rows.map((x) => x.slug)).toEqual(["dup"]);
    expect(r.errors.map((e) => e.line)).toEqual([2, 3, 4, 6]);
    expect(r.errors[3]!.message).toContain("double");
  });
  it("fichier vide", () => {
    expect(parseProductCsv("").errors[0]!.message).toBe("Fichier vide");
  });
});

describe("productsToCsv ↔ parseProductCsv", () => {
  it("aller-retour sans perte (y compris description multi-ligne et guillemets)", () => {
    const row = {
      id: "id-1",
      slug: "les-miserables",
      title: 'Les "Misérables", tome 1',
      author: "Victor Hugo",
      genre: "Roman",
      language: "fr",
      format: "epub" as const,
      priceInCents: 50,
      currency: "usd",
      published: true,
      description: "Ligne 1\nLigne 2, avec virgule",
      coverUrl: "https://example.test/c.jpg",
      fileUrl: null,
    };
    const csv = productsToCsv([row]);
    expect(csv.split("\r\n")[0]).toBe(PRODUCT_CSV_COLUMNS.join(","));
    const back = parseProductCsv(csv);
    expect(back.errors).toEqual([]);
    const { id: _ignored, ...expected } = row;
    void _ignored;
    expect(back.rows[0]).toEqual({ ...expected, id: null });
  });
});

describe("bulkActionSchema", () => {
  it("borne la sélection et l'action", () => {
    expect(bulkActionSchema.safeParse({ action: "publish", ids: ["a"] }).success).toBe(true);
    expect(bulkActionSchema.safeParse({ action: "delete", ids: ["a"] }).success).toBe(false);
    expect(bulkActionSchema.safeParse({ action: "publish", ids: [] }).success).toBe(false);
  });
});
