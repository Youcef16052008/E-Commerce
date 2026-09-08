import crypto from "node:crypto";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/server/db";
import { orders, refunds, stripeSyncLog } from "@/server/db/schema";
import type {
  LocalStripeOrder,
  StripeOrderReconciliation,
  StripeReconciliationStatus,
} from "../domain/stripe-reconciliation";
import type { OrderStatus } from "@/features/checkout/domain/checkout-types";

const REMOTE_RECONCILIATION_ORDER_STATUSES: readonly OrderStatus[] = [
  "paid",
  "fulfilled",
  "refund_pending",
  "refunded",
];

/** Loads a bounded batch of Stripe-referenced orders, never every account object. */
export async function listOrdersForStripeReconciliation(input: {
  limit: number;
  orderId?: string;
}) {
  const conditions = [
    isNotNull(orders.stripePaymentIntentId),
    // A targeted run never widens the lifecycle scope: refund_pending is
    // included, while pending/failed orders are not treated as settled sales.
    inArray(orders.status, [...REMOTE_RECONCILIATION_ORDER_STATUSES]),
  ];
  if (input.orderId) {
    conditions.push(eq(orders.id, input.orderId));
  }

  const orderRows = await db
    .select({
      orderId: orders.id,
      orderStatus: orders.status,
      totalInCents: orders.totalInCents,
      currency: orders.currency,
      stripePaymentIntentId: orders.stripePaymentIntentId,
    })
    .from(orders)
    .where(and(...conditions))
    .orderBy(desc(orders.createdAt))
    .limit(input.limit);

  if (orderRows.length === 0) return [];

  const refundRows = await db
    .select({
      id: refunds.id,
      orderId: refunds.orderId,
      stripeRefundId: refunds.stripeRefundId,
      amountInCents: refunds.amountInCents,
      currency: refunds.currency,
      status: refunds.status,
    })
    .from(refunds)
    .where(
      inArray(
        refunds.orderId,
        orderRows.map((order) => order.orderId),
      ),
    );

  const refundsByOrder = new Map<string, typeof refundRows>();
  for (const refund of refundRows) {
    const current = refundsByOrder.get(refund.orderId) ?? [];
    current.push(refund);
    refundsByOrder.set(refund.orderId, current);
  }

  return orderRows.map((order): LocalStripeOrder => ({
    orderId: order.orderId,
    orderStatus: order.orderStatus as OrderStatus,
    totalInCents: order.totalInCents,
    currency: order.currency,
    // The `isNotNull` SQL predicate above establishes this invariant.
    stripePaymentIntentId: order.stripePaymentIntentId!,
    refunds: (refundsByOrder.get(order.orderId) ?? []).map((refund) => ({
      id: refund.id,
      stripeRefundId: refund.stripeRefundId,
      amountInCents: refund.amountInCents,
      currency: refund.currency,
      status: refund.status as "pending" | "succeeded" | "failed",
    })),
  }));
}

/**
 * Records a non-financial reconciliation audit entry. Persisted details carry
 * only issue codes and Stripe object IDs; they must not contain users, card
 * data, API errors or credentials.
 */
export async function writeStripeReconciliationLog(input: {
  runId: string;
  result: StripeOrderReconciliation;
}) {
  const details = JSON.stringify({
    issues: input.result.issues.map((item) => ({
      kind: item.kind,
      localRefundId: item.localRefundId,
      remoteRefundId: item.remoteRefundId,
    })),
  });

  await db.insert(stripeSyncLog).values({
    id: crypto.randomUUID(),
    runId: input.runId,
    orderId: input.result.orderId,
    stripePaymentIntentId: input.result.paymentIntentId,
    status: input.result.status as StripeReconciliationStatus,
    issueCount: input.result.issues.length,
    details,
  });
}
