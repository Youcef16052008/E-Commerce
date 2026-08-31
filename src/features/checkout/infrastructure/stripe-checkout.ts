import { getStripe } from "@/server/payments/stripe";

/**
 * Code fiscal produit pour Stripe Checkout.
 * La plupart des comptes de test Stripe ont "Managed Payments" activé par défaut, qui
 * exige un `tax_code` éligible. On autorise une configuration explicite via
 * `STRIPE_TAX_CODE` ; si vide, on désactive Managed Payments sur la session
 * (aucun produit taxé, adapté au mode test sans taxe).
 */
const TAX_CODE = process.env.STRIPE_TAX_CODE ?? "";

/**
 * Crée une session Stripe Checkout à partir d'items dont les prix viennent du serveur.
 * - `metadata` : ordre + utilisateur (source de vérité pour le webhook).
 * - `Idempotency-Key` : évite les sessions dupliquées sur une double création.
 */
export async function createCheckoutSession(params: {
  orderId: string;
  userId: string;
  currency: string;
  items: { title: string; priceInCents: number; quantity: number; productId: string }[];
  idempotencyKey: string;
  successUrl: string;
  cancelUrl: string;
}) {
  const disableManagedPayments = TAX_CODE === "";

  return getStripe().checkout.sessions.create(
    {
      mode: "payment",
      currency: params.currency,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: {
        orderId: params.orderId,
        userId: params.userId,
      },
      line_items: params.items.map((it) => ({
        quantity: it.quantity,
        price_data: {
          currency: params.currency,
          unit_amount: it.priceInCents, // prix ALWAYS relu côté serveur
          product_data: { name: it.title, ...(TAX_CODE ? { tax_code: TAX_CODE } : {}) },
        },
      })),
      ...(disableManagedPayments ? { managed_payments: { enabled: false } } : {}),
    },
    { idempotencyKey: params.idempotencyKey },
  );
}
