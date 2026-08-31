import { describe, expect, it } from "vitest";
import {
  DEFAULT_LICENSE,
  SOURCE_LABEL,
  isImportable,
  mapAuthor,
  mapBook,
  mapDescription,
  mapGenre,
  pickFormat,
  slugify,
} from "@/features/catalog-import/domain/gutendex-mapper";
import type { GutendexBook, ImportOptions } from "@/features/catalog-import/domain/gutendex-types";

/**
 * Tests unitaires du mapping Gutendex → produit Biblio.
 * Fonctions pures : aucun réseau, aucune base.
 */

const OPTIONS: ImportOptions = {
  limit: 500,
  languages: [],
  priceInCents: 50,
  publish: true,
  minDownloads: 0,
};

const FIXTURE: GutendexBook = {
  id: 1342,
  title: "Pride and Prejudice",
  subjects: ["Fiction", "Courtship -- Fiction", "Romance"],
  authors: [{ name: "Austen, Jane", birth_year: 1775, death_year: 1817 }],
  summaries: ["A novel about manners and marriage."],
  translators: [],
  bookshelves: ["Harvard Classics"],
  languages: ["en"],
  copyright: false,
  media_type: "text",
  formats: {
    "application/epub+zip": "https://www.gutenberg.org/ebooks/1342.epub3.images",
    "image/jpeg": "https://www.gutenberg.org/cache/epub/1342/pg1342.cover.small.jpg",
    "text/html": "https://www.gutenberg.org/files/1342/1342-h/1342-h.htm",
  },
  download_count: 23870,
};

describe("slugify", () => {
  it("normalise les accents, minuscules et tirets", () => {
    expect(slugify("L'Été des Étoiles")).toBe("l-ete-des-etoiles");
    expect(slugify("  C++ : Le Guide  ")).toBe("c-le-guide");
  });
});

describe("pickFormat", () => {
  it("préfère l'EPUB", () => {
    expect(pickFormat({ "application/pdf": "x", "application/epub+zip": "y" })).toBe("epub");
  });
  it("accepte le PDF en secours", () => {
    expect(pickFormat({ "application/pdf": "x" })).toBe("pdf");
  });
  it("refuse un livre sans format supporté", () => {
    expect(pickFormat({ "text/html": "x" })).toBeNull();
  });
});

describe("mapAuthor / mapDescription / mapGenre", () => {
  it("extrait l'auteur principal", () => {
    expect(mapAuthor(FIXTURE)).toBe("Austen, Jane");
  });
  it("utilise un traducteur si aucun auteur", () => {
    expect(
      mapAuthor({
        ...FIXTURE,
        authors: [],
        translators: [{ name: "Traducteur, X", birth_year: null, death_year: null }],
      }),
    ).toBe("Traducteur, X");
  });
  it("place un placeholder sans personne", () => {
    expect(mapAuthor({ ...FIXTURE, authors: [], translators: [] })).toBe("Auteur inconnu");
  });
  it("description = résumé sinon sujets", () => {
    expect(mapDescription(FIXTURE)).toBe("A novel about manners and marriage.");
    expect(mapDescription({ ...FIXTURE, summaries: [] })).toBe(
      "Fiction — Courtship -- Fiction — Romance",
    );
  });
  it("classe le genre", () => {
    expect(mapGenre(FIXTURE)).toBe("Romance");
    expect(mapGenre({ ...FIXTURE, subjects: [], bookshelves: ["Children's Literature"] })).toBe(
      "Jeunesse & Contes",
    );
    expect(mapGenre({ ...FIXTURE, subjects: [], bookshelves: [] })).toBeNull();
  });
});

describe("isImportable", () => {
  it("accepte un livre EPUB dans la langue choisie", () => {
    expect(isImportable(FIXTURE, { ...OPTIONS, languages: ["en"] })).toBe(true);
  });
  it("refuse une langue non sélectionnée", () => {
    expect(isImportable(FIXTURE, { ...OPTIONS, languages: ["fr"] })).toBe(false);
  });
  it("refuse un livre sans format e-book", () => {
    expect(isImportable({ ...FIXTURE, formats: { "text/html": "x" } }, OPTIONS)).toBe(false);
  });
  it("filtre sur le minimum de téléchargements", () => {
    expect(isImportable(FIXTURE, { ...OPTIONS, minDownloads: 30000 })).toBe(false);
    expect(isImportable(FIXTURE, { ...OPTIONS, minDownloads: 10000 })).toBe(true);
  });
});

describe("mapBook", () => {
  it("mappe un livre complet en produit Biblio (slug unique, USD, licence)", () => {
    const mapped = mapBook(FIXTURE, OPTIONS);
    expect(mapped.sourceId).toBe("1342");
    expect(mapped.slug).toBe("pride-and-prejudice-g1342");
    expect(mapped.title).toBe("Pride and Prejudice");
    expect(mapped.author).toBe("Austen, Jane");
    expect(mapped.format).toBe("epub");
    expect(mapped.language).toBe("en");
    expect(mapped.priceInCents).toBe(50);
    expect(mapped.currency).toBe("usd");
    expect(mapped.license).toBe(DEFAULT_LICENSE);
    expect(mapped.downloads).toBe(23870);
    expect(mapped.sourceFileUrl).toContain("1342.epub3.images");
    expect(mapped.sourceCoverUrl).toContain("pg1342.cover.small.jpg");
    expect(SOURCE_LABEL).toContain("Project Gutenberg");
  });
});
