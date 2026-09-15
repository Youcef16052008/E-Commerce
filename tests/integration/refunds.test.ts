import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  reserveFullOrderRefund,
  processRefundWebhook,
} from "@/features/refunds/infrastructure/refund-repo";
import { viewPaymentExceptions } from "@/features/admin/application/payment-exceptions-service";
import { db } from "@/server/db";
import {
  entitlements,
  orderItems,
  orders,
  products,
  refunds,
  stripeEvents,
  user,
} from "@/server/db/schema";
import { hasDatabase } from "./has-database";

/**
 * PostgreSQL regression: no entitlement is revoked when the refund is requested;
 * a signed successful refund removes it atomically unless another settled order
 * covers the same product, in which case its audit link is transferred.
 */
describe.skipIf(!hasDatabase)("Stripe refund workflow (integration)", () => {
  const runId = Date.now();
  const eventIds: string[] = [];
  const additionalOrderIds: string[] = [];
  const additionalProductIds: string[] = [];
  let adminId = "";
  let customerId = "";
  let productId = "";
  let failedRefundProductId = "";
  let orderId = "";
  let failedRefundOrderId = "";
  let refundRequestId = "";
  let failedRefundRequestId = "";

  beforeAll(async () => {
    const [admin] = await db
      .insert(user)
      .values({
        id: randomUUID(),
        name: "Refund admin IT",
        email: `it-refund-admin-${runId}@biblio.test`,
        role: "admin",
      })
      .returning({ id: user.id });
    adminId = admin.id;
    const [customer] = await db
      .insert(user)
      .values({
        id: randomUUID(),
        name: "Refund customer IT",
        email: `it-refund-customer-${runId}@biblio.test`,
        role: "customer",
      })
      .returning({ id: user.id });
    customerId = customer.id;

    productId = randomUUID();
    await db.insert(products).values({
      id: productId,
      slug: `it-refund-workflow-${runId}`,
      title: "Livre remboursable",
      author: "Tests",
      format: "epub",
      priceInCents: 499,
      currency: "usd",
      published: true,
    });
    failedRefundProductId = randomUUID();
    await db.insert(products).values({
      id: failedRefundProductId,
      slug: `it-refund-failure-${runId}`,
      title: "Livre dont le remboursement échoue",
      author: "Tests",
      format: "epub",
      priceInCents: 599,
      currency: "usd",
      published: true,
    });

    orderId = randomUUID();
    await db.insert(orders).values({
      id: orderId,
      userId: customerId,
      status: "paid",
      totalInCents: 499,
      currency: "usd",
      paidAt: new Date(),
      stripeCheckoutSessionId: `cs_refund_it_${runId}`,
      stripePaymentIntentId: `pi_refund_it_${runId}`,
    });
    await db.insert(orderItems).values({
      orderId,
      productId,
      titleSnapshot: "Livre remboursable",
      priceInCents: 499,
      quantity: 1,
      currency: "usd",
    });
    await db.insert(entitlements).values({
      id: randomUUID(),
      userId: customerId,
      productId,
      orderId,
    });

    failedRefundOrderId = randomUUID();
    await db.insert(orders).values({
      id: failedRefundOrderId,
      userId: customerId,
      status: "fulfilled",
      totalInCents: 599,
      currency: "usd",
      paidAt: new Date(),
      stripeCheckoutSessionId: `cs_refund_failure_${runId}`,
      stripePaymentIntentId: `pi_refund_failure_${runId}`,
    });
    await db.insert(orderItems).values({
      orderId: failedRefundOrderId,
      productId: failedRefundProductId,
      titleSnapshot: "Livre dont le remboursement échoue",
      priceInCents: 599,
      quantity: 1,
      currency: "usd",
    });
    await db.insert(entitlements).values({
      id: randomUUID(),
      userId: customerId,
      productId: failedRefundProductId,
      orderId: failedRefundOrderId,
    });
  });

  afterAll(async () => {
    for (const eventId of eventIds) {
      await db
        .delete(stripeEvents)
        .where(eq(stripeEvents.stripeEventId, eventId))
        .catch(() => undefined);
    }
    if (orderId)
      await db
        .delete(orders)
        .where(eq(orders.id, orderId))
        .catch(() => undefined);
    if (failedRefundOrderId)
      await db
        .delete(orders)
        .where(eq(orders.id, failedRefundOrderId))
        .catch(() => undefined);
    for (const additionalOrderId of additionalOrderIds) {
      await db
        .delete(orders)
        .where(eq(orders.id, additionalOrderId))
        .catch(() => undefined);
    }
    if (productId)
      await db
        .delete(products)
        .where(eq(products.id, productId))
        .catch(() => undefined);
    if (failedRefundProductId)
      await db
        .delete(products)
        .where(eq(products.id, failedRefundProductId))
        .catch(() => undefined);
    for (const additionalProductId of additionalProductIds) {
      await db
        .delete(products)
        .where(eq(products.id, additionalProductId))
        .catch(() => undefined);
    }
    if (adminId)
      await db
        .delete(user)
        .where(eq(user.id, adminId))
        .catch(() => undefined);
    if (customerId)
      await db
        .delete(user)
        .where(eq(user.id, customerId))
        .catch(() => undefined);
  });

  it("restores the previous status and preserves access when Stripe reports a failed refund", async () => {
    const reservation = await reserveFullOrderRefund({
      orderId: failedRefundOrderId,
      requestedByUserId: adminId,
      reason: "requested_by_customer",
    });
    expect(reservation.kind).toBe("created");
    if (reservation.kind !== "created") return;
    failedRefundRequestId = reservation.refundRequestId;

    const eventId = `evt_refund_failure_${runId}`;
    eventIds.push(eventId);
    await expect(
      processRefundWebhook({
        eventId,
        eventType: "refund.failed",
        refundRequestId: failedRefundRequestId,
        orderId: failedRefundOrderId,
        stripeRefundId: `re_refund_failure_${runId}`,
        paymentIntentId: `pi_refund_failure_${runId}`,
        amountInCents: 599,
        currency: "usd",
        status: "failed",
        failureCode: "insufficient_funds",
      }),
    ).resolves.toBe("failed");

    const [restoredOrder] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, failedRefundOrderId));
    const completedRefund = await db
      .select()
      .from(refunds)
      .where(eq(refunds.id, failedRefundRequestId));
    const entitlement = await db
      .select()
      .from(entitlements)
      .where(eq(entitlements.orderId, failedRefundOrderId));
    expect(restoredOrder.status).toBe("fulfilled");
    expect(completedRefund[0]).toMatchObject({
      status: "failed",
      failureCode: "insufficient_funds",
    });
    expect(entitlement).toHaveLength(1);
  });

  it("keeps access and transfers its audit link when another paid order covers the same book", async () => {
    const carriedProductId = randomUUID();
    additionalProductIds.push(carriedProductId);
    await db.insert(products).values({
      id: carriedProductId,
      slug: `it-refund-coverage-${runId}`,
      title: "Livre couvert par un autre achat",
      author: "Tests",
      format: "epub",
      priceInCents: 699,
      currency: "usd",
      published: true,
    });
    const refundedOrderId = randomUUID();
    const coveringOrderId = randomUUID();
    additionalOrderIds.push(refundedOrderId, coveringOrderId);
    await db.insert(orders).values([
      {
        id: refundedOrderId,
        userId: customerId,
        status: "paid",
        totalInCents: 699,
        currency: "usd",
        paidAt: new Date(),
        stripeCheckoutSessionId: `cs_refund_coverage_${runId}`,
        stripePaymentIntentId: `pi_refund_coverage_${runId}`,
      },
      {
        id: coveringOrderId,
        userId: customerId,
        status: "fulfilled",
        totalInCents: 699,
        currency: "usd",
        paidAt: new Date(),
        stripeCheckoutSessionId: `cs_covering_${runId}`,
        stripePaymentIntentId: `pi_covering_${runId}`,
      },
    ]);
    await db.insert(orderItems).values([
      {
        orderId: refundedOrderId,
        productId: carriedProductId,
        titleSnapshot: "Livre couvert par un autre achat",
        priceInCents: 699,
        quantity: 1,
        currency: "usd",
      },
      {
        orderId: coveringOrderId,
        productId: carriedProductId,
        titleSnapshot: "Livre couvert par un autre achat",
        priceInCents: 699,
        quantity: 1,
        currency: "usd",
      },
    ]);
    await db.insert(entitlements).values({
      id: randomUUID(),
      userId: customerId,
      productId: carriedProductId,
      orderId: refundedOrderId,
    });

    const reservation = await reserveFullOrderRefund({
      orderId: refundedOrderId,
      requestedByUserId: adminId,
      reason: "requested_by_customer",
    });
    expect(reservation.kind).toBe("created");
    if (reservation.kind !== "created") return;

    const eventId = `evt_refund_coverage_${runId}`;
    eventIds.push(eventId);
    await expect(
      processRefundWebhook({
        eventId,
        eventType: "refund.updated",
        refundRequestId: reservation.refundRequestId,
        orderId: refundedOrderId,
        stripeRefundId: `re_refund_coverage_${runId}`,
        paymentIntentId: `pi_refund_coverage_${runId}`,
        amountInCents: 699,
        currency: "usd",
        status: "succeeded",
        failureCode: null,
      }),
    ).resolves.toBe("succeeded");

    const carriedEntitlements = await db
      .select()
      .from(entitlements)
      .where(eq(entitlements.productId, carriedProductId));
    expect(carriedEntitlements).toHaveLength(1);
    expect(carriedEntitlements[0].orderId).toBe(coveringOrderId);
  });

  it("moves to refund_pending first, then revokes access only after Stripe succeeds", async () => {
    const reservation = await reserveFullOrderRefund({
      orderId,
      requestedByUserId: adminId,
      reason: "requested_by_customer",
    });

    expect(reservation.kind).toBe("created");
    if (reservation.kind !== "created") return;
    refundRequestId = reservation.refundRequestId;

    const reconciliation = await viewPaymentExceptions(new Date(Date.now() + 16 * 60 * 1000));
    expect(reconciliation.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "REFUND_CONFIRMATION_OVERDUE", orderId }),
      ]),
    );

    const pendingOrder = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    const entitlementBeforeConfirmation = await db
      .select()
      .from(entitlements)
      .where(eq(entitlements.orderId, orderId));
    expect(pendingOrder[0].status).toBe("refund_pending");
    expect(entitlementBeforeConfirmation).toHaveLength(1);

    const eventId = `evt_refund_success_${runId}`;
    eventIds.push(eventId);
    await expect(
      processRefundWebhook({
        eventId,
        eventType: "refund.updated",
        refundRequestId,
        orderId,
        stripeRefundId: `re_refund_it_${runId}`,
        paymentIntentId: `pi_refund_it_${runId}`,
        amountInCents: 499,
        currency: "usd",
        status: "succeeded",
        failureCode: null,
      }),
    ).resolves.toBe("succeeded");

    const [refundedOrder] = await db.select().from(orders).where(eq(orders.id, orderId));
    const completedRefund = await db.select().from(refunds).where(eq(refunds.id, refundRequestId));
    const entitlementAfterConfirmation = await db
      .select()
      .from(entitlements)
      .where(eq(entitlements.orderId, orderId));
    expect(refundedOrder.status).toBe("refunded");
    expect(completedRefund[0].status).toBe("succeeded");
    expect(entitlementAfterConfirmation).toHaveLength(0);

    await expect(
      processRefundWebhook({
        eventId,
        eventType: "refund.updated",
        refundRequestId,
        orderId,
        stripeRefundId: `re_refund_it_${runId}`,
        paymentIntentId: `pi_refund_it_${runId}`,
        amountInCents: 499,
        currency: "usd",
        status: "succeeded",
        failureCode: null,
      }),
    ).resolves.toBe("duplicate-event");
  });
});
