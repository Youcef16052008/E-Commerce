import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/features/admin/application/require-admin";
import { requestFullOrderRefund } from "@/features/refunds/application/refund-service";

/**
 * POST /api/admin/orders/:id/refund
 *
 * Starts one full Stripe refund request for a paid/fulfilled order. The response
 * is deliberately `pending`: access and final order status only change when a
 * signed `refund.created`/`refund.updated` event confirms the result.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  // This financial mutation is intentionally stricter than a read endpoint:
  // browsers send Origin on cross-site POSTs, which must never spend an admin's
  // cookie-backed session. Requests without Origin remain usable by Stripe-free
  // server-side tests and non-browser operators authenticated by the same guard.
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "CSRF_ORIGIN_MISMATCH" }, { status: 403 });
  }

  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const result = await requestFullOrderRefund(id, auth.admin.id, body);

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error.code,
        message: "message" in result.error ? result.error.message : undefined,
      },
      { status: result.error.status },
    );
  }

  return NextResponse.json(result, { status: 202 });
}
