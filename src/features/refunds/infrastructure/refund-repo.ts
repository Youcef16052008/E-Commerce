import crypto from "node:crypto";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/server/db";
import { entitlements, orderItems, orders, refunds, stripeEvents } from "@/server/db/schema";
import type { OrderStatus } from "@/features/checkout/domain/checkout-types";
import type { RefundReason, StripeRefundStatus } from "../domain/refund-types";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type RefundableOrder = {
  id: string;
  status: OrderStatus;
  totalInCents: number;
  currency: string;
  stripePaymentIntentId: string | null;
};

export type RefundReservation =
  | {
      kind: "created";
      refundRequestId: string;
      orderId: string;
      paymentIntentId: string;
      amountInCents: number;
      currency: string;
      reason: RefundReason;
    }
  | { kind: "not-found" }
  | { kind: "not-refundable"; status: OrderStatus }
  | { kind: "payment-reference-missing" }
  | { kind: "already-requested"; refundRequestId: string; status: StripeRefundStatus };

function newId() {
  return crypto.randomUUID();
}

/**
 * Reserves one durable refund attempt and switches the order to refund_pending
 * before any remote API call. `refunds.order_id` is unique, so duplicate clicks
 * cannot create two independent Stripe refunds.
 */
export async function reserveFullOrderRefund(input: {
  orderId: string;
  requestedByUserId: string;
  reason: RefundReason;
}): Promise<RefundReservation> {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: refunds.id, status: refunds.status })
      .from(refunds)
      .where(eq(refunds.orderId, input.orderId))
      .limit(1);
    if (existing[0]) {
      return {
        kind: "already-requested",
        refundRequestId: existing[0].id,
        status: existing[0].status as StripeRefundStatus,
      };
    }

    const order = await tx
      .select({
        id: orders.id,
        status: orders.status,
        totalInCents: orders.totalInCents,
        currency: orders.currency,
        stripePaymentIntentId: orders.stripePaymentIntentId,
      })
      .from(orders)
      .where(eq(orders.id, input.orderId))
      .limit(1);

    const refundableOrder = order[0] as RefundableOrder | undefined;
    if (!refundableOrder) return { kind: "not-found" };
    if (refundableOrder.status !== "paid" && refundableOrder.status !== "fulfilled") {
      return { kind: "not-refundable", status: refundableOrder.status };
    }
    if (!refundableOrder.stripePaymentIntentId) return { kind: "payment-reference-missing" };

    const refundRequestId = newId();
    const inserted = await tx
      .insert(refunds)
      .values({
        id: refundRequestId,
        orderId: refundableOrder.id,
        requestedByUserId: input.requestedByUserId,
        previousOrderStatus: refundableOrder.status,
        amountInCents: refundableOrder.totalInCents,
        currency: refundableOrder.currency,
        reason: input.reason ?? null,
        status: "pending",
      })
      .onConflictDoNothing({ target: refunds.orderId })
      .returning({ id: refunds.id });

    if (!inserted[0]) {
      const concurrent = await tx
        .select({ id: refunds.id, status: refunds.status })
        .from(refunds)
        .where(eq(refunds.orderId, input.orderId))
        .limit(1);
      if (!concurrent[0]) throw new Error("Refund request could not be reserved or reloaded");
      return {
        kind: "already-requested",
        refundRequestId: concurrent[0].id,
        status: concurrent[0].status as StripeRefundStatus,
      };
    }

    const pending = await tx
      .update(orders)
      .set({ status: "refund_pending" })
      .where(and(eq(orders.id, refundableOrder.id), inArray(orders.status, ["paid", "fulfilled"])))
      .returning({ id: orders.id });

    if (!pending[0]) {
      // Roll back the reservation as well: no remote refund is allowed without
      // the durable refund_pending state.
      throw new Error("Order changed while its refund was being reserved");
    }

    return {
      kind: "created",
      refundRequestId,
      orderId: refundableOrder.id,
      paymentIntentId: refundableOrder.stripePaymentIntentId,
      amountInCents: refundableOrder.totalInCents,
      currency: refundableOrder.currency,
      reason: input.reason,
    };
  });
}

/** Stores Stripe's refund identifier without treating the refund as completed. */
export async function attachStripeRefundId(refundRequestId: string, stripeRefundId: string) {
  const current = await db
    .select({ stripeRefundId: refunds.stripeRefundId })
    .from(refunds)
    .where(eq(refunds.id, refundRequestId))
    .limit(1);

  if (!current[0]) throw new Error("Unknown refund request");
  if (current[0].stripeRefundId && current[0].stripeRefundId !== stripeRefundId) {
    throw new Error("Refund request already references a different Stripe refund");
  }

  await db.update(refunds).set({ stripeRefundId }).where(eq(refunds.id, refundRequestId));
}

async function recordStripeEvent(tx: Transaction, eventId: string, type: string) {
  const inserted = await tx
    .insert(stripeEvents)
    .values({ id: newId(), stripeEventId: eventId, type })
    .onConflictDoNothing({ target: stripeEvents.stripeEventId })
    .returning({ id: stripeEvents.id });
  return inserted.length > 0;
}

/**
 * Refunds are per order, while an entitlement is unique per user/product. A
 * legacy/concurrent customer may have another settled order for the same book.
 * In that case transfer the entitlement's audit link instead of removing access.
 */
async function revokeOrTransferEntitlementsAfterSuccessfulRefund(
  tx: Transaction,
  input: { orderId: string; userId: string },
) {
  const currentEntitlements = await tx
    .select({ id: entitlements.id, productId: entitlements.productId })
    .from(entitlements)
    .where(eq(entitlements.orderId, input.orderId));
  if (currentEntitlements.length === 0) return;

  const productIds = currentEntitlements.map((entitlement) => entitlement.productId);
  const otherPaidOrders = await tx
    .select({ productId: orderItems.productId, orderId: orders.id })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(
      and(
        eq(orders.userId, input.userId),
        ne(orders.id, input.orderId),
        inArray(orderItems.productId, productIds),
        inArray(orders.status, ["paid", "fulfilled", "refund_pending"]),
      ),
    );

  const replacementOrderByProduct = new Map<string, string>();
  for (const order of otherPaidOrders) {
    if (!replacementOrderByProduct.has(order.productId)) {
      replacementOrderByProduct.set(order.productId, order.orderId);
    }
  }

  const entitlementIdsToRemove: string[] = [];
  for (const entitlement of currentEntitlements) {
    const replacementOrderId = replacementOrderByProduct.get(entitlement.productId);
    if (!replacementOrderId) {
      entitlementIdsToRemove.push(entitlement.id);
      continue;
    }
    await tx
      .update(entitlements)
      .set({ orderId: replacementOrderId })
      .where(eq(entitlements.id, entitlement.id));
  }

  if (entitlementIdsToRemove.length > 0) {
    await tx.delete(entitlements).where(inArray(entitlements.id, entitlementIdsToRemove));
  }
}

export type RefundWebhookResult =
  "duplicate-event" | "ignored-unknown-refund" | "pending" | "succeeded" | "failed";

/**
 * Applies Stripe's signed refund confirmation atomically with the Biblio order
 * and entitlement state. Access is revoked only after a successful full refund.
 */
export async function processRefundWebhook(input: {
  eventId: string;
  eventType: string;
  refundRequestId: string | undefined;
  orderId: string | undefined;
  stripeRefundId: string;
  paymentIntentId: string | null;
  amountInCents: number;
  currency: string;
  status: StripeRefundStatus;
  failureCode: string | null;
}): Promise<RefundWebhookResult> {
  return db.transaction(async (tx) => {
    const isNewEvent = await recordStripeEvent(tx, input.eventId, input.eventType);
    if (!isNewEvent) return "duplicate-event";

    const requestedRefund = input.refundRequestId
      ? await tx
          .select({
            id: refunds.id,
            orderId: refunds.orderId,
            userId: orders.userId,
            status: refunds.status,
            previousOrderStatus: refunds.previousOrderStatus,
            amountInCents: refunds.amountInCents,
            currency: refunds.currency,
            stripeRefundId: refunds.stripeRefundId,
            stripePaymentIntentId: orders.stripePaymentIntentId,
          })
          .from(refunds)
          .innerJoin(orders, eq(refunds.orderId, orders.id))
          .where(eq(refunds.id, input.refundRequestId))
          .limit(1)
      : [];

    const refund = requestedRefund[0];
    if (!refund || (input.orderId && refund.orderId !== input.orderId)) {
      // This can be an independently-created Stripe refund. Preserve the event
      // for audit but do not attach it to a Biblio order without metadata.
      return "ignored-unknown-refund";
    }
    if (
      (refund.stripeRefundId && refund.stripeRefundId !== input.stripeRefundId) ||
      refund.stripePaymentIntentId !== input.paymentIntentId ||
      refund.amountInCents !== input.amountInCents ||
      refund.currency.toLowerCase() !== input.currency.toLowerCase()
    ) {
      throw new Error("Stripe refund does not match the reserved Biblio refund request");
    }

    if (refund.status === "succeeded") return "succeeded";
    if (refund.status === "failed") return "failed";

    if (input.status === "pending") {
      await tx
        .update(refunds)
        .set({ stripeRefundId: input.stripeRefundId, failureCode: null })
        .where(eq(refunds.id, refund.id));
      return "pending";
    }

    if (input.status === "failed") {
      await tx
        .update(refunds)
        .set({
          status: "failed",
          stripeRefundId: input.stripeRefundId,
          failureCode: input.failureCode,
          completedAt: new Date(),
        })
        .where(eq(refunds.id, refund.id));
      await tx
        .update(orders)
        .set({ status: refund.previousOrderStatus as OrderStatus })
        .where(and(eq(orders.id, refund.orderId), eq(orders.status, "refund_pending")));
      return "failed";
    }

    await tx
      .update(refunds)
      .set({
        status: "succeeded",
        stripeRefundId: input.stripeRefundId,
        failureCode: null,
        completedAt: new Date(),
      })
      .where(eq(refunds.id, refund.id));
    await tx
      .update(orders)
      .set({ status: "refunded" })
      .where(and(eq(orders.id, refund.orderId), eq(orders.status, "refund_pending")));
    await revokeOrTransferEntitlementsAfterSuccessfulRefund(tx, {
      orderId: refund.orderId,
      userId: refund.userId,
    });

    return "succeeded";
  });
}
