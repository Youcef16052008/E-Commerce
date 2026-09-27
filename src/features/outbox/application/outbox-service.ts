import { findPaymentExceptions } from "@/features/admin/infrastructure/payment-exceptions-repo";
import { getMailConfig, getPublicBaseUrl, sendReceipt, sendRefundNotice } from "@/server/mail";
import {
  OUTBOX_KINDS,
  isExhausted,
  isMailableRecipient,
  nextRunAfter,
  type DrainSummary,
  type OutboxKind,
} from "../domain/outbox-types";
import {
  claimDueJobs,
  enqueueIfAbsent,
  findOrdersMissingReceipt,
  findOrdersMissingRefundNotice,
  finishJob,
  listOrderLines,
  recordMail,
  syncExceptionRows,
} from "../infrastructure/outbox-repo";

/**
 * Service outbox : enfile les travaux périodiques puis les draine.
 * Appelé par `/api/cron/outbox` (Vercel Cron) et `scripts/outbox-drain.ts`.
 * Chaque handler est idempotent ; un échec est journalisé sur le travail et
 * re-planifié avec backoff, jamais propagé à l'appelant.
 */

const MAIL_BATCH = 50;

type Handler = (now: Date) => Promise<unknown>;

async function handleReconcilePayments(now: Date) {
  const exceptions = await findPaymentExceptions(now);
  const sync = await syncExceptionRows(
    exceptions.map((e) => ({ kind: e.kind, orderId: e.orderId, productId: e.productId ?? "" })),
    now,
  );
  return { detected: exceptions.length, ...sync };
}

async function handleSendReceipts() {
  const base = getPublicBaseUrl();
  const { provider } = getMailConfig();
  const candidates = await findOrdersMissingReceipt(MAIL_BATCH);
  let sent = 0;
  let skipped = 0;
  let errored = 0;
  for (const o of candidates) {
    const tag = `receipt:${o.orderId}`;
    if (!isMailableRecipient(o.email)) {
      skipped++;
      await recordMail({
        tag,
        orderId: o.orderId,
        recipient: "-",
        provider,
        delivered: false,
        error: "unmailable",
      });
      continue;
    }
    const lines = await listOrderLines(o.orderId);
    try {
      const res = await sendReceipt(o.email, {
        orderId: o.orderId,
        customerName: o.name,
        currency: o.currency,
        totalCents: o.totalInCents,
        lines,
        libraryUrl: `${base}/library`,
        paidAt: o.paidAt ?? undefined,
      });
      await recordMail({
        tag,
        orderId: o.orderId,
        recipient: o.email,
        provider: res.provider,
        delivered: res.delivered,
        messageId: res.messageId ?? null,
      });
      sent++;
    } catch (err) {
      // Pas de ligne mail_log : la commande sera retentée au prochain passage.
      errored++;
      console.error(`[outbox] reçu ${o.orderId} : ${err instanceof Error ? err.message : err}`);
    }
  }
  return { candidates: candidates.length, sent, skipped, errored };
}

async function handleSendRefundNotices() {
  const base = getPublicBaseUrl();
  const { provider } = getMailConfig();
  const candidates = await findOrdersMissingRefundNotice(MAIL_BATCH);
  let sent = 0;
  let skipped = 0;
  let errored = 0;
  for (const o of candidates) {
    const tag = `refund:${o.orderId}:${o.amountInCents}`;
    if (!isMailableRecipient(o.email)) {
      skipped++;
      await recordMail({
        tag,
        orderId: o.orderId,
        recipient: "-",
        provider,
        delivered: false,
        error: "unmailable",
      });
      continue;
    }
    const lines = await listOrderLines(o.orderId);
    try {
      const res = await sendRefundNotice(o.email, {
        orderId: o.orderId,
        customerName: o.name,
        currency: o.currency,
        amountCents: o.amountInCents,
        orderTotalCents: o.totalInCents,
        titles: lines.map((l) => l.title),
        ordersUrl: `${base}/orders`,
        refundedAt: o.completedAt ?? undefined,
      });
      await recordMail({
        tag,
        orderId: o.orderId,
        recipient: o.email,
        provider: res.provider,
        delivered: res.delivered,
        messageId: res.messageId ?? null,
      });
      sent++;
    } catch (err) {
      errored++;
      console.error(
        `[outbox] avis remboursement ${o.orderId} : ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  return { candidates: candidates.length, sent, skipped, errored };
}

const HANDLERS: Record<OutboxKind, Handler> = {
  reconcile_payments: handleReconcilePayments,
  send_receipts: () => handleSendReceipts(),
  send_refund_notices: () => handleSendRefundNotices(),
};

/** Enfile les trois travaux périodiques (sans doublon) puis draine ce qui est échu. */
export async function runOutbox(options: { limit?: number; now?: Date; enqueue?: boolean } = {}) {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 10;
  const summary: DrainSummary = {
    startedAt: now.toISOString(),
    finishedAt: "",
    enqueued: [],
    processed: [],
  };

  if (options.enqueue !== false) {
    for (const kind of OUTBOX_KINDS) {
      const { created } = await enqueueIfAbsent(kind, now);
      if (created) summary.enqueued.push(kind);
    }
  }

  const jobs = await claimDueJobs(limit, now);
  for (const job of jobs) {
    const kind = job.kind as OutboxKind;
    try {
      const result = await HANDLERS[kind](now);
      await finishJob(job.id, {
        status: "done",
        completedAt: new Date(),
        lastError: null,
        result: JSON.stringify(result),
      });
      summary.processed.push({ id: job.id, kind, outcome: "done", result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const exhausted = isExhausted(job.attempts, job.maxAttempts);
      await finishJob(job.id, {
        status: exhausted ? "failed" : "pending",
        runAfter: exhausted ? job.runAfter : nextRunAfter(job.attempts, now),
        lastError: message.slice(0, 500),
        completedAt: exhausted ? new Date() : null,
      });
      summary.processed.push({ id: job.id, kind, outcome: exhausted ? "failed" : "retry" });
    }
  }

  summary.finishedAt = new Date().toISOString();
  return summary;
}

/** Vérifie le secret Cron (Vercel envoie `Authorization: Bearer <CRON_SECRET>`). */
export function isCronAuthorized(authorization: string | null, secret = process.env.CRON_SECRET) {
  if (!secret || secret.length < 16) return false;
  return authorization === `Bearer ${secret}`;
}
