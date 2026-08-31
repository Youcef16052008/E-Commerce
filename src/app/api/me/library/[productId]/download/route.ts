import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/features/authentication/lib/require-user";
import { createDownloadLink } from "@/features/library/application/library-service";

/**
 * POST /api/me/library/[productId]/download
 * Renvoie une URL pré-signée (TTL court) pour télécharger le fichier acheté.
 * Autorisation : l'utilisateur doit détenir un entitlement sur le produit.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const { productId } = await params;
  const result = await createDownloadLink(auth.user.id, productId);

  if (!result.ok) {
    const status =
      result.error.code === "NOT_ENTITLED"
        ? 403
        : result.error.code === "FILE_NOT_AVAILABLE"
          ? 404
          : 503;
    return NextResponse.json({ error: result.error.code }, { status });
  }

  return NextResponse.json({ url: result.url });
}
