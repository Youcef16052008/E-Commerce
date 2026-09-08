import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

const checkoutRepository = vi.hoisted(() => ({
  failCheckoutFromWebhook: vi.fn(),
  fulfillPaidOrderFromWebhook: vi.fn(),
}));

vi.mock("@/features/checkout/infrastructure/checkout-repo", () => checkoutRepository);

import { handleWebhook } from "@/features/checkout/application/webhook-service";

function paidEvent(): Stripe.Event {
  return {
    id: "evt_paid_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_1",
        object: "checkout.session",
        metadata: { orderId: "order-1", userId: "customer-1" },
        payment_status: "paid",
        payment_intent: "pi_1",
        amount_total: 499,
        currency: "usd",
      },
    },
  } as unknown as Stripe.Event;
}

describe("Stripe webhook fulfillment routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkoutRepository.fulfillPaidOrderFromWebhook.mockResolvedValue({
      kind: "fulfilled",
      orderId: "order-1",
    });
  });

  it("passes Stripe identifiers, total and currency to the atomic repository operation", async () => {
    await expect(handleWebhook(paidEvent())).resolves.toEqual({
      status: "fulfilled",
      orderId: "order-1",
    });

    expect(checkoutRepository.fulfillPaidOrderFromWebhook).toHaveBeenCalledWith({
      eventId: "evt_paid_1",
      eventType: "checkout.session.completed",
      orderId: "order-1",
      userId: "customer-1",
      stripeCheckoutSessionId: "cs_1",
      stripePaymentIntentId: "pi_1",
      totalInCents: 499,
      currency: "usd",
    });
  });

  it("does not swallow an atomic fulfillment failure: the route must answer 5xx so Stripe retries", async () => {
    checkoutRepository.fulfillPaidOrderFromWebhook.mockRejectedValue(
      new Error("Stripe payment does not match the pending order"),
    );

    await expect(handleWebhook(paidEvent())).rejects.toThrow("does not match");
  });

  it("does not record a deferred completed event as fulfilled", async () => {
    const event = paidEvent();
    (event.data.object as unknown as { payment_status: string }).payment_status = "unpaid";

    await expect(handleWebhook(event)).resolves.toEqual({
      status: "deferred_awaiting_payment",
      orderId: "order-1",
    });
    expect(checkoutRepository.fulfillPaidOrderFromWebhook).not.toHaveBeenCalled();
  });
});
