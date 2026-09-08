import { and, eq, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import { db } from "@/server/db";
import { entitlements, orderItems, orders, refunds, user } from "@/server/db/schema";
import type { OrderStatus } from "@/features/checkout/domain/checkout-types";
import type { PaymentException } from "../domain/payment-exceptions";

const SETTLED_ORDER_STATUSES: readonly OrderStatus[] = ["paid", "fulfilled", "refund_pending"];
/** Past this delay, a pending refund is no longer routine: verify Stripe first. */
export const REFUND_CONFIRMATION_GRACE_MS = 15 * 60 * 1000;

type OrderReferenceRow = {
  id: string;
  status: string;
  totalInCents: number;
  currency: string;
  createdAt: Date;
  checkoutExpiresAt: Date | null;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  userEmail: string;
  userName: string;
};

function asOrderException(
  row: OrderReferenceRow,
  kind:
    | "PAID_ORDER_MISSING_CHECKOUT_SESSION"
    | "PAID_ORDER_MISSING_PAYMENT_INTENT"
    | "EXPIRED_CHECKOUT_STILL_PENDING"
    | "REFUND_PENDING_MISSING_REQUEST"
    | "REFUND_CONFIRMATION_OVERDUE",
): PaymentException {
  return {
    kind,
    orderId: row.id,
    orderStatus: row.status as OrderStatus,
    userEmail: row.userEmail,
    userName: row.userName,
    totalInCents: row.totalInCents,
    currency: row.currency,
    createdAt: row.createdAt,
    checkoutExpiresAt: row.checkoutExpiresAt,
  };
}

/**
 * Finds persisted database facts that violate Biblio's payment/delivery
 * contract. Stripe API comparison is intentionally a separate job: this query
 * is safe to expose in the admin UI and never performs a financial mutation.
 */
export async function findPaymentExceptions(now = new Date()): Promise<PaymentException[]> {
  const [referenceRows, entitlementRows, expiredRows, refundPendingRows] = await Promise.all([
    db
      .select({
        id: orders.id,
        status: orders.status,
        totalInCents: orders.totalInCents,
        currency: orders.currency,
        createdAt: orders.createdAt,
        checkoutExpiresAt: orders.checkoutExpiresAt,
        stripeCheckoutSessionId: orders.stripeCheckoutSessionId,
        stripePaymentIntentId: orders.stripePaymentIntentId,
        userEmail: user.email,
        userName: user.name,
      })
      .from(orders)
      .innerJoin(user, eq(orders.userId, user.id))
      .where(
        and(
          inArray(orders.status, [...SETTLED_ORDER_STATUSES]),
          or(isNull(orders.stripeCheckoutSessionId), isNull(orders.stripePaymentIntentId)),
        ),
      ),
    db
      .select({
        orderId: orders.id,
        status: orders.status,
        totalInCents: orders.totalInCents,
        currency: orders.currency,
        createdAt: orders.createdAt,
        checkoutExpiresAt: orders.checkoutExpiresAt,
        userEmail: user.email,
        userName: user.name,
        productId: orderItems.productId,
        productTitle: orderItems.titleSnapshot,
      })
      .from(orders)
      .innerJoin(user, eq(orders.userId, user.id))
      .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
      .leftJoin(
        entitlements,
        and(
          eq(entitlements.userId, orders.userId),
          eq(entitlements.productId, orderItems.productId),
        ),
      )
      .where(and(inArray(orders.status, [...SETTLED_ORDER_STATUSES]), isNull(entitlements.id))),
    db
      .select({
        id: orders.id,
        status: orders.status,
        totalInCents: orders.totalInCents,
        currency: orders.currency,
        createdAt: orders.createdAt,
        checkoutExpiresAt: orders.checkoutExpiresAt,
        stripeCheckoutSessionId: orders.stripeCheckoutSessionId,
        stripePaymentIntentId: orders.stripePaymentIntentId,
        userEmail: user.email,
        userName: user.name,
      })
      .from(orders)
      .innerJoin(user, eq(orders.userId, user.id))
      .where(
        and(
          eq(orders.status, "pending"),
          isNotNull(orders.checkoutExpiresAt),
          lt(orders.checkoutExpiresAt, now),
        ),
      ),
    db
      .select({
        id: orders.id,
        status: orders.status,
        totalInCents: orders.totalInCents,
        currency: orders.currency,
        createdAt: orders.createdAt,
        checkoutExpiresAt: orders.checkoutExpiresAt,
        stripeCheckoutSessionId: orders.stripeCheckoutSessionId,
        stripePaymentIntentId: orders.stripePaymentIntentId,
        userEmail: user.email,
        userName: user.name,
        refundId: refunds.id,
        refundStatus: refunds.status,
        refundCreatedAt: refunds.createdAt,
      })
      .from(orders)
      .innerJoin(user, eq(orders.userId, user.id))
      .leftJoin(refunds, eq(refunds.orderId, orders.id))
      .where(eq(orders.status, "refund_pending")),
  ]);

  const referenceExceptions = referenceRows.flatMap((row) => {
    const issues: PaymentException[] = [];
    if (!row.stripeCheckoutSessionId) {
      issues.push(asOrderException(row, "PAID_ORDER_MISSING_CHECKOUT_SESSION"));
    }
    if (!row.stripePaymentIntentId) {
      issues.push(asOrderException(row, "PAID_ORDER_MISSING_PAYMENT_INTENT"));
    }
    return issues;
  });

  const entitlementExceptions: PaymentException[] = entitlementRows.map((row) => ({
    kind: "PAID_ORDER_MISSING_ENTITLEMENT",
    orderId: row.orderId,
    orderStatus: row.status as OrderStatus,
    userEmail: row.userEmail,
    userName: row.userName,
    totalInCents: row.totalInCents,
    currency: row.currency,
    createdAt: row.createdAt,
    checkoutExpiresAt: row.checkoutExpiresAt,
    productId: row.productId,
    productTitle: row.productTitle,
  }));

  const expirationExceptions = expiredRows.map((row) =>
    asOrderException(row, "EXPIRED_CHECKOUT_STILL_PENDING"),
  );

  const overdueRefundBefore = new Date(now.getTime() - REFUND_CONFIRMATION_GRACE_MS);
  const refundExceptions = refundPendingRows.flatMap((row) => {
    if (!row.refundId) return [asOrderException(row, "REFUND_PENDING_MISSING_REQUEST")];
    if (
      row.refundStatus !== "pending" ||
      !row.refundCreatedAt ||
      row.refundCreatedAt >= overdueRefundBefore
    ) {
      return [];
    }
    return [
      asOrderException({ ...row, createdAt: row.refundCreatedAt }, "REFUND_CONFIRMATION_OVERDUE"),
    ];
  });

  return [
    ...referenceExceptions,
    ...entitlementExceptions,
    ...expirationExceptions,
    ...refundExceptions,
  ];
}
