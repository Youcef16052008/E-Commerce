import { beforeEach, describe, expect, it, vi } from "vitest";

const refundRepository = vi.hoisted(() => ({
  attachStripeRefundId: vi.fn(),
  reserveFullOrderRefund: vi.fn(),
}));
const stripeRefunds = vi.hoisted(() => ({
  createStripeFullRefund: vi.fn(),
}));

vi.mock("@/features/refunds/infrastructure/refund-repo", () => refundRepository);
vi.mock("@/features/refunds/infrastructure/stripe-refunds", () => stripeRefunds);

import { requestFullOrderRefund } from "@/features/refunds/application/refund-service";

describe("Stripe-backed refund requests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.clearAllMocks();
    refundRepository.reserveFullOrderRefund.mockResolvedValue({
      kind: "created",
      refundRequestId: "refund-request-1",
      orderId: "order-1",
      paymentIntentId: "pi_1",
      amountInCents: 499,
      currency: "usd",
      reason: "requested_by_customer",
    });
    stripeRefunds.createStripeFullRefund.mockResolvedValue({ id: "re_1" });
    refundRepository.attachStripeRefundId.mockResolvedValue(undefined);
  });

  it("reserves before calling Stripe, uses the stable request id and remains pending", async () => {
    const result = await requestFullOrderRefund("order-1", "admin-1", {
      reason: "requested_by_customer",
    });

    expect(result).toEqual({ ok: true, refundRequestId: "refund-request-1", status: "pending" });
    expect(refundRepository.reserveFullOrderRefund).toHaveBeenCalledWith({
      orderId: "order-1",
      requestedByUserId: "admin-1",
      reason: "requested_by_customer",
    });
    expect(stripeRefunds.createStripeFullRefund).toHaveBeenCalledWith({
      refundRequestId: "refund-request-1",
      orderId: "order-1",
      paymentIntentId: "pi_1",
      amountInCents: 499,
      reason: "requested_by_customer",
    });
    expect(refundRepository.attachStripeRefundId).toHaveBeenCalledWith("refund-request-1", "re_1");
  });

  it("does not call Stripe again when a refund request already exists", async () => {
    refundRepository.reserveFullOrderRefund.mockResolvedValue({
      kind: "already-requested",
      refundRequestId: "refund-request-1",
      status: "pending",
    });

    const result = await requestFullOrderRefund("order-1", "admin-1", {});

    expect(result).toMatchObject({
      ok: false,
      error: { code: "REFUND_ALREADY_REQUESTED", status: 409 },
    });
    expect(stripeRefunds.createStripeFullRefund).not.toHaveBeenCalled();
  });

  it("keeps the reservation pending when Stripe is unavailable instead of claiming failure", async () => {
    stripeRefunds.createStripeFullRefund.mockRejectedValue(new Error("timeout"));

    const result = await requestFullOrderRefund("order-1", "admin-1", {});

    expect(result).toMatchObject({ ok: false, error: { code: "STRIPE_UNAVAILABLE", status: 502 } });
    expect(refundRepository.attachStripeRefundId).not.toHaveBeenCalled();
  });

  it("rejects unknown reason codes before reserving a refund", async () => {
    const result = await requestFullOrderRefund("order-1", "admin-1", { reason: "free_money" });

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION", status: 400 } });
    expect(refundRepository.reserveFullOrderRefund).not.toHaveBeenCalled();
  });
});
