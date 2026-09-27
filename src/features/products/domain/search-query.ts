/**
 * Construction de la requête plein texte (L6.2) — fonction PURE.
 *
 * Entrée : texte libre de l'utilisateur. Sortie : chaîne `tsquery` sûre pour
 * `to_tsquery('simple', …)` : jetons alphanumériques (accents retirés côté
 * SQL par `biblio_unaccent`, côté JS par `normalize('NFD')`), chacun en
 * préfixe (`:*`) et reliés par ET. Aucun opérateur utilisateur n'est
 * interprété : `&`, `|`, `!`, `(`, `)`, `'` et `:` sont supprimés.
 *
 * `null` quand rien d'exploitable ne reste (l'appelant n'ajoute alors aucun
 * filtre de recherche).
 */

const MAX_TOKENS = 8;
const MAX_TOKEN_LENGTH = 40;

export function toPrefixTsQuery(input: string | undefined | null): string | null {
  if (!input) return null;
  const tokens = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, MAX_TOKENS)
    .map((t) => t.slice(0, MAX_TOKEN_LENGTH));
  if (tokens.length === 0) return null;
  return tokens.map((t) => `${t}:*`).join(" & ");
}
