import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/features/admin/application/require-admin";
import { updateOrderStatus } from "@/features/admin/application/admin-order-service";

/**
 * PATCH /api/admin/orders/[id]/status — change le statut d'une commande.
 * Corps : `{ "status": "pending"|"paid"|"fulfilled"|"failed"|"refunded" }`.
 * Protégé : admin uniquement.
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const result = await updateOrderStatus(id, body);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.code, message: result.error.message },
      { status: result.error.status },
    );
  }
  return NextResponse.json({ order: result.order });
}
