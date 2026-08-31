import { NextRequest, NextResponse } from "next/server";
import {
  parseAndVerifyWebhook,
  handleWebhook,
} from "@/features/checkout/application/webhook-service";

/**
 * POST /api/webhooks/stripe — réception des évènements Stripe.
 * - Le corps est lu en BRUT (`request.text()`), jamais JSON-parsé avant vérif.
 * - La signature est vérifiée avec `constructEvent` (source de vérité).
 * - Réponse 200 rapide ; traitement asynchrone.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  const event = parseAndVerifyWebhook(rawBody, signature);
  if (event == null) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  // Réponse 2xx immédiate ; le traitement lourd tourne en arrière-plan.
  // On ne bloque pas Stripe (il ferait des retries si on dépasse le délai).
  setTimeout(() => {
    handleWebhook(event).catch((err) => {
      console.error("[webhook] processing error", err, { eventId: event.id, type: event.type });
    });
  }, 0);

  return NextResponse.json({ received: true });
}
