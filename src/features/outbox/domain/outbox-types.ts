/**
 * Domaine outbox (L6.1 / D-11) — types et règles pures.
 *
 * Trois travaux périodiques, tous IDEMPOTENTS et sans mutation financière :
 * - `reconcile_payments`   : matérialise les exceptions internes en lignes
 *                            (`payment_exception_rows`) ;
 * - `send_receipts`        : reçu pour toute commande payée sans `mail_log`
 *                            `receipt:<orderId>` ;
 * - `send_refund_notices`  : avis pour toute commande remboursée sans
 *                            `refund:<orderId>:<amount>`.
 *
 * Modèle « pull » : les handlers de webhook Stripe ne sont pas modifiés ; c'est
 * le drain qui lit l'état de la base et rattrape ce qui manque (ADR-010).
 */

export const OUTBOX_KINDS = ["reconcile_payments", "send_receipts", "send_refund_notices"] as const;
export type OutboxKind = (typeof OUTBOX_KINDS)[number];

export type OutboxStatus = "pending" | "running" | "done" | "failed";

export interface OutboxJobView {
  id: string;
  kind: OutboxKind;
  status: OutboxStatus;
  attempts: number;
  maxAttempts: number;
  runAfter: Date;
  lastError: string | null;
  result: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

/** Résumé d'un passage de drain (compteurs uniquement — jamais de PII). */
export interface DrainSummary {
  startedAt: string;
  finishedAt: string;
  enqueued: OutboxKind[];
  processed: {
    id: string;
    kind: OutboxKind;
    outcome: "done" | "retry" | "failed";
    result?: unknown;
  }[];
}

/**
 * Backoff exponentiel borné : 1 min, 2, 4, 8… plafonné à 6 h.
 * `attempt` = nombre de tentatives DÉJÀ effectuées (≥ 1 après le premier échec).
 */
export function nextRunAfter(attempt: number, now: Date): Date {
  const minutes = Math.min(2 ** Math.max(0, attempt - 1), 360);
  return new Date(now.getTime() + minutes * 60_000);
}

/** Un travail échoué définitivement ne sera plus repris par le drain. */
export function isExhausted(attempts: number, maxAttempts: number): boolean {
  return attempts >= maxAttempts;
}

export function isOutboxKind(value: unknown): value is OutboxKind {
  return typeof value === "string" && (OUTBOX_KINDS as readonly string[]).includes(value);
}

/** Les comptes anonymisés (RGPD, L5.2) ne reçoivent jamais d'e-mail. */
export function isMailableRecipient(email: string): boolean {
  return !email.endsWith("@anonymised.invalid") && email.includes("@");
}
