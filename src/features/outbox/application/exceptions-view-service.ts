import { eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { orders, products, user } from "@/server/db/schema";
import {
  PAYMENT_EXCEPTION_LABELS,
  emptyPaymentExceptionCounts,
  type PaymentExceptionKind,
} from "@/features/admin/domain/payment-exceptions";
import type { OrderStatus } from "@/features/checkout/domain/checkout-types";
import { formatPrice } from "@/shared/lib/format";
import { lastReconcileRun, listOpenExceptionRows } from "../infrastructure/outbox-repo";

/**
 * Vue admin « Paiements à examiner » = lignes PERSISTÉES par le travail
 * `reconcile_payments` (L6.1), enrichies pour l'affichage. La détection
 * elle-même reste `findPaymentExceptions` (CLI `payments:reconcile` en
 * override manuel) ; la page ne recalcule plus rien à chaque rendu.
 */

export interface PersistedExceptionView {
  id: string;
  kind: PaymentExceptionKind;
  label: string;
  orderId: string;
  orderStatus: OrderStatus;
  userEmail: string;
  userName: string;
  totalFormatted: string;
  firstSeenLabel: string;
  lastSeenLabel: string;
  productTitle: string | null;
}

export interface PersistedExceptionsReport {
  lastRunAt: Date | null;
  lastRunResult: string | null;
  total: number;
  counts: Record<PaymentExceptionKind, number>;
  items: PersistedExceptionView[];
}

const fmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

export async function viewPersistedExceptions(): Promise<PersistedExceptionsReport> {
  const [rows, last] = await Promise.all([listOpenExceptionRows(), lastReconcileRun()]);
  const orderIds = [...new Set(rows.map((r) => r.orderId))];
  const productIds = [...new Set(rows.map((r) => r.productId).filter(Boolean))];

  const [orderRows, productRows] = await Promise.all([
    orderIds.length
      ? db
          .select({
            id: orders.id,
            status: orders.status,
            totalInCents: orders.totalInCents,
            currency: orders.currency,
            userEmail: user.email,
            userName: user.name,
          })
          .from(orders)
          .innerJoin(user, eq(user.id, orders.userId))
          .where(inArray(orders.id, orderIds))
      : [],
    productIds.length
      ? db
          .select({ id: products.id, title: products.title })
          .from(products)
          .where(inArray(products.id, productIds))
      : [],
  ]);
  const byOrder = new Map(orderRows.map((o) => [o.id, o]));
  const byProduct = new Map(productRows.map((p) => [p.id, p.title]));

  const counts = emptyPaymentExceptionCounts();
  const items: PersistedExceptionView[] = [];
  for (const r of rows) {
    const o = byOrder.get(r.orderId);
    if (!o) continue; // commande supprimée entre-temps : ligne orpheline, ignorée
    const kind = r.kind as PaymentExceptionKind;
    if (kind in counts) counts[kind]++;
    items.push({
      id: r.id,
      kind,
      label: PAYMENT_EXCEPTION_LABELS[kind] ?? r.kind,
      orderId: r.orderId,
      orderStatus: o.status as OrderStatus,
      userEmail: o.userEmail,
      userName: o.userName,
      totalFormatted: formatPrice(o.totalInCents, o.currency),
      firstSeenLabel: fmt.format(r.firstSeenAt),
      lastSeenLabel: fmt.format(r.lastSeenAt),
      productTitle: r.productId ? (byProduct.get(r.productId) ?? null) : null,
    });
  }

  return {
    lastRunAt: last?.completedAt ?? null,
    lastRunResult: last?.result ?? null,
    total: items.length,
    counts,
    items,
  };
}
