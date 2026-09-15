import { beforeEach, describe, expect, it, vi } from "vitest";

const stripe = vi.hoisted(() => ({
  paymentIntents: { retrieve: vi.fn() },
  refunds: { list: vi.fn() },
}));

vi.mock("@/server/payments/stripe", () => ({ getStripe: () => stripe }));

import { readStripePaymentForReconciliation } from "@/features/admin/infrastructure/stripe-remote";

describe("Stripe remote reconciliation reader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stripe.paymentIntents.retrieve.mockResolvedValue({
      id: "pi_1",
      status: "succeeded",
      amount: 499,
      amount_received: 499,
      currency: "usd",
      metadata: { orderId: "order-1" },
    });
    stripe.refunds.list.mockResolvedValue({ data: [], has_more: false });
  });

  it("retrieves exactly the persisted Payment Intent and lists its refunds", async () => {
    await expect(readStripePaymentForReconciliation("pi_1")).resolves.toEqual({
      kind: "found",
      payment: {
        paymentIntentId: "pi_1",
        status: "succeeded",
        amountInCents: 499,
        amountReceivedInCents: 499,
        currency: "usd",
        orderIdMetadata: "order-1",
        refunds: [],
        refundsTruncated: false,
      },
    });

    expect(stripe.paymentIntents.retrieve).toHaveBeenCalledWith("pi_1");
    expect(stripe.refunds.list).toHaveBeenCalledWith({ payment_intent: "pi_1", limit: 100 });
  });

  it("does not turn a missing remote object into a false match", async () => {
    stripe.paymentIntents.retrieve.mockRejectedValue({ code: "resource_missing" });

    await expect(readStripePaymentForReconciliation("pi_missing")).resolves.toEqual({
      kind: "not-found",
    });
    expect(stripe.refunds.list).not.toHaveBeenCalled();
  });
});
