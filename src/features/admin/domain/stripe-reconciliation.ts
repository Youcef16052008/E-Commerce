import type { OrderStatus } from "@/features/checkout/domain/checkout-types";

/** Local facts persisted by Biblio; no values are trusted from a browser. */
export interface LocalStripeRefund {
  id: string;
  stripeRefundId: string | null;
  amountInCents: number;
  currency: string;
  status: "pending" | "succeeded" | "failed";
}

export interface LocalStripeOrder {
  orderId: string;
  orderStatus: OrderStatus;
  totalInCents: number;
  currency: string;
  stripePaymentIntentId: string;
  refunds: LocalStripeRefund[];
}

/** Minimal, non-sensitive projection returned by Stripe's server SDK. */
export interface RemoteStripeRefund {
  id: string;
  amountInCents: number;
  currency: string;
  status: string | null;
  refundRequestId: string | null;
}

export interface RemoteStripePayment {
  paymentIntentId: string;
  status: string;
  amountInCents: number;
  amountReceivedInCents: number;
  currency: string;
  orderIdMetadata: string | null;
  refunds: RemoteStripeRefund[];
  refundsTruncated: boolean;
}

export const STRIPE_RECONCILIATION_ISSUE_KINDS = [
  "PAYMENT_INTENT_NOT_FOUND_IN_STRIPE",
  "STRIPE_API_ERROR",
  "PAYMENT_INTENT_STATUS_MISMATCH",
  "PAYMENT_INTENT_AMOUNT_MISMATCH",
  "PAYMENT_INTENT_CURRENCY_MISMATCH",
  "PAYMENT_INTENT_ORDER_METADATA_MISMATCH",
  "REMOTE_REFUND_UNRECORDED",
  "LOCAL_REFUND_NOT_FOUND_IN_STRIPE",
  "LOCAL_REFUND_STRIPE_ID_MISSING",
  "REFUND_AMOUNT_MISMATCH",
  "REFUND_CURRENCY_MISMATCH",
  "REFUND_STATUS_MISMATCH",
  "REFUND_LIST_TRUNCATED",
] as const;

export type StripeReconciliationIssueKind = (typeof STRIPE_RECONCILIATION_ISSUE_KINDS)[number];

export interface StripeReconciliationIssue {
  kind: StripeReconciliationIssueKind;
  orderId: string;
  paymentIntentId: string;
  localRefundId?: string;
  remoteRefundId?: string;
  detail: string;
}

export type StripeReconciliationStatus = "matched" | "mismatch" | "remote_missing" | "remote_error";

export interface StripeOrderReconciliation {
  orderId: string;
  paymentIntentId: string;
  status: StripeReconciliationStatus;
  issues: StripeReconciliationIssue[];
}

function issue(
  local: LocalStripeOrder,
  kind: StripeReconciliationIssueKind,
  detail: string,
  references: Pick<StripeReconciliationIssue, "localRefundId" | "remoteRefundId"> = {},
): StripeReconciliationIssue {
  return {
    kind,
    orderId: local.orderId,
    paymentIntentId: local.stripePaymentIntentId,
    detail,
    ...references,
  };
}

function statusesMatch(local: LocalStripeRefund["status"], remote: string | null) {
  if (local === "pending") return remote === "pending" || remote === "requires_action";
  if (local === "succeeded") return remote === "succeeded";
  return remote === "failed" || remote === "canceled";
}

/**
 * Pure comparison of a local sale and remote Stripe facts. It intentionally
 * returns exceptions only: a reconciliation must never fabricate a payment,
 * refund, entitlement, or order status.
 */
export function compareStripeOrder(
  local: LocalStripeOrder,
  remote: RemoteStripePayment,
): StripeOrderReconciliation {
  const issues: StripeReconciliationIssue[] = [];

  if (remote.status !== "succeeded") {
    issues.push(
      issue(
        local,
        "PAYMENT_INTENT_STATUS_MISMATCH",
        `Stripe Payment Intent status is ${remote.status}, expected succeeded.`,
      ),
    );
  }
  if (
    remote.amountInCents !== local.totalInCents ||
    remote.amountReceivedInCents !== local.totalInCents
  ) {
    issues.push(
      issue(
        local,
        "PAYMENT_INTENT_AMOUNT_MISMATCH",
        `Local total is ${local.totalInCents}; Stripe amount/received are ${remote.amountInCents}/${remote.amountReceivedInCents}.`,
      ),
    );
  }
  if (remote.currency.toLowerCase() !== local.currency.toLowerCase()) {
    issues.push(
      issue(
        local,
        "PAYMENT_INTENT_CURRENCY_MISMATCH",
        `Local currency is ${local.currency}; Stripe currency is ${remote.currency}.`,
      ),
    );
  }
  if (remote.orderIdMetadata !== local.orderId) {
    issues.push(
      issue(
        local,
        "PAYMENT_INTENT_ORDER_METADATA_MISMATCH",
        "Stripe Payment Intent metadata does not reference this Biblio order.",
      ),
    );
  }
  if (remote.refundsTruncated) {
    issues.push(
      issue(
        local,
        "REFUND_LIST_TRUNCATED",
        "Stripe returned more than 100 refunds; do not treat this comparison as complete.",
      ),
    );
  }

  const matchedRemoteRefundIds = new Set<string>();
  for (const localRefund of local.refunds) {
    const remoteRefund = localRefund.stripeRefundId
      ? remote.refunds.find((refund) => refund.id === localRefund.stripeRefundId)
      : remote.refunds.find((refund) => refund.refundRequestId === localRefund.id);

    if (!remoteRefund) {
      issues.push(
        issue(
          local,
          "LOCAL_REFUND_NOT_FOUND_IN_STRIPE",
          "A local refund request has no matching remote Stripe Refund.",
          {
            localRefundId: localRefund.id,
            remoteRefundId: localRefund.stripeRefundId ?? undefined,
          },
        ),
      );
      continue;
    }

    matchedRemoteRefundIds.add(remoteRefund.id);
    if (!localRefund.stripeRefundId) {
      issues.push(
        issue(
          local,
          "LOCAL_REFUND_STRIPE_ID_MISSING",
          "Stripe Refund exists but its identifier was not persisted locally.",
          { localRefundId: localRefund.id, remoteRefundId: remoteRefund.id },
        ),
      );
    }
    if (localRefund.amountInCents !== remoteRefund.amountInCents) {
      issues.push(
        issue(
          local,
          "REFUND_AMOUNT_MISMATCH",
          `Local refund is ${localRefund.amountInCents}; Stripe refund is ${remoteRefund.amountInCents}.`,
          { localRefundId: localRefund.id, remoteRefundId: remoteRefund.id },
        ),
      );
    }
    if (localRefund.currency.toLowerCase() !== remoteRefund.currency.toLowerCase()) {
      issues.push(
        issue(
          local,
          "REFUND_CURRENCY_MISMATCH",
          `Local refund currency is ${localRefund.currency}; Stripe refund currency is ${remoteRefund.currency}.`,
          { localRefundId: localRefund.id, remoteRefundId: remoteRefund.id },
        ),
      );
    }
    if (!statusesMatch(localRefund.status, remoteRefund.status)) {
      issues.push(
        issue(
          local,
          "REFUND_STATUS_MISMATCH",
          `Local refund status is ${localRefund.status}; Stripe refund status is ${remoteRefund.status ?? "null"}.`,
          { localRefundId: localRefund.id, remoteRefundId: remoteRefund.id },
        ),
      );
    }
  }

  for (const remoteRefund of remote.refunds) {
    if (matchedRemoteRefundIds.has(remoteRefund.id)) continue;
    issues.push(
      issue(
        local,
        "REMOTE_REFUND_UNRECORDED",
        "Stripe has a refund without a matching local audit request.",
        { remoteRefundId: remoteRefund.id },
      ),
    );
  }

  return {
    orderId: local.orderId,
    paymentIntentId: local.stripePaymentIntentId,
    status: issues.length === 0 ? "matched" : "mismatch",
    issues,
  };
}
