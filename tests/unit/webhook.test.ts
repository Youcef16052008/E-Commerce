import { describe, it, expect, beforeAll } from "vitest";
import Stripe from "stripe";
import { parseAndVerifyWebhook } from "@/features/checkout/application/webhook-service";

/**
 * Test de la vérification de signature webhook Stripe.
 * Utilise `generateTestHeaderString` (SDK) pour produire une signature VALIDE,
 * et un secret de test local, puis vérifie le mécanisme de `constructEvent`.
 */
const TEST_SECRET = "whsec_test_signing_secret_0123456789";

const stripe = new Stripe("sk_test_placeholder");

beforeAll(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";
  process.env.STRIPE_WEBHOOK_SECRET = TEST_SECRET;
});

function makeSignature(payload: string) {
  return stripe.webhooks.generateTestHeaderString({ payload, secret: TEST_SECRET });
}

describe("parseAndVerifyWebhook", () => {
  const payload = JSON.stringify({
    id: "evt_test_123",
    type: "checkout.session.completed",
  });

  it("accepte une signature valide (construit l'évènement)", () => {
    const sig = makeSignature(payload);
    const event = parseAndVerifyWebhook(payload, sig);
    expect(event).not.toBeNull();
    expect(event!.id).toBe("evt_test_123");
    expect(event!.type).toBe("checkout.session.completed");
  });

  it("rejette une signature invalide (payload altéré)", () => {
    const sig = makeSignature(payload);
    const result = parseAndVerifyWebhook(payload + " ", sig);
    expect(result).toBeNull();
  });

  it("rejette l'absence de signature", () => {
    const result = parseAndVerifyWebhook(payload, null);
    expect(result).toBeNull();
  });
});
