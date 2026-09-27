import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/features/admin/application/require-admin";
import { exportProductsCsv } from "@/features/admin/application/admin-bulk-service";

export const dynamic = "force-dynamic";

/** GET /api/admin/products/export?q=&status= — CSV (UTF-8 + BOM pour Excel), filtres de la liste. */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const csv = await exportProductsCsv(Object.fromEntries(request.nextUrl.searchParams.entries()));
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse("\uFEFF" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="biblio-products-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
