import { NextResponse } from "next/server";
import { requireAdmin } from "@/features/admin/application/require-admin";
import { bulkPublish } from "@/features/admin/application/admin-bulk-service";

/** POST /api/admin/products/bulk — `{ action: "publish" | "unpublish", ids: string[] }`. */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => null);
  const result = await bulkPublish(body);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.code, message: result.error.message },
      { status: result.error.status },
    );
  }
  return NextResponse.json({ ok: true, updated: result.updated, action: result.action });
}
