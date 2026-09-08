import { refundRequestSchema } from "../domain/refund-types";
import type { RefundRequestResult } from "../domain/refund-types";
import { attachStripeRefundId, reserveFullOrderRefund } from "../infrastructure/refund-repo";
import { createStripeFullRefund } from "../infrastructure/stripe-refunds";

/**
 * Starts a full-order refund request. The success response only means the
 * request is durably pending: the signed Stripe refund webhook is the sole
 * authority allowed to mark the order refunded and revoke its entitlement.
 */
export async function requestFullOrderRefund(
  orderId: string,
  requestedByUserId: string,
  rawInput: unknown,
): Promise<RefundRequestResult> {
  const parsed = refundRequestSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "VALIDATION", status: 400, message: parsed.error.message },
    };
  }

  const reservation = await reserveFullOrderRefund({
    orderId,
    requestedByUserId,
    reason: parsed.data.reason,
  });

  switch (reservation.kind) {
    case "not-found":
      return { ok: false, error: { code: "NOT_FOUND", status: 404 } };
    case "not-refundable":
      return {
        ok: false,
        error: {
          code: "NOT_REFUNDABLE",
          status: 409,
          message: `La commande est dans l’état « ${reservation.status} » et ne peut pas être remboursée.`,
        },
      };
    case "payment-reference-missing":
      return {
        ok: false,
        error: {
          code: "PAYMENT_REFERENCE_MISSING",
          status: 409,
          message: "Cette commande n’a pas de Payment Intent Stripe vérifiable.",
        },
      };
    case "already-requested":
      return {
        ok: false,
        error: {
          code: "REFUND_ALREADY_REQUESTED",
          status: 409,
          message:
            reservation.status === "pending"
              ? "Un remboursement Stripe est déjà en cours de confirmation."
              : "Cette commande possède déjà une demande de remboursement auditée.",
        },
      };
    case "created":
      break;
  }

  try {
    const stripeRefund = await createStripeFullRefund({
      refundRequestId: reservation.refundRequestId,
      orderId: reservation.orderId,
      paymentIntentId: reservation.paymentIntentId,
      amountInCents: reservation.amountInCents,
      reason: reservation.reason,
    });
    await attachStripeRefundId(reservation.refundRequestId, stripeRefund.id);
  } catch (error) {
    // A timeout does not prove Stripe did not create the refund. Keep the
    // durable request and refund_pending state for retry/reconciliation rather
    // than reverting the order or claiming the refund failed.
    console.error("[refund] Stripe refund request could not be confirmed", error, {
      orderId: reservation.orderId,
      refundRequestId: reservation.refundRequestId,
    });
    return {
      ok: false,
      error: {
        code: "STRIPE_UNAVAILABLE",
        status: 502,
        message:
          "La demande est en attente de vérification Stripe. Ne la soumettez pas une seconde fois.",
      },
    };
  }

  return { ok: true, refundRequestId: reservation.refundRequestId, status: "pending" };
}
