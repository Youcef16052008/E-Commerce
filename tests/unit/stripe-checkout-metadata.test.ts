import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn());
vi.mock("@/server/payments/stripe", () => ({
  getStripe: () => ({ checkout: { sessions: { create } } }),
}));

import { createCheckoutSession } from "@/features/checkout/infrastructure/stripe-checkout";

describe("Stripe Checkout metadata propagation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    create.mockResolvedValue({ id: "cs_1" });
  });

  it("persists Biblio IDs on both Checkout and its Payment Intent", async () => {
    await createCheckoutSession({
      orderId: "order-1",
      userId: "customer-1",
      currency: "usd",
      items: [{ productId: "book-1", title: "Book", priceInCents: 499, quantity: 1 }],
      idempotencyKey: "checkout-order-order-1",
      successUrl: "https://biblio.test/checkout/success",
      cancelUrl: "https://biblio.test/cart",
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { orderId: "order-1", userId: "customer-1" },
        payment_intent_data: {
          metadata: { orderId: "order-1", userId: "customer-1" },
        },
      }),
      { idempotencyKey: "checkout-order-order-1" },
    );
  });
});
