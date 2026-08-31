import { isStorageConfigured, uploadObject } from "@/server/storage";
import { findImportedProduct, insertImportedProduct } from "../infrastructure/catalog-import-repo";
import { SOURCE_NAME, isImportable, mapBook, pickFormat } from "../domain/gutendex-mapper";
import type { GutendexBook, GutendexPage, ImportOptions } from "../domain/gutendex-types";

/**
 * Service applicatif « Import Gutendex ».
 *
 * Phase 1 — lire l'API Gutendex (métadonnées, par popularité) ;
 * Phase 2 — télécharger EPUB + couverture ;
 * Phase 3 — uploader dans le stockage objet LOCAL (MinIO/R2) et mapper
 *           `products.file_url` = `s3://<bucket>/books/gutenberg/<id>.<ext>`,
 *           `products.cover_url` = `/api/covers/gutenberg/<id>` (servi par notre app) ;
 * Phase 4 — persister (idempotent : un produit déjà importé est ignoré).
 *
 * Après l'import, AUCUNE dépendance en direct : le site lit uniquement sa base
 * et son stockage. Si Gutendex disparaît, le site fonctionne toujours.
 */

// `GUTENDEX_BASE_URL` permet de pointer vers un miroir auto-hébergé (recommandé
// par Gutendex pour un usage long terme) sans toucher au code.
const BASE_URL = process.env.GUTENDEX_BASE_URL ?? "https://gutendex.com/books";
const MAX_CONCURRENCY = 4;
const RETRY_ATTEMPTS = 3;

export interface ImportSummary {
  scanned: number;
  imported: number;
  skippedExisting: number;
  failed: number;
  finished: boolean;
}

async function fetchWithRetry(url: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Biblio-Import/1.0" } });
      if (res.ok) return res;
      lastError = new Error(`HTTP ${res.status} sur ${url}`);
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 500 * attempt));
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function fetchPage(page: number, options: ImportOptions): Promise<GutendexPage> {
  const url = new URL(BASE_URL);
  url.searchParams.set("page", String(page));
  url.searchParams.set("sort", "popular");
  if (options.languages.length > 0) {
    url.searchParams.set("languages", options.languages.join(","));
  }
  const res = await fetchWithRetry(url.toString());
  return (await res.json()) as GutendexPage;
}

/** Sauvegarde un fichier distant dans le stockage local (upload binaire). */
async function downloadAndStore(
  sourceUrl: string,
  key: string,
  contentType: string,
): Promise<boolean> {
  const res = await fetchWithRetry(sourceUrl);
  const body = Buffer.from(await res.arrayBuffer());
  await uploadObject(key, body, contentType);
  return true;
}

async function processBook(
  book: GutendexBook,
  options: ImportOptions,
  bucket: string,
): Promise<"imported" | "skipped" | "failed"> {
  // 1. Idempotence : déjà importé ?
  const existing = await findImportedProduct(String(book.id));
  if (existing) return "skipped";

  const mapped = mapBook(book, options);
  const format = pickFormat(book.formats);
  if (!mapped.sourceFileUrl || !format) return "failed";

  try {
    // 2. Fichier e-book → s3://<bucket>/books/gutenberg/<id>.<ext>
    const extension = format;
    const fileKey = `books/gutenberg/${mapped.sourceId}.${extension}`;
    const contentType = format === "epub" ? "application/epub+zip" : "application/pdf";
    await downloadAndStore(mapped.sourceFileUrl, fileKey, contentType);

    // 3. Couverture (optionnelle) → s3://<bucket>/covers/gutenberg/<id>.jpg
    let coverUrl: string | null = null;
    if (mapped.sourceCoverUrl) {
      try {
        const coverKey = `covers/gutenberg/${mapped.sourceId}.jpg`;
        await downloadAndStore(mapped.sourceCoverUrl, coverKey, "image/jpeg");
        // Servie par notre app (URL interne) : aucun lien direct vers la source.
        coverUrl = `/api/covers/gutenberg/${mapped.sourceId}`;
      } catch {
        coverUrl = null; // la couverture est optionnelle, on continue.
      }
    }

    // 4. Persistance (non bloquant si le bucket ne correspond pas : file_url est
    //    posé tel quel, il sera cohérent dès que le stockage cible est configuré).
    await insertImportedProduct({
      ...mapped,
      source: SOURCE_NAME,
      fileUrl: `s3://${bucket}/${fileKey}`,
      coverUrl,
      published: options.publish,
    });
    return "imported";
  } catch (err) {
    console.error(`  ✗ ${mapped.title} : ${err instanceof Error ? err.message : String(err)}`);
    return "failed";
  }
}

export async function importFromGutendex(options: ImportOptions): Promise<ImportSummary> {
  const bucket = process.env.STORAGE_BUCKET?.trim();
  if (!isStorageConfigured() || !bucket) {
    throw new Error(
      "Stockage non configuré : renseignez STORAGE_* (voir .env.example / setup-minio.sh).",
    );
  }
  const bucketName: string = bucket;

  const summary: ImportSummary = {
    scanned: 0,
    imported: 0,
    skippedExisting: 0,
    failed: 0,
    finished: false,
  };

  const queue: GutendexBook[] = [];
  let page = 1;
  let reachedLimit = false;

  // Phase 1 : parcours des pages (popularité décroissante) jusqu'à `limit` candidats.
  while (queue.length < options.limit && !reachedLimit) {
    const data = await fetchPage(page, options);
    summary.scanned += data.results.length;
    for (const book of data.results) {
      if (isImportable(book, options)) queue.push(book);
    }
    if (data.next === null) reachedLimit = true;
    else page += 1;
    console.log(`… page ${page - 1} : ${data.results.length} livres, ${queue.length} candidats`);
    // sécurité : on ne dépasse pas 200 pages (70k livres ≈ 2200 pages).
    if (page > 200) reachedLimit = true;
  }

  const toProcess = queue.slice(0, options.limit);
  console.log(`\nImport de ${toProcess.length} livres (${summary.scanned} scannés)…\n`);

  // Phase 2-4 : traitement avec concurrence bornée.
  let cursor = 0;
  async function worker() {
    while (cursor < toProcess.length) {
      const index = cursor;
      cursor += 1;
      const result = await processBook(toProcess[index], options, bucketName);
      if (result === "imported") {
        summary.imported += 1;
        console.log(`  ✓ [${summary.imported}] ${toProcess[index].title}`);
      } else if (result === "skipped") {
        summary.skippedExisting += 1;
      } else {
        summary.failed += 1;
      }
    }
  }
  await Promise.all(Array.from({ length: MAX_CONCURRENCY }, () => worker()));

  summary.finished = true;
  return summary;
}
