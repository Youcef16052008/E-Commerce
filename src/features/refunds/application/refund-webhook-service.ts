import type Stripe from "stripe";
import { processRefundWebhook } from "../infrastructure/refund-repo";
import type { StripeRefundStatus } from "../domain/refund-types";

export type RefundWebhookHandlingResult =
  | { status: "duplicate" }
  | { status: "ignored_missing_metadata" }
  | { status: "ignored_unknown_refund" }
  | { status: "refund_pending"; orderId: string }
  | { status: "refund_succeeded"; orderId: string }
  | { status: "refund_failed"; orderId: string };

function objectId(value: string | { id: string } | null): string | null {
  return typeof value === "string" ? value : (value?.id ?? null);
}

function normalizeStripeRefundStatus(status: string | null): StripeRefundStatus {
  if (status === "succeeded") return "succeeded";
  if (status === "failed" || status === "canceled") return "failed";
  return "pending";
}

/** Maps a signed Stripe Refund event onto the durable Biblio refund workflow. */
export async function handleStripeRefundWebhook(
  event: Stripe.Event,
): Promise<RefundWebhookHandlingResult> {
  const refund = event.data.object as Stripe.Refund;
  const refundRequestId = refund.metadata?.refundRequestId;
  const orderId = refund.metadata?.orderId;
  if (!refundRequestId || !orderId) return { status: "ignored_missing_metadata" };
  if (!refund.currency) throw new Error("Stripe refund has no currency");

  const result = await processRefundWebhook({
    eventId: event.id,
    eventType: event.type,
    refundRequestId,
    orderId,
    stripeRefundId: refund.id,
    paymentIntentId: objectId(refund.payment_intent),
    amountInCents: refund.amount,
    currency: refund.currency,
    status: normalizeStripeRefundStatus(refund.status),
    failureCode: refund.failure_reason ?? null,
  });

  switch (result) {
    case "duplicate-event":
      return { status: "duplicate" };
    case "ignored-unknown-refund":
      return { status: "ignored_unknown_refund" };
    case "pending":
      return { status: "refund_pending", orderId };
    case "succeeded":
      return { status: "refund_succeeded", orderId };
    case "failed":
      return { status: "refund_failed", orderId };
  }
}
