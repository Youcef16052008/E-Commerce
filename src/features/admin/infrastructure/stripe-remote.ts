import { getStripe } from "@/server/payments/stripe";
import type { RemoteStripePayment } from "../domain/stripe-reconciliation";

export type StripeRemoteLookup =
  { kind: "found"; payment: RemoteStripePayment } | { kind: "not-found" } | { kind: "error" };

function isStripeMissingResource(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "resource_missing"
  );
}

/**
 * Retrieves exactly one persisted Payment Intent and its first 100 refunds.
 * It never searches a whole Stripe account, and it never writes Stripe or
 * Biblio financial data. `refundsTruncated` makes any over-limit comparison
 * visibly incomplete rather than quietly claiming it matched.
 */
export async function readStripePaymentForReconciliation(
  paymentIntentId: string,
): Promise<StripeRemoteLookup> {
  try {
    const stripe = getStripe();
    // One object at a time: a missing Payment Intent does not trigger a second
    // request, and the CLI stays deliberately gentle on Stripe's API.
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    const refundList = await stripe.refunds.list({ payment_intent: paymentIntentId, limit: 100 });

    return {
      kind: "found",
      payment: {
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
        amountInCents: paymentIntent.amount,
        amountReceivedInCents: paymentIntent.amount_received,
        currency: paymentIntent.currency,
        orderIdMetadata: paymentIntent.metadata.orderId ?? null,
        refunds: refundList.data.map((refund) => ({
          id: refund.id,
          amountInCents: refund.amount,
          currency: refund.currency,
          status: refund.status,
          refundRequestId: refund.metadata?.refundRequestId ?? null,
        })),
        refundsTruncated: refundList.has_more,
      },
    };
  } catch (error) {
    if (isStripeMissingResource(error)) return { kind: "not-found" };
    // Keep provider error text out of this cross-layer result and every audit/log.
    return { kind: "error" };
  }
}
