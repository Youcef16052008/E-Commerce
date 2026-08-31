import { getCartForCheckout, createPendingOrder } from "../infrastructure/checkout-repo";
import { createCheckoutSession } from "../infrastructure/stripe-checkout";
import type { CheckoutResult, CheckoutError } from "../domain/checkout-types";

/**
 * Service de création d'un checkout.
 * - Re-vérifie le panier côté serveur (prix depuis `products`).
 * - Crée (ou réutilise) une commande `pending` et ses items (snapshot).
 * - Crée une session Stripe avec des prix serveur et un idempotency-key.
 * - Renvoie l'URL de redirection.
 */
export async function createCheckout(
  userId: string,
): Promise<{ ok: true; result: CheckoutResult } | { ok: false; error: CheckoutError }> {
  const cartItems = await getCartForCheckout(userId);
  if (cartItems.length === 0) {
    return { ok: false, error: { code: "EMPTY_CART" } };
  }

  const currency = cartItems[0].currency;
  const totalInCents = cartItems.reduce((s, it) => s + it.priceInCents * it.quantity, 0);

  const { orderId } = await createPendingOrder(
    userId,
    cartItems.map((it) => ({
      productId: it.productId,
      title: it.title,
      priceInCents: it.priceInCents,
      quantity: it.quantity,
      currency: it.currency,
    })),
    totalInCents,
    currency,
  );

  try {
    const session = await createCheckoutSession({
      orderId,
      userId,
      currency,
      items: cartItems.map((it) => ({
        productId: it.productId,
        title: it.title,
        priceInCents: it.priceInCents,
        quantity: it.quantity,
      })),
      idempotencyKey: `checkout-${userId}-${orderId}`,
      successUrl: `${origin()}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin()}/cart`,
    });
    return { ok: true, result: { url: session.url ?? "", orderId } };
  } catch (err) {
    console.error("[checkout] stripe session error", err);
    return { ok: false, error: { code: "PAYMENT_ERROR" } };
  }
}

function origin(): string {
  return process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
}
