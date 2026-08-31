import type { GutendexBook, ImportOptions, MappedProduct } from "./gutendex-types";

/**
 * Mapping PUR Gutendex → modèle de produit Biblio.
 * Aucune I/O ici : tout est testable avec un fixture JSON.
 */

export const SOURCE_NAME = "gutenberg";
export const SOURCE_LABEL = "Project Gutenberg (domaine public)";
export const DEFAULT_LICENSE = "Domaine public (États-Unis) — Project Gutenberg";

/** Normalise un titre en slug (accents retirés, minuscules, tirets). */
export function slugify(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "livre"
  );
}

/** Choisit le format e-book : EPUB prioritaire, sinon PDF. */
export function pickFormat(formats: Record<string, string>): "epub" | "pdf" | null {
  if (formats["application/epub+zip"]) return "epub";
  if (formats["application/pdf"]) return "pdf";
  return null;
}

/** Classe un livre en genre lisible (à partir des subjects/bookshelves). */
export function mapGenre(book: GutendexBook): string | null {
  const haystack = [...book.subjects, ...book.bookshelves].join(" ").toLowerCase();
  const rules: [RegExp, string][] = [
    [/science fiction|sci-fi|fantasy/, "Science-fiction & Fantasy"],
    [/mystery|detective|crime|thriller/, "Polar & Thriller"],
    [/romance|love/, "Romance"],
    [/poetry|poem/, "Poésie"],
    [/philosophy|philosoph/, "Philosophie"],
    [/history|historical/, "Histoire"],
    [/biograph|autobiograph|memoir/, "Biographie"],
    [/children|juvenile|fairy|tale/, "Jeunesse & Contes"],
    [/cooking|food|cuisine|recipes/, "Cuisine"],
    [/religion|theolog|bible|spirit/, "Spiritualité"],
    [/science|nature|biology|physics|astronomy/, "Sciences"],
    [/math|mathematics|comput/, "Sciences & Techniques"],
    [/drama|play|theater/, "Théâtre"],
    [/humor|humour|satire/, "Humour"],
    [/fiction|novel|short stories|literature/, "Fiction"],
    [/essay|essays|literary collections/, "Essais"],
  ];
  for (const [regex, label] of rules) {
    if (regex.test(haystack)) return label;
  }
  return null;
}

/** Description : résumé de la source, sinon les sujets. */
export function mapDescription(book: GutendexBook): string | null {
  const summary = book.summaries.find((s) => s.trim().length > 0);
  if (summary) return summary.trim();
  if (book.subjects.length > 0) return book.subjects.slice(0, 3).join(" — ");
  return null;
}

/** Nom d'auteur : premier auteur, sinon traducteur, sinon placeholder. */
export function mapAuthor(book: GutendexBook): string {
  const author = book.authors.find((a) => a.name.trim().length > 0);
  if (author) return author.name.trim();
  const translator = book.translators.find((t) => t.name.trim().length > 0);
  if (translator) return translator.name.trim();
  return "Auteur inconnu";
}

export function mapLanguage(book: GutendexBook): string {
  return book.languages[0] ?? "fr";
}

/** Vérifie qu'un livre est importable (format supporté + langue + minimum de téléchargements). */
export function isImportable(book: GutendexBook, options: ImportOptions): boolean {
  const format = pickFormat(book.formats);
  if (!format) return false;
  if (book.download_count < options.minDownloads) return false;
  if (options.languages.length > 0 && !book.languages.some((l) => options.languages.includes(l))) {
    return false;
  }
  return true;
}

/** Mappe un livre Gutendex en produit Biblio (slug unique : titre + id source). */
export function mapBook(book: GutendexBook, options: ImportOptions): MappedProduct {
  const format = pickFormat(book.formats)!;
  return {
    sourceId: String(book.id),
    slug: `${slugify(book.title)}-g${book.id}`,
    title: book.title.trim(),
    description: mapDescription(book),
    author: mapAuthor(book),
    genre: mapGenre(book),
    language: mapLanguage(book),
    format,
    sourceFileUrl: book.formats[`application/${format === "epub" ? "epub+zip" : "pdf"}`] ?? null,
    sourceCoverUrl: book.formats["image/jpeg"] ?? null,
    priceInCents: options.priceInCents,
    currency: "usd",
    license: DEFAULT_LICENSE,
    downloads: book.download_count,
  };
}
