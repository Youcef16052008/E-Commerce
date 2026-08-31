import Stripe from "stripe";

/**
 * Client Stripe (mode test) — côté serveur uniquement.
 * La clé secrète ne transite jamais vers le client.
 *
 * Le client est créé paresseusement (à la première utilisation) pour que
 * l'import du module ne lève pas en l'absence de clé (utile dans les tests).
 */
let _client: Stripe | null = null;

export function getStripe(): Stripe {
  if (_client) return _client;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not set. See .env.example.");
  }
  _client = new Stripe(secretKey, {
    typescript: true,
  });
  return _client;
}

export type StripeClient = Stripe;
