import { formatPrice } from "@/shared/lib/format";
import { PAYMENT_EXCEPTION_LABELS, summarizePaymentExceptions } from "../domain/payment-exceptions";
import type {
  PaymentExceptionSummaryView,
  PaymentExceptionView,
} from "../domain/payment-exceptions";
import { findPaymentExceptions } from "../infrastructure/payment-exceptions-repo";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function toPaymentExceptionView(
  exception: Awaited<ReturnType<typeof findPaymentExceptions>>[number],
): PaymentExceptionView {
  return {
    ...exception,
    label: PAYMENT_EXCEPTION_LABELS[exception.kind],
    totalFormatted: formatPrice(exception.totalInCents, exception.currency),
    createdAtLabel: formatDate(exception.createdAt),
    checkoutExpiresAtLabel: exception.checkoutExpiresAt
      ? formatDate(exception.checkoutExpiresAt)
      : null,
  };
}

/**
 * Read-only reconciliation queue for support/operations. It identifies internal
 * inconsistencies; it never grants access, changes an order, or acknowledges a
 * Stripe event. Those actions must go through the signed-payment workflow.
 */
export async function viewPaymentExceptions(
  now = new Date(),
): Promise<PaymentExceptionSummaryView> {
  const exceptions = await findPaymentExceptions(now);
  const summary = summarizePaymentExceptions(exceptions, now);

  return {
    ...summary,
    items: summary.items.map(toPaymentExceptionView),
  };
}
