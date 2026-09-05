import { NextResponse } from "next/server";
import { requireAdmin } from "@/features/admin/application/require-admin";
import { viewAdminStats } from "@/features/admin/application/admin-stats-service";

/**
 * GET /api/admin/stats — statistiques du tableau de bord (chiffres BDD).
 * Protégé : admin uniquement (401 non connecté, 403 autre rôle).
 */
export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const stats = await viewAdminStats();
  return NextResponse.json(stats);
}
