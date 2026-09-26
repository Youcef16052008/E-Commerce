import { z } from "zod";
import { adminProductCreateSchema } from "./admin-schemas";

/**
 * CSV produits (L6.3) — fonctions PURES : sérialisation, analyse RFC 4180
 * (guillemets, virgules, retours à la ligne dans les champs), validation ligne
 * à ligne. L'import se fait par **upsert sur `slug`** : `id` est exporté pour
 * information mais jamais lu à l'import.
 */

export const PRODUCT_CSV_COLUMNS = [
  "slug",
  "title",
  "author",
  "genre",
  "language",
  "format",
  "price_cents",
  "currency",
  "published",
  "description",
  "cover_url",
  "file_url",
  "id",
] as const;
export type ProductCsvColumn = (typeof PRODUCT_CSV_COLUMNS)[number];

export interface ProductCsvRow {
  id?: string | null;
  slug: string;
  title: string;
  author: string;
  genre: string | null;
  language: string | null;
  format: "epub" | "pdf";
  priceInCents: number;
  currency: string;
  published: boolean;
  description: string | null;
  coverUrl: string | null;
  fileUrl: string | null;
}

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Sérialise avec en-tête, séparateur virgule, CRLF (Excel/Numbers/LibreOffice). */
export function productsToCsv(rows: ProductCsvRow[]): string {
  const header = PRODUCT_CSV_COLUMNS.join(",");
  const lines = rows.map((r) =>
    [
      r.slug,
      r.title,
      r.author,
      r.genre,
      r.language,
      r.format,
      r.priceInCents,
      r.currency,
      r.published ? "true" : "false",
      r.description,
      r.coverUrl,
      r.fileUrl,
      r.id ?? "",
    ]
      .map(escapeCell)
      .join(","),
  );
  return [header, ...lines].join("\r\n") + "\r\n";
}

/** Analyseur CSV minimal mais conforme (guillemets doublés, champs multi-lignes, BOM). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  // Ignore les lignes entièrement vides (fin de fichier, doubles retours).
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

const boolish = z
  .string()
  .trim()
  .toLowerCase()
  .transform((v) => ["true", "1", "yes", "oui", "x"].includes(v));

const rowSchema = adminProductCreateSchema
  .omit({ priceInCents: true, published: true, slug: true })
  .extend({
    slug: z
      .string()
      .trim()
      .min(1, "slug requis (clé d'upsert)")
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug invalide (a-z, 0-9, tirets)")
      .max(120),
    priceInCents: z.coerce.number().int().min(0).max(100_000),
    published: boolish,
  });

export interface ProductCsvParseResult {
  rows: ProductCsvRow[];
  errors: { line: number; message: string }[];
  /** Colonnes reconnues dans l'en-tête (ordre libre, casse ignorée). */
  columns: string[];
}

/**
 * Transforme le texte CSV en lignes validées. L'en-tête est obligatoire ; les
 * colonnes peuvent être dans n'importe quel ordre ; `id` est ignoré ; `currency`
 * vide vaut `usd`. Les doublons de `slug` dans le fichier sont des erreurs.
 */
export function parseProductCsv(text: string): ProductCsvParseResult {
  const records = parseCsv(text);
  if (records.length === 0)
    return { rows: [], errors: [{ line: 1, message: "Fichier vide" }], columns: [] };

  const header = records[0]!.map((h) => h.trim().toLowerCase());
  const idx = (c: ProductCsvColumn) => header.indexOf(c);
  const required: ProductCsvColumn[] = ["slug", "title", "author", "format", "price_cents"];
  const missing = required.filter((c) => idx(c) === -1);
  if (missing.length) {
    return {
      rows: [],
      errors: [{ line: 1, message: `Colonnes manquantes : ${missing.join(", ")}` }],
      columns: header,
    };
  }

  const rows: ProductCsvRow[] = [];
  const errors: ProductCsvParseResult["errors"] = [];
  const seen = new Set<string>();
  const cell = (rec: string[], c: ProductCsvColumn) => (idx(c) === -1 ? "" : (rec[idx(c)] ?? ""));

  records.slice(1).forEach((rec, i) => {
    const line = i + 2;
    const parsed = rowSchema.safeParse({
      slug: cell(rec, "slug"),
      title: cell(rec, "title"),
      author: cell(rec, "author"),
      genre: cell(rec, "genre"),
      language: cell(rec, "language"),
      format: cell(rec, "format").trim().toLowerCase(),
      priceInCents: cell(rec, "price_cents").trim(),
      currency: (cell(rec, "currency").trim().toLowerCase() || "usd") as "usd",
      published: cell(rec, "published"),
      description: cell(rec, "description"),
      coverUrl: cell(rec, "cover_url").trim(),
      fileUrl: cell(rec, "file_url").trim(),
    });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      errors.push({
        line,
        message: `${first?.path.join(".") ?? "?"} : ${first?.message ?? "invalide"}`,
      });
      return;
    }
    if (seen.has(parsed.data.slug)) {
      errors.push({ line, message: `slug en double dans le fichier : ${parsed.data.slug}` });
      return;
    }
    seen.add(parsed.data.slug);
    rows.push({ ...parsed.data, id: null });
  });

  return { rows, errors, columns: header };
}

export const bulkActionSchema = z.object({
  action: z.enum(["publish", "unpublish"]),
  ids: z.array(z.string().min(1)).min(1).max(500),
});
export type BulkAction = z.infer<typeof bulkActionSchema>;
