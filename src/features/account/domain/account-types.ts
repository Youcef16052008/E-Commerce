/**
 * Domaine « compte » (RGPD, D-06) — types + règles PURES (aucun I/O).
 *
 * Deux droits sont exposés à l'utilisateur :
 * - **portabilité / accès** : export JSON de toutes les données qui le concernent ;
 * - **effacement** : suppression du compte, avec une nuance imposée par le droit
 *   comptable — les commandes payées/remboursées sont des pièces justificatives à
 *   conserver (10 ans, art. L123-22 C. com.). Elles ne sont donc pas supprimées
 *   mais ANONYMISÉES : le compte perd toute donnée identifiante (e-mail, nom,
 *   mot de passe, sessions, panier, droits d'accès) et les commandes ne pointent
 *   plus que vers un identifiant technique.
 */

export const DELETE_CONFIRMATION_PHRASE = "SUPPRIMER";

/** Phrase de confirmation exigée dans le corps de la requête DELETE. */
export function isDeleteConfirmed(input: unknown): boolean {
  return (
    typeof input === "object" &&
    input !== null &&
    (input as { confirm?: unknown }).confirm === DELETE_CONFIRMATION_PHRASE
  );
}

/** Adresse-tombstone : unique (l'e-mail est UNIQUE en base), non routable (`.invalid`, RFC 2606). */
export function anonymisedEmail(userId: string): string {
  return `deleted-${userId}@anonymised.invalid`;
}

export const ANONYMISED_NAME = "Compte supprimé";

export type OrderStatusLike = {
  status: "pending" | "paid" | "fulfilled" | "refund_pending" | "failed" | "refunded";
};

export type DeletionMode =
  /** Aucune commande : la ligne `user` est supprimée physiquement (cascades). */
  | { mode: "hard" }
  /** Des commandes existent : anonymisation, les commandes sont conservées. */
  | { mode: "anonymise"; retainedOrders: number }
  /** Une opération financière est en cours : on refuse tant qu'elle n'est pas soldée. */
  | { mode: "blocked"; reason: "order_in_flight"; inFlight: number };

/**
 * Décide du mode de suppression à partir des commandes de l'utilisateur.
 * Une commande `pending` (Checkout Stripe ouvert) ou `refund_pending` (remboursement
 * attendu par webhook) bloque : supprimer maintenant laisserait un webhook orphelin.
 */
export function assessDeletion(orders: readonly OrderStatusLike[]): DeletionMode {
  const inFlight = orders.filter(
    (o) => o.status === "pending" || o.status === "refund_pending",
  ).length;
  if (inFlight > 0) return { mode: "blocked", reason: "order_in_flight", inFlight };
  if (orders.length === 0) return { mode: "hard" };
  return { mode: "anonymise", retainedOrders: orders.length };
}

/** Structure de l'export (versionnée : un consommateur peut détecter un changement de forme). */
export interface AccountExport {
  format: "biblio-account-export";
  version: 1;
  exportedAt: string;
  profile: {
    id: string;
    email: string;
    name: string;
    role: string;
    createdAt: string;
  };
  cart: { productId: string; title: string; addedAt: string }[];
  orders: {
    id: string;
    status: string;
    totalInCents: number;
    currency: string;
    createdAt: string;
    paidAt: string | null;
    items: { productId: string; title: string; priceInCents: number; quantity: number }[];
  }[];
  entitlements: { productId: string; title: string; orderId: string; grantedAt: string }[];
  refunds: {
    orderId: string;
    status: string;
    amountInCents: number;
    currency: string;
    createdAt: string;
    completedAt: string | null;
  }[];
  sessions: { createdAt: string; expiresAt: string; userAgent: string | null }[];
  /** Ce que l'export NE contient PAS, et pourquoi (transparence art. 15 RGPD). */
  notes: string[];
}

export const EXPORT_NOTES: string[] = [
  "Les mots de passe sont stockés hachés et ne sont jamais exportés.",
  "Les données de paiement (carte, adresse de facturation) sont détenues par Stripe, " +
    "responsable de traitement distinct : elles ne transitent jamais par Biblio.",
  "Les adresses IP des sessions ne sont pas exportées (données techniques de sécurité, " +
    "conservées le temps de la session).",
];
