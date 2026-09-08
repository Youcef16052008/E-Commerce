import { beforeEach, describe, expect, it, vi } from "vitest";

const reconciliationRepo = vi.hoisted(() => ({
  listOrdersForStripeReconciliation: vi.fn(),
  writeStripeReconciliationLog: vi.fn(),
}));
const stripeRemote = vi.hoisted(() => ({ readStripePaymentForReconciliation: vi.fn() }));

vi.mock("@/features/admin/infrastructure/stripe-reconciliation-repo", () => reconciliationRepo);
vi.mock("@/features/admin/infrastructure/stripe-remote", () => stripeRemote);

import { reconcileStripeRemotely } from "@/features/admin/application/stripe-reconciliation-service";

const localOrder = {
  orderId: "order-1",
  orderStatus: "paid" as const,
  totalInCents: 499,
  currency: "usd",
  stripePaymentIntentId: "pi_1",
  refunds: [],
};

const remotePayment = {
  paymentIntentId: "pi_1",
  status: "succeeded",
  amountInCents: 499,
  amountReceivedInCents: 499,
  currency: "usd",
  orderIdMetadata: "order-1",
  refunds: [],
  refundsTruncated: false,
};

describe("remote Stripe reconciliation service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reconciliationRepo.listOrdersForStripeReconciliation.mockResolvedValue([localOrder]);
    reconciliationRepo.writeStripeReconciliationLog.mockResolvedValue(undefined);
    stripeRemote.readStripePaymentForReconciliation.mockResolvedValue({
      kind: "found",
      payment: remotePayment,
    });
  });

  it("is bounded, reports a match and writes only an audit record", async () => {
    const report = await reconcileStripeRemotely({ limit: 25 });

    expect(reconciliationRepo.listOrdersForStripeReconciliation).toHaveBeenCalledWith({
      limit: 25,
    });
    expect(stripeRemote.readStripePaymentForReconciliation).toHaveBeenCalledWith("pi_1");
    expect(report).toMatchObject({
      selected: 1,
      matched: 1,
      mismatched: 0,
      remoteMissing: 0,
      remoteErrors: 0,
      results: [expect.objectContaining({ status: "matched", issues: [] })],
    });
    expect(reconciliationRepo.writeStripeReconciliationLog).toHaveBeenCalledWith({
      runId: report.runId,
      result: expect.objectContaining({ orderId: "order-1", status: "matched" }),
    });
  });

  it("refuses limits outside the service-level safety bound", async () => {
    await expect(reconcileStripeRemotely({ limit: 101 })).rejects.toThrow(
      "Reconciliation limit must be an integer between 1 and 100.",
    );
    expect(reconciliationRepo.listOrdersForStripeReconciliation).not.toHaveBeenCalled();
  });

  it("does not silently succeed when a targeted order is not reconcilable", async () => {
    reconciliationRepo.listOrdersForStripeReconciliation.mockResolvedValue([]);

    await expect(reconcileStripeRemotely({ limit: 1, orderId: "unknown-order" })).rejects.toThrow(
      "No reconcilable settled order with a persisted Stripe Payment Intent matches the requested order ID.",
    );
    expect(stripeRemote.readStripePaymentForReconciliation).not.toHaveBeenCalled();
  });

  it("turns a missing remote Payment Intent into an explicit exception", async () => {
    stripeRemote.readStripePaymentForReconciliation.mockResolvedValue({ kind: "not-found" });

    const report = await reconcileStripeRemotely({ limit: 1, orderId: "order-1" });

    expect(report).toMatchObject({
      selected: 1,
      remoteMissing: 1,
      results: [
        expect.objectContaining({
          status: "remote_missing",
          issues: [expect.objectContaining({ kind: "PAYMENT_INTENT_NOT_FOUND_IN_STRIPE" })],
        }),
      ],
    });
  });

  it("records a generic remote error without provider error text", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    stripeRemote.readStripePaymentForReconciliation.mockResolvedValue({ kind: "error" });

    const report = await reconcileStripeRemotely({ limit: 1 });

    expect(report).toMatchObject({
      remoteErrors: 1,
      results: [
        expect.objectContaining({
          status: "remote_error",
          issues: [expect.objectContaining({ kind: "STRIPE_API_ERROR" })],
        }),
      ],
    });
    expect(reconciliationRepo.writeStripeReconciliationLog).toHaveBeenCalledWith({
      runId: report.runId,
      result: expect.objectContaining({
        issues: [
          expect.objectContaining({
            detail: "Stripe could not be queried; this order must be retried later.",
          }),
        ],
      }),
    });
    expect(log).toHaveBeenCalledWith("[stripe-reconcile] remote lookup failed", {
      orderId: "order-1",
      paymentIntentId: "pi_1",
      code: "STRIPE_API_ERROR",
    });
  });
});
