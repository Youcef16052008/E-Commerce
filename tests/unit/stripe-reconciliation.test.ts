import { describe, expect, it } from "vitest";
import { compareStripeOrder } from "@/features/admin/domain/stripe-reconciliation";

const localOrder = {
  orderId: "order-1",
  orderStatus: "paid" as const,
  totalInCents: 499,
  currency: "usd",
  stripePaymentIntentId: "pi_1",
  refunds: [],
};

const matchedRemotePayment = {
  paymentIntentId: "pi_1",
  status: "succeeded",
  amountInCents: 499,
  amountReceivedInCents: 499,
  currency: "usd",
  orderIdMetadata: "order-1",
  refunds: [],
  refundsTruncated: false,
};

describe("remote Stripe reconciliation comparison", () => {
  it("accepts only exact payment facts with no unrecorded refunds", () => {
    expect(compareStripeOrder(localOrder, matchedRemotePayment)).toEqual({
      orderId: "order-1",
      paymentIntentId: "pi_1",
      status: "matched",
      issues: [],
    });
  });

  it("reports payment discrepancies instead of changing the local order", () => {
    const result = compareStripeOrder(localOrder, {
      ...matchedRemotePayment,
      status: "processing",
      amountReceivedInCents: 0,
      currency: "eur",
      orderIdMetadata: "different-order",
    });

    expect(result.status).toBe("mismatch");
    expect(result.issues.map((item) => item.kind)).toEqual([
      "PAYMENT_INTENT_STATUS_MISMATCH",
      "PAYMENT_INTENT_AMOUNT_MISMATCH",
      "PAYMENT_INTENT_CURRENCY_MISMATCH",
      "PAYMENT_INTENT_ORDER_METADATA_MISMATCH",
    ]);
    expect(localOrder.orderStatus).toBe("paid");
  });

  it("matches a locally pending refund through its metadata but exposes its missing Stripe id", () => {
    const result = compareStripeOrder(
      {
        ...localOrder,
        orderStatus: "refund_pending",
        refunds: [
          {
            id: "refund-request-1",
            stripeRefundId: null,
            amountInCents: 499,
            currency: "usd",
            status: "pending",
          },
        ],
      },
      {
        ...matchedRemotePayment,
        refunds: [
          {
            id: "re_1",
            amountInCents: 499,
            currency: "usd",
            status: "pending",
            refundRequestId: "refund-request-1",
          },
        ],
      },
    );

    expect(result.issues).toEqual([
      expect.objectContaining({
        kind: "LOCAL_REFUND_STRIPE_ID_MISSING",
        localRefundId: "refund-request-1",
        remoteRefundId: "re_1",
      }),
    ]);
  });

  it("flags a Stripe-side refund that has no Biblio audit record", () => {
    const result = compareStripeOrder(localOrder, {
      ...matchedRemotePayment,
      refunds: [
        {
          id: "re_external",
          amountInCents: 499,
          currency: "usd",
          status: "succeeded",
          refundRequestId: null,
        },
      ],
    });

    expect(result.status).toBe("mismatch");
    expect(result.issues).toEqual([
      expect.objectContaining({ kind: "REMOTE_REFUND_UNRECORDED", remoteRefundId: "re_external" }),
    ]);
  });
});
