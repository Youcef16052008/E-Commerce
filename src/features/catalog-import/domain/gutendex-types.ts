/**
 * Types de domaine de l'import de catalogue (Project Gutenberg via Gutendex).
 * Le mapping (API → modèle de produit) est une fonction PURE, testable sans réseau.
 */

export interface GutendexPerson {
  name: string;
  birth_year: number | null;
  death_year: number | null;
}

/** Objet `Book` renvoyé par l'API Gutendex (`/books`). */
export interface GutendexBook {
  id: number;
  title: string;
  subjects: string[];
  authors: GutendexPerson[];
  summaries: string[];
  translators: GutendexPerson[];
  bookshelves: string[];
  languages: string[];
  copyright: boolean | null;
  media_type: string;
  /** Clé = MIME type, valeur = URL du fichier (dont `application/epub+zip` et les couvertures `image/jpeg`). */
  formats: Record<string, string>;
  download_count: number;
}

/** Réponse paginée de `GET /books`. */
export interface GutendexPage {
  count: number;
  next: string | null;
  previous: string | null;
  results: GutendexBook[];
}

/** Produit mappé, prêt à être persisté. */
export interface MappedProduct {
  /** Identifiant source (id Project Gutenberg, en chaîne). */
  sourceId: string;
  slug: string;
  title: string;
  description: string | null;
  author: string;
  genre: string | null;
  language: string;
  format: "epub" | "pdf";
  /** URL source du fichier e-book (téléchargée puis stockée localement). */
  sourceFileUrl: string | null;
  /** URL source de la couverture (mise en cache localement). */
  sourceCoverUrl: string | null;
  priceInCents: number;
  currency: "usd";
  license: string;
  downloads: number;
}

/** Options de l'import fournies par le CLI/env. */
export interface ImportOptions {
  /** Nombre maximum de livres à importer (défaut 500). */
  limit: number;
  /** Langues filtrées, ex. ["fr","en"] (vide = toutes). */
  languages: string[];
  /** Prix unitaire en centimes (défaut 50 → 0,50 USD). */
  priceInCents: number;
  /** Publier les produits importés (défaut true). */
  publish: boolean;
  /** Seuil minimal de téléchargements (filtre de qualité, défaut 0). */
  minDownloads: number;
}
