/**
 * Types de domaine de la bibliothèque personnelle.
 * Un `LibraryItem` est un ouvrage auquel l'utilisateur a un droit d'accès (entitlement).
 */
export interface LibraryItem {
  productId: string;
  slug: string;
  title: string;
  author: string;
  genre: string | null;
  format: string;
  coverUrl: string | null;
  fileUrl: string | null;
  purchasedAt: Date;
}

export type LibraryError =
  | { code: "UNAUTHORIZED" }
  | { code: "NOT_ENTITLED" }
  | { code: "FILE_NOT_AVAILABLE" }
  | { code: "STORAGE_NOT_CONFIGURED" };
