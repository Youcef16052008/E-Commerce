import { describe, expect, it } from "vitest";
import {
  emptyPaymentExceptionCounts,
  summarizePaymentExceptions,
} from "@/features/admin/domain/payment-exceptions";

describe("payment exception summary", () => {
  it("initializes every monitored invariant at zero", () => {
    expect(emptyPaymentExceptionCounts()).toEqual({
      PAID_ORDER_MISSING_CHECKOUT_SESSION: 0,
      PAID_ORDER_MISSING_PAYMENT_INTENT: 0,
      PAID_ORDER_MISSING_ENTITLEMENT: 0,
      EXPIRED_CHECKOUT_STILL_PENDING: 0,
    });
  });

  it("counts every issue type and puts newest orders first without mutating its input", () => {
    const older = new Date("2026-09-01T10:00:00.000Z");
    const newer = new Date("2026-09-02T10:00:00.000Z");
    const items = [
      {
        kind: "PAID_ORDER_MISSING_ENTITLEMENT" as const,
        orderId: "old-order",
        orderStatus: "paid" as const,
        userEmail: "old@example.test",
        userName: "Old",
        totalInCents: 100,
        currency: "usd",
        createdAt: older,
        checkoutExpiresAt: null,
      },
      {
        kind: "PAID_ORDER_MISSING_ENTITLEMENT" as const,
        orderId: "new-order",
        orderStatus: "fulfilled" as const,
        userEmail: "new@example.test",
        userName: "New",
        totalInCents: 200,
        currency: "usd",
        createdAt: newer,
        checkoutExpiresAt: null,
      },
      {
        kind: "EXPIRED_CHECKOUT_STILL_PENDING" as const,
        orderId: "expired-order",
        orderStatus: "pending" as const,
        userEmail: "expired@example.test",
        userName: "Expired",
        totalInCents: 300,
        currency: "usd",
        createdAt: older,
        checkoutExpiresAt: older,
      },
    ];

    const report = summarizePaymentExceptions(items, newer);

    expect(report.generatedAt).toEqual(newer);
    expect(report.total).toBe(3);
    expect(report.counts.PAID_ORDER_MISSING_ENTITLEMENT).toBe(2);
    expect(report.counts.EXPIRED_CHECKOUT_STILL_PENDING).toBe(1);
    expect(report.items.map((item) => item.orderId)).toEqual([
      "new-order",
      "old-order",
      "expired-order",
    ]);
    expect(items.map((item) => item.orderId)).toEqual(["old-order", "new-order", "expired-order"]);
  });
});
