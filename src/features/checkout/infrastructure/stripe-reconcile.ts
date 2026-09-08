import type Stripe from "stripe";
import { getStripe } from "@/server/payments/stripe";
import { recordStripeEvent, recordRefund } from "./checkout-repo";

export interface ReconcileResult {
  orderId: string;
  stripeStatus: string;
  paymentStatus: string;
  amountRefunded: number;
  dbStatus: string;
  action: "synced" | "refunded" | "mismatch";
}

/**
 * Réconcilie une commande avec l'état distant Stripe.
 * - Vérifie le PaymentIntent / Checkout Session lié.
 * - Enregistre les refunds Stripe dans la BDD.
 * - Met à jour le statut si nécessaire.
 */
export async function reconcileOrderWithStripeRemote(orderId: string): Promise<ReconcileResult> {
  const stripe = getStripe();

  const sessions = await stripe.checkout.sessions.list({
    limit: 10,
    expand: ["data.payment_intent"],
  });

  const session = sessions.data.find((s) => s.metadata?.orderId === orderId);
  if (!session) {
    return { orderId, stripeStatus: "unknown", paymentStatus: "unknown", amountRefunded: 0, dbStatus: "unknown", action: "mismatch" };
  }

  const paymentIntent = session.payment_intent as Stripe.PaymentIntent | null;
  const stripeStatus = paymentIntent?.status ?? "no_payment_intent";
  const paymentStatus = session.payment_status ?? "unknown";
  let amountRefunded = 0;
  if (paymentIntent) {
    const charges = await stripe.charges.list({ payment_intent: paymentIntent.id, limit: 10 });
    amountRefunded = charges.data.reduce((sum, c) => sum + (c.amount_refunded ?? 0), 0);
  }

  const isNew = await recordStripeEvent(`reconcile-${orderId}`, "reconciliation.check");
  if (!isNew) {
    return { orderId, stripeStatus, paymentStatus, amountRefunded, dbStatus: "unknown", action: "synced" };
  }

  if (amountRefunded > 0 && paymentIntent) {
    const charges = await stripe.charges.list({ payment_intent: paymentIntent.id, limit: 10 });
    for (const charge of charges.data) {
      if (charge.refunded) {
        const refunds = await stripe.refunds.list({ charge: charge.id, limit: 10 });
        const validRefunds = refunds.data.filter((r): r is Stripe.Refund => r !== null && r !== undefined && r.id !== null);
        for (const refund of validRefunds) {
          if (!refund.id) continue;
          await recordRefund({
            orderId,
            stripeRefundId: refund.id as string,
            amountInCents: refund.amount,
            currency: refund.currency,
            status: refund.status as string,
            reason: refund.reason ?? undefined,
          });
        }
      }
    }
    return { orderId, stripeStatus, paymentStatus, amountRefunded, dbStatus: "refunded", action: "refunded" };
  }

  return { orderId, stripeStatus, paymentStatus, amountRefunded, dbStatus: "synced", action: "synced" };
}
