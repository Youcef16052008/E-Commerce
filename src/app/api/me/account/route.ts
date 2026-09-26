import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/features/authentication/lib/auth";
import { getSessionUser } from "@/features/authentication/lib/session";
import { deleteAccount } from "@/features/account/application/account-service";
import {
  DELETE_CONFIRMATION_PHRASE,
  isDeleteConfirmed,
} from "@/features/account/domain/account-types";
import { isAdmin } from "@/shared/config/session-role";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/me/account — droit à l'effacement.
 * Corps attendu : `{ "confirm": "SUPPRIMER" }`.
 * - 401 non connecté · 400 phrase absente · 403 compte admin (retrait de rôle
 *   requis d'abord : un admin ne peut pas s'auto-supprimer) · 409 opération
 *   financière en cours (checkout ouvert ou remboursement attendu).
 * - 200 `{ mode: "hard" | "anonymise" }` ; la session courante est révoquée.
 */
export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!isDeleteConfirmed(body)) {
    return NextResponse.json(
      { error: "confirmation_required", expected: DELETE_CONFIRMATION_PHRASE },
      { status: 400 },
    );
  }

  if (isAdmin(user.role ?? null)) {
    return NextResponse.json({ error: "admin_account" }, { status: 403 });
  }

  const result = await deleteAccount(user.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, detail: result.detail }, { status: 409 });
  }

  // La ligne session a disparu (cascade / delete) ; on efface aussi le cookie côté client.
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {
    /* la session n'existe déjà plus : rien à faire */
  }

  return NextResponse.json({ ok: true, mode: result.mode });
}
