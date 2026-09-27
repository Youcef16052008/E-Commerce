import { NextResponse } from "next/server";
import { requireUser } from "@/features/authentication/lib/require-user";
import { exportAccount } from "@/features/account/application/account-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/me/export — export RGPD (accès / portabilité) de l'utilisateur connecté.
 * Réponse JSON téléchargeable (`Content-Disposition: attachment`), jamais mise en cache.
 */
export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const data = await exportAccount(auth.user.id);
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const stamp = data.exportedAt.slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="biblio-export-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
