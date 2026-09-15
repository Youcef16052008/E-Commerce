import { NextResponse } from "next/server";
import { requireAdmin } from "@/features/admin/application/require-admin";
import { viewPaymentExceptions } from "@/features/admin/application/payment-exceptions-service";

/**
 * GET /api/admin/payments/exceptions
 *
 * Read-only queue of payment/delivery inconsistencies detected in Biblio's
 * database. It is intentionally separate from mutation endpoints: an operator
 * must investigate through Stripe and the documented recovery workflow.
 */
export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  return NextResponse.json(await viewPaymentExceptions());
}
