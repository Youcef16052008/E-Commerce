import { NextResponse } from "next/server";
import { requireUser } from "@/features/authentication/lib/require-user";
import { viewOrders } from "@/features/orders/application/order-service";

/**
 * GET /api/me/orders — commandes de l'utilisateur connecté (avec leurs articles).
 * 401 si non connecté. Les totaux/statuts viennent de la base (source de vérité).
 */
export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const orders = await viewOrders(auth.user.id);
  return NextResponse.json({ orders });
}
