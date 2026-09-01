/**
 * Normalise une chaîne en slug URL-safe (accents retirés, minuscules, tirets).
 * Utilisé par l'import catalogue et le CRUD admin produits.
 */
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
