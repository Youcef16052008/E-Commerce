import type Stripe from "stripe";
import { getStripe } from "@/server/payments/stripe";
import {
  recordStripeEvent,
  markOrderPaid,
  grantEntitlements,
  clearCartForUser,
} from "../infrastructure/checkout-repo";

/**
 * Traitement d'un webhook Stripe.
 * - Vérifie la signature sur le corps BRUT (source de vérité du paiement).
 * - Idempotence : enregistre `event.id` (contrainte UNIQUE) ; si déjà traité, ignore.
 * - Sur `checkout.session.completed` : marque la commande payée, accorde les droits
 *   (entitlements), vide le panier.
 */

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

export async function handleWebhook(event: Stripe.Event) {
  // Double idempotence : si l'évènement a déjà été traité, on ignore.
  const isNewEvent = await recordStripeEvent(event.id, event.type);
  if (!isNewEvent) {
    return { status: "duplicate" as const };
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.orderId;
      const userId = session.metadata?.userId;
      if (!orderId || !userId) {
        // metadata manquant → on ne peut pas délivrer, ne pas casser le webhook
        return { status: "ignored_missing_metadata" as const };
      }
      await markOrderPaid(orderId);
      await grantEntitlements(userId, orderId);
      await clearCartForUser(userId);
      return { status: "fulfilled" as const, orderId };
    }
    default:
      return { status: "unhandled" as const };
  }
}
