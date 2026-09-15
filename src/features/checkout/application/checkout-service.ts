import crypto from "node:crypto";
import {
  attachCheckoutSession,
  createOrReusePendingOrder,
  expirePendingCheckout,
  getCartForCheckout,
  getEntitledProductIds,
} from "../infrastructure/checkout-repo";
import { createCheckoutSession, getCheckoutSession } from "../infrastructure/stripe-checkout";
import type { CheckoutError, CheckoutResult } from "../domain/checkout-types";

/**
 * Creates (or safely resumes) a Stripe Checkout intent.
 *
 * The pending order is an immutable price snapshot. Its deterministic key and
 * the matching Stripe idempotency key mean a double click, a network retry or
 * two browser tabs cannot create two payable sessions for the same basket.
 */
export async function createCheckout(
  userId: string,
): Promise<{ ok: true; result: CheckoutResult } | { ok: false; error: CheckoutError }> {
  const cartItems = await getCartForCheckout(userId);
  if (cartItems.length === 0) {
    return { ok: false, error: { code: "EMPTY_CART" } };
  }

  if (cartItems.some((item) => item.quantity !== 1)) {
    return { ok: false, error: { code: "INVALID_LICENSE_QUANTITY" } };
  }

  const ownedProductIds = await getEntitledProductIds(
    userId,
    cartItems.map((item) => item.productId),
  );
  if (ownedProductIds.length > 0) {
    return { ok: false, error: { code: "ALREADY_OWNED", productIds: ownedProductIds } };
  }

  const currencies = new Set(cartItems.map((item) => item.currency.toLowerCase()));
  if (currencies.size > 1) {
    return { ok: false, error: { code: "MIXED_CURRENCY" } };
  }

  const currency = cartItems[0].currency.toLowerCase();
  const totalInCents = cartItems.reduce((sum, item) => sum + item.priceInCents, 0);
  const checkoutKey = fingerprintCheckout(userId, currency, cartItems);

  const order = await createOrReusePendingOrder({
    userId,
    items: cartItems,
    totalInCents,
    currency,
    checkoutKey,
  });

  if (order.status !== "pending") {
    return { ok: false, error: { code: "CHECKOUT_NOT_AVAILABLE" } };
  }

  if (order.stripeCheckoutSessionId) {
    try {
      const existingSession = await getCheckoutSession(order.stripeCheckoutSessionId);
      if (existingSession.status === "open" && existingSession.url) {
        return { ok: true, result: { url: existingSession.url, orderId: order.id } };
      }

      if (existingSession.status === "expired") {
        await expirePendingCheckout(order.id, existingSession.id);
        // The failed order remains auditable. A cleared checkout key lets this
        // exact basket create one new, distinct intent on the retry.
        return createCheckout(userId);
      }

      return { ok: false, error: { code: "CHECKOUT_NOT_AVAILABLE" } };
    } catch (error) {
      console.error("[checkout] could not reload persisted Stripe session", error);
      return { ok: false, error: { code: "PAYMENT_ERROR" } };
    }
  }

  try {
    const session = await createCheckoutSession({
      orderId: order.id,
      userId,
      currency,
      items: cartItems.map((item) => ({
        productId: item.productId,
        title: item.title,
        priceInCents: item.priceInCents,
        quantity: 1,
      })),
      // Must be stable for this order: Stripe returns the original session on a
      // retry even when the first HTTP response was lost.
      idempotencyKey: `checkout-order-${order.id}`,
      successUrl: `${origin()}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin()}/cart`,
    });

    if (!session.url) throw new Error("Stripe Checkout returned no redirect URL");

    await attachCheckoutSession({
      orderId: order.id,
      stripeCheckoutSessionId: session.id,
      checkoutExpiresAt: session.expires_at ? new Date(session.expires_at * 1000) : null,
    });

    return { ok: true, result: { url: session.url, orderId: order.id } };
  } catch (error) {
    // Do not delete the pending order: if Stripe accepted the request before a
    // network failure, the same idempotency key is the only safe retry path.
    console.error("[checkout] Stripe session error", error);
    return { ok: false, error: { code: "PAYMENT_ERROR" } };
  }
}

function fingerprintCheckout(
  userId: string,
  currency: string,
  items: { productId: string; priceInCents: number; quantity: number }[],
) {
  const immutableLines = items
    .map((item) => `${item.productId}:${item.priceInCents}:${item.quantity}`)
    .sort()
    .join("|");

  return crypto
    .createHash("sha256")
    .update(`${userId}|${currency}|${immutableLines}`)
    .digest("hex");
}

function origin(): string {
  return process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
}
