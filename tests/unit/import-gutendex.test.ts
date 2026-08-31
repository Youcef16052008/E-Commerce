import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests unitaires de l'orchestrateur d'import Gutendex.
 * `fetch`, le dépôt et le stockage sont STUBBÉS : aucun réseau, aucune base.
 */

const mocks = vi.hoisted(() => ({
  uploadObject: vi.fn(async (_key: string, _body: Uint8Array, _contentType: string) => {}),
  findImportedProduct: vi.fn(async (_sourceId: string) => null as { id: string } | null),
  insertImportedProduct: vi.fn(async (_product: Record<string, unknown>) => {}),
}));

vi.mock("@/server/storage", () => ({
  isStorageConfigured: () => true,
  uploadObject: mocks.uploadObject,
}));

vi.mock("@/features/catalog-import/infrastructure/catalog-import-repo", () => ({
  findImportedProduct: mocks.findImportedProduct,
  insertImportedProduct: mocks.insertImportedProduct,
}));

import { importFromGutendex } from "@/features/catalog-import/application/import-gutendex";
import type { ImportOptions } from "@/features/catalog-import/domain/gutendex-types";

function book(id: number, format: "epub" | "pdf" | "none", title: string, downloads = 100) {
  return {
    id,
    title,
    subjects: ["Fiction"],
    authors: [{ name: "Auteur, Test", birth_year: 1900, death_year: 1990 }],
    summaries: [],
    translators: [],
    bookshelves: [],
    languages: ["fr"],
    copyright: false,
    media_type: "text",
    formats:
      format === "none"
        ? { "text/html": `https://example.org/${id}.htm` }
        : {
            ...(format === "epub"
              ? { "application/epub+zip": `https://example.org/${id}.epub` }
              : { "application/pdf": `https://example.org/${id}.pdf` }),
            "image/jpeg": `https://example.org/${id}.jpg`,
          },
    download_count: downloads,
  };
}

const OPTIONS: ImportOptions = {
  limit: 500,
  languages: [],
  priceInCents: 50,
  publish: true,
  minDownloads: 0,
};

beforeEach(() => {
  process.env.STORAGE_BUCKET = "biblio";
  mocks.uploadObject.mockClear();
  mocks.findImportedProduct.mockClear();
  mocks.insertImportedProduct.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.STORAGE_BUCKET;
});

describe("importFromGutendex", () => {
  it("importe les livres EPUB/PDF, filtre les sans fichier, mappe stockage + BDD", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              count: 4,
              next: null,
              previous: null,
              results: [
                book(11, "epub", "Le Livre Un"),
                book(12, "pdf", "Le Livre Deux"),
                book(13, "none", "Sans Fichier"),
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ),
    );

    const summary = await importFromGutendex({ ...OPTIONS, limit: 3 });

    expect(summary.imported).toBe(2);
    expect(summary.scanned).toBe(3);
    expect(summary.finished).toBe(true);

    // Les fichiers sont uploadés dans NOTRE stockage (clés déterministes).
    const epubKey = mocks.uploadObject.mock.calls.find(
      ([key]) => key === "books/gutenberg/11.epub",
    );
    expect(epubKey).toBeDefined();
    expect(epubKey![2]).toBe("application/epub+zip");
    const pdfKey = mocks.uploadObject.mock.calls.find(([key]) => key === "books/gutenberg/12.pdf");
    expect(pdfKey).toBeDefined();
    const coverKey = mocks.uploadObject.mock.calls.find(
      ([key]) => key === "covers/gutenberg/11.jpg",
    );
    expect(coverKey).toBeDefined();

    // La BDD reçoit des produits mappés (USD, domaine public, couverture locale).
    expect(mocks.insertImportedProduct).toHaveBeenCalledTimes(2);
    const [epubRow] = mocks.insertImportedProduct.mock.calls[0] as [Record<string, unknown>];
    expect(epubRow.source).toBe("gutenberg");
    expect(epubRow.sourceId).toBe("11");
    expect(epubRow.fileUrl).toBe("s3://biblio/books/gutenberg/11.epub");
    expect(epubRow.coverUrl).toBe("/api/covers/gutenberg/11");
    expect(epubRow.currency).toBe("usd");
    expect(epubRow.priceInCents).toBe(50);
    expect(epubRow.published).toBe(true);
    expect(epubRow.license).toContain("Domaine public");
    expect(epubRow.slug).toBe("le-livre-un-g11");
  });

  it("ignore les livres déjà importés (idempotence)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              count: 1,
              next: null,
              previous: null,
              results: [book(21, "epub", "Déjà Importé")],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ),
    );
    mocks.findImportedProduct.mockResolvedValueOnce({ id: "existing" });

    const summary = await importFromGutendex({ ...OPTIONS, limit: 1 });
    expect(summary.imported).toBe(0);
    expect(summary.skippedExisting).toBe(1);
    expect(mocks.insertImportedProduct).not.toHaveBeenCalled();
  });
});
