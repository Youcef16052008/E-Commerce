import type { OrderStatus } from "@/features/checkout/domain/checkout-types";

/**
 * Invariants which must hold for an online digital sale. An exception does not
 * mutate payment data; it is an operator queue for investigation/reconciliation.
 */
export const PAYMENT_EXCEPTION_KINDS = [
  "PAID_ORDER_MISSING_CHECKOUT_SESSION",
  "PAID_ORDER_MISSING_PAYMENT_INTENT",
  "PAID_ORDER_MISSING_ENTITLEMENT",
  "EXPIRED_CHECKOUT_STILL_PENDING",
  "REFUND_PENDING_MISSING_REQUEST",
  "REFUND_CONFIRMATION_OVERDUE",
] as const;

export type PaymentExceptionKind = (typeof PAYMENT_EXCEPTION_KINDS)[number];

export const PAYMENT_EXCEPTION_LABELS: Record<PaymentExceptionKind, string> = {
  PAID_ORDER_MISSING_CHECKOUT_SESSION: "Commande encaissée sans session Checkout",
  PAID_ORDER_MISSING_PAYMENT_INTENT: "Commande encaissée sans Payment Intent",
  PAID_ORDER_MISSING_ENTITLEMENT: "Commande encaissée sans droit d’accès",
  EXPIRED_CHECKOUT_STILL_PENDING: "Checkout expiré encore en attente",
  REFUND_PENDING_MISSING_REQUEST: "Remboursement en cours sans demande auditée",
  REFUND_CONFIRMATION_OVERDUE: "Confirmation Stripe du remboursement en retard",
};

export interface PaymentException {
  kind: PaymentExceptionKind;
  orderId: string;
  orderStatus: OrderStatus;
  userEmail: string;
  userName: string;
  totalInCents: number;
  currency: string;
  createdAt: Date;
  checkoutExpiresAt: Date | null;
  productId?: string;
  productTitle?: string;
}

export interface PaymentExceptionSummary {
  generatedAt: Date;
  total: number;
  counts: Record<PaymentExceptionKind, number>;
  items: PaymentException[];
}

export interface PaymentExceptionView extends PaymentException {
  label: string;
  totalFormatted: string;
  createdAtLabel: string;
  checkoutExpiresAtLabel: string | null;
}

export interface PaymentExceptionSummaryView extends Omit<PaymentExceptionSummary, "items"> {
  items: PaymentExceptionView[];
}

export function emptyPaymentExceptionCounts(): Record<PaymentExceptionKind, number> {
  return {
    PAID_ORDER_MISSING_CHECKOUT_SESSION: 0,
    PAID_ORDER_MISSING_PAYMENT_INTENT: 0,
    PAID_ORDER_MISSING_ENTITLEMENT: 0,
    EXPIRED_CHECKOUT_STILL_PENDING: 0,
    REFUND_PENDING_MISSING_REQUEST: 0,
    REFUND_CONFIRMATION_OVERDUE: 0,
  };
}

/** Build a stable summary for the admin page, CLI and alerting jobs. */
export function summarizePaymentExceptions(
  items: PaymentException[],
  generatedAt = new Date(),
): PaymentExceptionSummary {
  const counts = emptyPaymentExceptionCounts();
  for (const item of items) counts[item.kind] += 1;

  return {
    generatedAt,
    total: items.length,
    counts,
    items: [...items].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
  };
}
