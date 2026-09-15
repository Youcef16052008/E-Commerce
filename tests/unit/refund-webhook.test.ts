import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

const refundRepository = vi.hoisted(() => ({
  processRefundWebhook: vi.fn(),
}));

vi.mock("@/features/refunds/infrastructure/refund-repo", () => refundRepository);

import { handleStripeRefundWebhook } from "@/features/refunds/application/refund-webhook-service";

function refundEvent(status = "succeeded"): Stripe.Event {
  return {
    id: "evt_refund_1",
    type: "refund.updated",
    data: {
      object: {
        id: "re_1",
        object: "refund",
        metadata: { refundRequestId: "refund-request-1", orderId: "order-1" },
        payment_intent: "pi_1",
        amount: 499,
        currency: "usd",
        status,
        failure_reason: null,
      },
    },
  } as unknown as Stripe.Event;
}

describe("Stripe refund webhook routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refundRepository.processRefundWebhook.mockResolvedValue("succeeded");
  });

  it("passes the Stripe refund proof to the atomic refund workflow", async () => {
    await expect(handleStripeRefundWebhook(refundEvent())).resolves.toEqual({
      status: "refund_succeeded",
      orderId: "order-1",
    });

    expect(refundRepository.processRefundWebhook).toHaveBeenCalledWith({
      eventId: "evt_refund_1",
      eventType: "refund.updated",
      refundRequestId: "refund-request-1",
      orderId: "order-1",
      stripeRefundId: "re_1",
      paymentIntentId: "pi_1",
      amountInCents: 499,
      currency: "usd",
      status: "succeeded",
      failureCode: null,
    });
  });

  it("keeps a pending Stripe refund pending locally", async () => {
    refundRepository.processRefundWebhook.mockResolvedValue("pending");

    await expect(handleStripeRefundWebhook(refundEvent("pending"))).resolves.toEqual({
      status: "refund_pending",
      orderId: "order-1",
    });
  });

  it("ignores an unrelated refund that has no Biblio metadata", async () => {
    const event = refundEvent();
    (event.data.object as unknown as { metadata: Record<string, string> }).metadata = {};

    await expect(handleStripeRefundWebhook(event)).resolves.toEqual({
      status: "ignored_missing_metadata",
    });
    expect(refundRepository.processRefundWebhook).not.toHaveBeenCalled();
  });
});
