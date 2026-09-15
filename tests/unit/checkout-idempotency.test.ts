import { beforeEach, describe, expect, it, vi } from "vitest";

const checkoutRepository = vi.hoisted(() => ({
  attachCheckoutSession: vi.fn(),
  createOrReusePendingOrder: vi.fn(),
  expirePendingCheckout: vi.fn(),
  getCartForCheckout: vi.fn(),
  getEntitledProductIds: vi.fn(),
}));
const stripeCheckout = vi.hoisted(() => ({
  createCheckoutSession: vi.fn(),
  getCheckoutSession: vi.fn(),
}));

vi.mock("@/features/checkout/infrastructure/checkout-repo", () => checkoutRepository);
vi.mock("@/features/checkout/infrastructure/stripe-checkout", () => stripeCheckout);

import { createCheckout } from "@/features/checkout/application/checkout-service";

const oneBook = [
  {
    productId: "book-1",
    title: "A real book",
    priceInCents: 499,
    currency: "usd",
    quantity: 1,
  },
];

describe("createCheckout transaction safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkoutRepository.getCartForCheckout.mockResolvedValue(oneBook);
    checkoutRepository.getEntitledProductIds.mockResolvedValue([]);
    checkoutRepository.createOrReusePendingOrder.mockResolvedValue({
      id: "order-1",
      status: "pending",
      stripeCheckoutSessionId: null,
      checkoutExpiresAt: null,
      created: true,
    });
    stripeCheckout.createCheckoutSession.mockResolvedValue({
      id: "cs_1",
      url: "https://checkout.stripe.test/cs_1",
      expires_at: 1_800_000_000,
    });
    checkoutRepository.attachCheckoutSession.mockResolvedValue(undefined);
  });

  it("rejects legacy multi-quantity rows rather than charging for an ambiguous licence", async () => {
    checkoutRepository.getCartForCheckout.mockResolvedValue([{ ...oneBook[0], quantity: 2 }]);

    const result = await createCheckout("customer-1");

    expect(result).toEqual({ ok: false, error: { code: "INVALID_LICENSE_QUANTITY" } });
    expect(checkoutRepository.createOrReusePendingOrder).not.toHaveBeenCalled();
  });

  it("revalidates existing entitlements immediately before checkout", async () => {
    checkoutRepository.getEntitledProductIds.mockResolvedValue(["book-1"]);

    const result = await createCheckout("customer-1");

    expect(result).toEqual({
      ok: false,
      error: { code: "ALREADY_OWNED", productIds: ["book-1"] },
    });
    expect(checkoutRepository.createOrReusePendingOrder).not.toHaveBeenCalled();
  });

  it("uses the order-bound Stripe idempotency key and persists the returned session", async () => {
    const result = await createCheckout("customer-1");

    expect(result).toEqual({
      ok: true,
      result: { orderId: "order-1", url: "https://checkout.stripe.test/cs_1" },
    });
    expect(checkoutRepository.createOrReusePendingOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "customer-1",
        totalInCents: 499,
        currency: "usd",
        items: oneBook,
        checkoutKey: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    expect(stripeCheckout.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "checkout-order-order-1" }),
    );
    expect(checkoutRepository.attachCheckoutSession).toHaveBeenCalledWith({
      orderId: "order-1",
      stripeCheckoutSessionId: "cs_1",
      checkoutExpiresAt: new Date(1_800_000_000 * 1000),
    });
  });

  it("returns the persisted open Checkout session instead of making another Stripe intent", async () => {
    checkoutRepository.createOrReusePendingOrder.mockResolvedValue({
      id: "order-1",
      status: "pending",
      stripeCheckoutSessionId: "cs_existing",
      checkoutExpiresAt: new Date(),
      created: false,
    });
    stripeCheckout.getCheckoutSession.mockResolvedValue({
      id: "cs_existing",
      status: "open",
      url: "https://checkout.stripe.test/cs_existing",
    });

    const result = await createCheckout("customer-1");

    expect(result).toEqual({
      ok: true,
      result: { orderId: "order-1", url: "https://checkout.stripe.test/cs_existing" },
    });
    expect(stripeCheckout.createCheckoutSession).not.toHaveBeenCalled();
    expect(checkoutRepository.attachCheckoutSession).not.toHaveBeenCalled();
  });
});
