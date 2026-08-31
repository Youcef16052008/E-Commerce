import { NextRequest, NextResponse } from "next/server";
import { createPresignedDownloadUrl, isStorageConfigured } from "@/server/storage";

/**
 * GET /api/covers/gutenberg/[id]
 * Sert les couvertures des livres importés depuis notre PROPRE stockage :
 * redirige vers une URL pré-signée (TTL 1 h). Aucun lien direct vers la source.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  if (!isStorageConfigured()) {
    return NextResponse.json({ error: "STORAGE_NOT_CONFIGURED" }, { status: 503 });
  }

  try {
    const url = await createPresignedDownloadUrl(`covers/gutenberg/${id}.jpg`, 3600);
    return NextResponse.redirect(url, 307);
  } catch {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
}
