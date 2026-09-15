import { NextRequest, NextResponse } from "next/server";
import {
  parseAndVerifyWebhook,
  handleWebhook,
} from "@/features/checkout/application/webhook-service";

/**
 * POST /api/webhooks/stripe — réception des évènements Stripe.
 * - Le corps est lu en BRUT (`request.text()`), jamais JSON-parsé avant vérif.
 * - La signature est vérifiée avec `constructEvent` (source de vérité).
 * - Le traitement est ATTENDU avant de répondre (registre H-1) : en
 *   serverless (Vercel), un travail laissé tourner après la réponse est tué de
 *   façon non déterministe → perte de paiements. En cas d'erreur, on répond
 *   500 : Stripe réessaie avec backoff, et le traitement est idempotent
 *   (table `stripe_events` + fulfillment atomique).
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  try {
    const event = parseAndVerifyWebhook(rawBody, signature);
    if (event == null) {
      return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
    }

    await handleWebhook(event);
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[webhook] processing error", err);
    // A 5xx makes Stripe retry. This includes a missing server secret or a
    // database mismatch: neither is safe to acknowledge as processed.
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
