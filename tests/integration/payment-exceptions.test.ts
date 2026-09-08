import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { viewPaymentExceptions } from "@/features/admin/application/payment-exceptions-service";
import { db } from "@/server/db";
import { orderItems, orders, products, user } from "@/server/db/schema";
import { hasDatabase } from "./has-database";

/**
 * Exercises the read-only reconciliation queue against PostgreSQL. The test
 * deliberately seeds only known bad rows, then identifies them by UUID instead
 * of asserting a global total in a database that may contain other test data.
 */
describe.skipIf(!hasDatabase)("payment exception reconciliation (integration)", () => {
  const runId = Date.now();
  let userId = "";
  let productId = "";
  const orderIds: string[] = [];
  let missingEntitlementOrderId = "";
  let missingPaymentIntentOrderId = "";
  let expiredOrderId = "";

  beforeAll(async () => {
    const [customer] = await db
      .insert(user)
      .values({
        id: randomUUID(),
        name: "Payment exceptions IT",
        email: `it-payment-exceptions-${runId}@biblio.test`,
        role: "customer",
      })
      .returning({ id: user.id });
    userId = customer.id;

    productId = randomUUID();
    await db.insert(products).values({
      id: productId,
      slug: `it-payment-exceptions-${runId}`,
      title: "Livre à réconcilier",
      author: "Tests",
      format: "epub",
      priceInCents: 350,
      currency: "usd",
      published: true,
    });

    missingEntitlementOrderId = randomUUID();
    missingPaymentIntentOrderId = randomUUID();
    expiredOrderId = randomUUID();
    orderIds.push(missingEntitlementOrderId, missingPaymentIntentOrderId, expiredOrderId);

    await db.insert(orders).values([
      {
        id: missingEntitlementOrderId,
        userId,
        status: "paid",
        totalInCents: 350,
        currency: "usd",
        paidAt: new Date(),
        stripeCheckoutSessionId: `cs_missing_entitlement_${runId}`,
        stripePaymentIntentId: `pi_missing_entitlement_${runId}`,
      },
      {
        id: missingPaymentIntentOrderId,
        userId,
        status: "paid",
        totalInCents: 250,
        currency: "usd",
        paidAt: new Date(),
        stripeCheckoutSessionId: `cs_missing_pi_${runId}`,
      },
      {
        id: expiredOrderId,
        userId,
        status: "pending",
        totalInCents: 150,
        currency: "usd",
        stripeCheckoutSessionId: `cs_expired_${runId}`,
        checkoutExpiresAt: new Date("2020-01-01T00:00:00.000Z"),
      },
    ]);
    await db.insert(orderItems).values({
      orderId: missingEntitlementOrderId,
      productId,
      titleSnapshot: "Livre à réconcilier",
      priceInCents: 350,
      quantity: 1,
      currency: "usd",
    });
  });

  afterAll(async () => {
    for (const id of orderIds) {
      await db
        .delete(orders)
        .where(eq(orders.id, id))
        .catch(() => undefined);
    }
    if (productId) {
      await db
        .delete(products)
        .where(eq(products.id, productId))
        .catch(() => undefined);
    }
    if (userId) {
      await db
        .delete(user)
        .where(eq(user.id, userId))
        .catch(() => undefined);
    }
  });

  it("flags missing delivery, missing payment reference and a stale pending Checkout", async () => {
    const report = await viewPaymentExceptions(new Date("2026-09-08T00:00:00.000Z"));

    expect(report.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "PAID_ORDER_MISSING_ENTITLEMENT",
          orderId: missingEntitlementOrderId,
          productId,
        }),
        expect.objectContaining({
          kind: "PAID_ORDER_MISSING_PAYMENT_INTENT",
          orderId: missingPaymentIntentOrderId,
        }),
        expect.objectContaining({
          kind: "EXPIRED_CHECKOUT_STILL_PENDING",
          orderId: expiredOrderId,
        }),
      ]),
    );
  });
});
