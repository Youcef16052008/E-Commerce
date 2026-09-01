import { NextResponse } from "next/server";
import { requireAdmin } from "@/features/admin/application/require-admin";
import { viewAllOrders } from "@/features/admin/application/admin-order-service";
import { formatPrice } from "@/shared/lib/format";

/**
 * GET /api/admin/orders — toutes les commandes avec email/nom client.
 * Protégé : admin uniquement.
 */
export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const orders = await viewAllOrders();
  return NextResponse.json({
    orders: orders.map((o) => ({
      ...o,
      total: formatPrice(o.totalInCents, o.currency),
    })),
  });
}
