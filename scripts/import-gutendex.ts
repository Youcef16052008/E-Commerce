/**
 * Import du catalogue Project Gutenberg (via l'API Gutendex) dans Biblio.
 *
 * - Récupère les N livres les plus téléchargés (filtres langue/format).
 * - Télécharge EPUB (ou PDF) + couverture.
 * - Les stocke dans le stockage objet LOCAL (MinIO/R2).
 * - Crée les produits (source='gutenberg', licence domaine public, prix USD).
 * - Idempotent : un livre déjà importé est ignoré.
 *
 * Après l'import, le site ne dépend PLUS d'aucune source externe.
 *
 * Usage : npm run import:gutenberg
 * Variables (défauts entre parenthèses) :
 *   IMPORT_GUTENDEX_LIMIT        (500)
 *   IMPORT_GUTENDEX_LANGUAGES    (toutes, ex. "fr,en")
 *   IMPORT_PRICE_CENTS           (50 → 0,50 USD)
 *   IMPORT_PUBLISHED             (true)
 *   IMPORT_MIN_DOWNLOADS         (0)
 */
import "./load-env";

import { importFromGutendex } from "../src/features/catalog-import/application/import-gutendex";
import type { ImportOptions } from "../src/features/catalog-import/domain/gutendex-types";

function envInt(key: string, fallback: number): number {
  const raw = process.env[key]?.trim();
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 0) return fallback;
  return value;
}

function envBool(key: string, fallback: boolean): boolean {
  const raw = process.env[key]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw !== "false" && raw !== "0" && raw !== "no";
}

function envList(key: string): string[] {
  return (process.env[key] ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

async function main() {
  const options: ImportOptions = {
    limit: envInt("IMPORT_GUTENDEX_LIMIT", 500),
    languages: envList("IMPORT_GUTENDEX_LANGUAGES"),
    priceInCents: envInt("IMPORT_PRICE_CENTS", 50),
    publish: envBool("IMPORT_PUBLISHED", true),
    minDownloads: envInt("IMPORT_MIN_DOWNLOADS", 0),
  };

  console.log(`Import Gutendex — ${options.limit} livres max, ${options.priceInCents / 100} USD`);
  if (options.languages.length > 0) console.log(`Langues : ${options.languages.join(", ")}`);
  console.log("");

  const summary = await importFromGutendex(options);
  console.log(
    `\n✓ Terminé : ${summary.imported} importés, ${summary.skippedExisting} déjà présents, ` +
      `${summary.failed} échecs (${summary.scanned} livres scannés).`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
