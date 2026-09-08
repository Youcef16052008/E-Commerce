import crypto from "node:crypto";
import {
  compareStripeOrder,
  type StripeOrderReconciliation,
  type StripeReconciliationIssue,
} from "../domain/stripe-reconciliation";
import { readStripePaymentForReconciliation } from "../infrastructure/stripe-remote";
import {
  listOrdersForStripeReconciliation,
  writeStripeReconciliationLog,
} from "../infrastructure/stripe-reconciliation-repo";

const MAX_RECONCILIATION_ORDERS = 100;

export interface StripeReconciliationReport {
  runId: string;
  checkedAt: Date;
  selected: number;
  matched: number;
  mismatched: number;
  remoteMissing: number;
  remoteErrors: number;
  results: StripeOrderReconciliation[];
}

function oneIssueResult(
  orderId: string,
  paymentIntentId: string,
  status: "remote_missing" | "remote_error",
  kind: "PAYMENT_INTENT_NOT_FOUND_IN_STRIPE" | "STRIPE_API_ERROR",
  detail: string,
): StripeOrderReconciliation {
  const issue: StripeReconciliationIssue = { kind, orderId, paymentIntentId, detail };
  return { orderId, paymentIntentId, status, issues: [issue] };
}

/**
 * Compares a bounded group of persisted Biblio orders to Stripe test remotely.
 * It has no path that changes orders, refunds or entitlements. The append-only
 * log makes each check auditable without ever serving as financial authority.
 */
export async function reconcileStripeRemotely(input: { limit: number; orderId?: string }) {
  if (
    !Number.isInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > MAX_RECONCILIATION_ORDERS
  ) {
    throw new Error(
      `Reconciliation limit must be an integer between 1 and ${MAX_RECONCILIATION_ORDERS}.`,
    );
  }

  const checkedAt = new Date();
  const runId = crypto.randomUUID();
  const localOrders = await listOrdersForStripeReconciliation(input);
  if (input.orderId && localOrders.length === 0) {
    throw new Error(
      "No reconcilable settled order with a persisted Stripe Payment Intent matches the requested order ID.",
    );
  }
  const results: StripeOrderReconciliation[] = [];

  // Sequential remote reads intentionally bound Stripe API pressure and produce
  // a deterministic audit log. `limit` is capped by the CLI before this point.
  for (const localOrder of localOrders) {
    const remote = await readStripePaymentForReconciliation(localOrder.stripePaymentIntentId);
    let result: StripeOrderReconciliation;
    if (remote.kind === "found") {
      result = compareStripeOrder(localOrder, remote.payment);
    } else if (remote.kind === "not-found") {
      result = oneIssueResult(
        localOrder.orderId,
        localOrder.stripePaymentIntentId,
        "remote_missing",
        "PAYMENT_INTENT_NOT_FOUND_IN_STRIPE",
        "The local Payment Intent identifier does not exist in this Stripe account.",
      );
    } else {
      // Do not persist or print remote error text: it can contain provider internals.
      // The stable IDs and STRIPE_API_ERROR code are enough to investigate safely.
      console.error("[stripe-reconcile] remote lookup failed", {
        orderId: localOrder.orderId,
        paymentIntentId: localOrder.stripePaymentIntentId,
        code: "STRIPE_API_ERROR",
      });
      result = oneIssueResult(
        localOrder.orderId,
        localOrder.stripePaymentIntentId,
        "remote_error",
        "STRIPE_API_ERROR",
        "Stripe could not be queried; this order must be retried later.",
      );
    }

    await writeStripeReconciliationLog({ runId, result });
    results.push(result);
  }

  return results.reduce<StripeReconciliationReport>(
    (report, result) => {
      if (result.status === "matched") report.matched += 1;
      if (result.status === "mismatch") report.mismatched += 1;
      if (result.status === "remote_missing") report.remoteMissing += 1;
      if (result.status === "remote_error") report.remoteErrors += 1;
      report.results.push(result);
      return report;
    },
    {
      runId,
      checkedAt,
      selected: localOrders.length,
      matched: 0,
      mismatched: 0,
      remoteMissing: 0,
      remoteErrors: 0,
      results: [],
    },
  );
}
