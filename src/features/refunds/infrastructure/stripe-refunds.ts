import { getStripe } from "@/server/payments/stripe";
import type { RefundReason } from "../domain/refund-types";

/**
 * Creates the remote refund only after a durable local reservation exists.
 * The idempotency key is tied to that reservation, never to a browser request.
 */
export async function createStripeFullRefund(input: {
  refundRequestId: string;
  orderId: string;
  paymentIntentId: string;
  amountInCents: number;
  reason: RefundReason;
}) {
  return getStripe().refunds.create(
    {
      payment_intent: input.paymentIntentId,
      // Explicit amount prevents a silently partial refund if an external
      // refund has already consumed part of the Payment Intent balance.
      amount: input.amountInCents,
      reason: input.reason,
      metadata: {
        refundRequestId: input.refundRequestId,
        orderId: input.orderId,
      },
    },
    { idempotencyKey: `refund-request-${input.refundRequestId}` },
  );
}
