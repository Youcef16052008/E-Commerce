import type Stripe from "stripe";
import { getStripe } from "@/server/payments/stripe";
import {
  recordStripeEvent,
  fulfillPaidOrder,
  markOrderFailed,
  getOrderForWebhook,
} from "../infrastructure/checkout-repo";

/**
 * Traitement d'un webhook Stripe.
 * - Vérifie la signature sur le corps BRUT (source de vérité du paiement).
 * - Idempotence : enregistre `event.id` (contrainte UNIQUE) ; si déjà traité, ignore.
 * - Sur `checkout.session.completed` :
 *   - `payment_status !== "paid"` → NE PAS fulfiller. Pour les modes de paiement
 *     à notification différée (virement, SEPA, OXXO…), cet événement arrive à la
 *     SOUMISSION du formulaire, pas à l'arrivée de l'argent (registre H-3).
 *     Le fulfillment se fait sur `async_payment_succeeded`.
 *   - montant de la commande ≠ `amount_total` → NE PAS fulfiller (écart = fraude
 *     ou bug ; à investiguer manuellement).
 *   - sinon `fulfillPaidOrder` (transaction : paid + entitlements + panier).
 * - `async_payment_succeeded` : fulfillment (paiement différé finalement payé).
 * - `async_payment_failed` : commande → `failed` (uniquement si encore pending).
 */

export type WebhookResult =
  | { status: "duplicate" }
  | { status: "deferred_awaiting_payment"; orderId: string }
  | { status: "ignored_missing_metadata" }
  | { status: "ignored_unknown_order"; orderId: string }
  | { status: "rejected_amount_mismatch"; orderId: string }
  | { status: "already_settled"; orderId: string }
  | { status: "fulfilled"; orderId: string; entitlementsCreated: number }
  | { status: "marked_failed"; orderId: string }
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
    // signature invalide → rejet
    return null;
  }
}

/**
 * Vérifications communes avant fulfillment : métadonnées, paiement réellement
 * soldé, commande connue et montant identique.
 */
async function fulfillFromSession(session: Stripe.Checkout.Session): Promise<WebhookResult> {
  const orderId = session.metadata?.orderId;
  const userId = session.metadata?.userId;
  if (!orderId || !userId) {
    // metadata manquant → on ne peut pas délivrer, ne pas casser le webhook
    return { status: "ignored_missing_metadata" };
  }

  // H-3 : `checkout.session.completed` ≠ « l'argent est arrivé ».
  if (session.payment_status !== "paid") {
    return { status: "deferred_awaiting_payment", orderId };
  }

  const order = await getOrderForWebhook(orderId, userId);
  if (!order) {
    return { status: "ignored_unknown_order", orderId };
  }

  if (order.totalInCents !== session.amount_total) {
    console.error("[webhook] amount mismatch — fulfillment refusé", {
      orderId,
      orderTotalInCents: order.totalInCents,
      stripeAmountTotal: session.amount_total,
    });
    return { status: "rejected_amount_mismatch", orderId };
  }

  const created = await fulfillPaidOrder(userId, orderId);
  if (created === null) {
    // déjà payée/fulfilled/refundée → idempotence
    return { status: "already_settled", orderId };
  }
  return { status: "fulfilled", orderId, entitlementsCreated: created };
}

export async function handleWebhook(event: Stripe.Event): Promise<WebhookResult> {
  // Double idempotence : si l'évènement a déjà été traité, on ignore.
  const isNewEvent = await recordStripeEvent(event.id, event.type);
  if (!isNewEvent) {
    return { status: "duplicate" };
  }

  // Les événements `async_payment_*` ne font pas partie de l'union typée du
  // SDK Stripe : on les compare en string brut (les types du SDK ne sont pas
  // exhaustifs côté réception). Noms EXACTS de la API Stripe — avec le préfixe
  // `checkout.session.` : c'est l'identifiant réel que Stripe envoie.
  const type: string = event.type;
  if (type === "checkout.session.async_payment_failed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.orderId;
    if (!orderId) {
      return { status: "ignored_missing_metadata" };
    }
    const marked = await markOrderFailed(orderId);
    return marked ? { status: "marked_failed", orderId } : { status: "already_settled", orderId };
  }

  switch (type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      return fulfillFromSession(event.data.object as Stripe.Checkout.Session);
    }
    default:
      return { status: "unhandled" };
  }
}
