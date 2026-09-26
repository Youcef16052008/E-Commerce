import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/features/admin/application/require-admin";
import { importProductsCsv } from "@/features/admin/application/admin-bulk-service";

const MAX_BYTES = 2 * 1024 * 1024;

/**
 * POST /api/admin/products/import?apply=1 — corps : `multipart/form-data` (champ
 * `file`) ou `text/csv` brut. Sans `apply=1` : simulation (aucune écriture).
 * Toute erreur de ligne bloque l'application (422 avec le détail).
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let text: string;
  const ct = request.headers.get("content-type") ?? "";
  if (ct.startsWith("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof Blob))
      return NextResponse.json({ error: "file_required" }, { status: 400 });
    if (file.size > MAX_BYTES)
      return NextResponse.json({ error: "file_too_large" }, { status: 413 });
    text = await file.text();
  } else {
    text = await request.text();
    if (text.length > MAX_BYTES)
      return NextResponse.json({ error: "file_too_large" }, { status: 413 });
  }

  const apply = request.nextUrl.searchParams.get("apply") === "1";
  const report = await importProductsCsv(text, { dryRun: !apply });
  const status = report.errors.length > 0 && apply ? 422 : 200;
  return NextResponse.json(report, { status });
}
