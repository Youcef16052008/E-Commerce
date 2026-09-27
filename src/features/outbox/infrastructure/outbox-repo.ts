import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  mailLog,
  orderItems,
  orders,
  outboxJobs,
  paymentExceptionRows,
  refunds,
  user,
} from "@/server/db/schema";
import type { OutboxKind, OutboxStatus } from "../domain/outbox-types";

/** Crée un travail `pending` sauf si un travail du même type est déjà en attente/en cours. */
export async function enqueueIfAbsent(
  kind: OutboxKind,
  runAfter: Date = new Date(),
): Promise<{ id: string; created: boolean }> {
  const existing = await db
    .select({ id: outboxJobs.id })
    .from(outboxJobs)
    .where(and(eq(outboxJobs.kind, kind), inArray(outboxJobs.status, ["pending", "running"])))
    .limit(1);
  if (existing[0]) return { id: existing[0].id, created: false };
  const id = randomUUID();
  await db.insert(outboxJobs).values({ id, kind, runAfter });
  return { id, created: true };
}

/**
 * Réclame atomiquement jusqu'à `limit` travaux échus : `pending` → `running`.
 * `FOR UPDATE SKIP LOCKED` rend deux drains concurrents (cron + CLI) sûrs.
 */
export async function claimDueJobs(limit: number, now: Date) {
  return db.transaction(async (tx) => {
    const due = await tx.execute<{ id: string }>(sql`
      select id from outbox_jobs
      where status = 'pending' and run_after <= ${now.toISOString()}::timestamptz
      order by run_after asc
      limit ${limit}
      for update skip locked
    `);
    const ids = Array.from(due as Iterable<{ id: string }>, (r) => r.id);
    if (ids.length === 0) return [];
    return tx
      .update(outboxJobs)
      .set({ status: "running", startedAt: now, attempts: sql`${outboxJobs.attempts} + 1` })
      .where(inArray(outboxJobs.id, ids))
      .returning();
  });
}

export async function finishJob(
  id: string,
  patch: {
    status: OutboxStatus;
    runAfter?: Date;
    lastError?: string | null;
    result?: string | null;
    completedAt?: Date | null;
  },
) {
  await db.update(outboxJobs).set(patch).where(eq(outboxJobs.id, id));
}

export async function listRecentJobs(limit = 20) {
  return db.select().from(outboxJobs).orderBy(desc(outboxJobs.createdAt)).limit(limit);
}

// ---------- reconcile_payments ----------

export interface ExceptionKey {
  kind: string;
  orderId: string;
  productId: string;
}

/** Upsert des écarts vus maintenant ; ferme ceux qui n'apparaissent plus. */
export async function syncExceptionRows(seen: ExceptionKey[], now: Date) {
  return db.transaction(async (tx) => {
    const seenIds: string[] = [];
    for (const e of seen) {
      const [row] = await tx
        .insert(paymentExceptionRows)
        .values({
          id: randomUUID(),
          kind: e.kind,
          orderId: e.orderId,
          productId: e.productId,
          firstSeenAt: now,
          lastSeenAt: now,
        })
        .onConflictDoUpdate({
          target: [
            paymentExceptionRows.kind,
            paymentExceptionRows.orderId,
            paymentExceptionRows.productId,
          ],
          set: { lastSeenAt: now, resolvedAt: null },
        })
        .returning({ id: paymentExceptionRows.id });
      seenIds.push(row!.id);
    }
    const closed = await tx
      .update(paymentExceptionRows)
      .set({ resolvedAt: now })
      .where(
        and(
          isNull(paymentExceptionRows.resolvedAt),
          seenIds.length ? notInArray(paymentExceptionRows.id, seenIds) : sql`true`,
        ),
      )
      .returning({ id: paymentExceptionRows.id });
    return { open: seenIds.length, closed: closed.length };
  });
}

export async function listOpenExceptionRows() {
  return db
    .select()
    .from(paymentExceptionRows)
    .where(isNull(paymentExceptionRows.resolvedAt))
    .orderBy(desc(paymentExceptionRows.firstSeenAt));
}

export async function lastReconcileRun() {
  const rows = await db
    .select({ completedAt: outboxJobs.completedAt, result: outboxJobs.result })
    .from(outboxJobs)
    .where(and(eq(outboxJobs.kind, "reconcile_payments"), eq(outboxJobs.status, "done")))
    .orderBy(desc(outboxJobs.completedAt))
    .limit(1);
  return rows[0] ?? null;
}

// ---------- mails ----------

const orderWithBuyer = {
  orderId: orders.id,
  status: orders.status,
  totalInCents: orders.totalInCents,
  currency: orders.currency,
  paidAt: orders.paidAt,
  email: user.email,
  name: user.name,
};

/** Commandes payées (paid/fulfilled) sans reçu journalisé. */
export async function findOrdersMissingReceipt(limit: number) {
  return db
    .select(orderWithBuyer)
    .from(orders)
    .innerJoin(user, eq(user.id, orders.userId))
    .leftJoin(mailLog, eq(mailLog.tag, sql`'receipt:' || ${orders.id}`))
    .where(and(inArray(orders.status, ["paid", "fulfilled"]), isNull(mailLog.id)))
    .orderBy(orders.paidAt)
    .limit(limit);
}

/** Commandes remboursées (refund succeeded) sans avis journalisé. */
export async function findOrdersMissingRefundNotice(limit: number) {
  return db
    .select({
      ...orderWithBuyer,
      amountInCents: refunds.amountInCents,
      completedAt: refunds.completedAt,
    })
    .from(orders)
    .innerJoin(user, eq(user.id, orders.userId))
    .innerJoin(refunds, and(eq(refunds.orderId, orders.id), eq(refunds.status, "succeeded")))
    .leftJoin(
      mailLog,
      eq(mailLog.tag, sql`'refund:' || ${orders.id} || ':' || ${refunds.amountInCents}`),
    )
    .where(and(eq(orders.status, "refunded"), isNull(mailLog.id)))
    .limit(limit);
}

export async function listOrderLines(orderId: string) {
  return db
    .select({
      title: orderItems.titleSnapshot,
      priceCents: orderItems.priceInCents,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));
}

export async function recordMail(entry: {
  tag: string;
  orderId: string;
  recipient: string;
  provider: string;
  delivered: boolean;
  messageId?: string | null;
  error?: string | null;
}) {
  await db
    .insert(mailLog)
    .values({ id: randomUUID(), ...entry })
    .onConflictDoNothing({ target: mailLog.tag });
}

export async function countMailLog(orderId: string) {
  const rows = await db
    .select({ tag: mailLog.tag })
    .from(mailLog)
    .where(eq(mailLog.orderId, orderId));
  return rows.map((r) => r.tag);
}
