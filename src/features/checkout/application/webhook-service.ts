import type Stripe from "stripe";
import { getStripe } from "@/server/payments/stripe";
import {
  failCheckoutFromWebhook,
  fulfillPaidOrderFromWebhook,
} from "../infrastructure/checkout-repo";
import { handleStripeRefundWebhook } from "@/features/refunds/application/refund-webhook-service";

/**
 * A Stripe event is acknowledged only after its idempotency record and the
 * resulting business mutation have committed in the same database transaction.
 * Any mismatch or database error is deliberately thrown to the route: Stripe
 * receives a 5xx and retries instead of Biblio silently losing the event.
 */
export type WebhookResult =
  | { status: "duplicate" }
  | { status: "deferred_awaiting_payment"; orderId: string }
  | { status: "ignored_missing_metadata" }
  | { status: "already_settled"; orderId: string }
  | { status: "fulfilled"; orderId: string }
  | { status: "marked_failed"; orderId: string }
  | { status: "ignored_unknown_refund" }
  | { status: "refund_pending"; orderId: string }
  | { status: "refund_succeeded"; orderId: string }
  | { status: "refund_failed"; orderId: string }
  | { status: "unhandled" };

/** Vérifie la signature et renvoie l'évènement parsé. Retourne null si invalide. */
export function parseAndVerifyWebhook(
  rawBody: string,
  signature: string | null,
): Stripe.Event | null {
  if (!signature) return null;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not set.");
  }
  try {
    return getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return null;
  }
}

function sessionMetadata(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.orderId;
  const userId = session.metadata?.userId;
  return orderId && userId ? { orderId, userId } : null;
}

function paymentIntentId(session: Stripe.Checkout.Session) {
  if (typeof session.payment_intent === "string") return session.payment_intent;
  return session.payment_intent?.id ?? null;
}

async function fulfillFromSession(
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
): Promise<WebhookResult> {
  const metadata = sessionMetadata(session);
  if (!metadata) return { status: "ignored_missing_metadata" };

  // A completed Checkout can precede settlement for asynchronous methods.
  if (session.payment_status !== "paid") {
    return { status: "deferred_awaiting_payment", orderId: metadata.orderId };
  }

  if (session.amount_total === null || !session.currency) {
    throw new Error("Paid Stripe Checkout session has no amount or currency");
  }

  const result = await fulfillPaidOrderFromWebhook({
    eventId: event.id,
    eventType: event.type,
    orderId: metadata.orderId,
    userId: metadata.userId,
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId: paymentIntentId(session),
    totalInCents: session.amount_total,
    currency: session.currency,
  });

  switch (result.kind) {
    case "duplicate-event":
      return { status: "duplicate" };
    case "already-fulfilled":
      return { status: "already_settled", orderId: result.orderId };
    case "fulfilled":
      return { status: "fulfilled", orderId: result.orderId };
  }
}

async function failFromSession(
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
): Promise<WebhookResult> {
  const metadata = sessionMetadata(session);
  if (!metadata) return { status: "ignored_missing_metadata" };

  const result = await failCheckoutFromWebhook({
    eventId: event.id,
    eventType: event.type,
    orderId: metadata.orderId,
    userId: metadata.userId,
    stripeCheckoutSessionId: session.id,
  });

  if (result === "duplicate-event") return { status: "duplicate" };
  if (result === "already-processed")
    return { status: "already_settled", orderId: metadata.orderId };
  return { status: "marked_failed", orderId: metadata.orderId };
}

export async function handleWebhook(event: Stripe.Event): Promise<WebhookResult> {
  // The async variants are strings because the SDK's received-event union is
  // intentionally not exhaustive.
  const type: string = event.type;
  switch (type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return fulfillFromSession(event, event.data.object as Stripe.Checkout.Session);
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired":
      return failFromSession(event, event.data.object as Stripe.Checkout.Session);
    case "refund.created":
    case "refund.updated":
    case "refund.failed":
      return handleStripeRefundWebhook(event);
    default:
      return { status: "unhandled" };
  }
}
