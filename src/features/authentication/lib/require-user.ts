import { NextResponse } from "next/server";
import { getSessionUser } from "./session";

/**
 * Helper serveur : exige un utilisateur connecté.
 * Retourne l'utilisateur ou une réponse 401 (à retourner immédiatement).
 */
export async function requireUser(): Promise<
  { user: { id: string }; error: null } | { user: null; error: NextResponse }
> {
  const user = await getSessionUser();
  if (!user) {
    return {
      user: null,
      error: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  return { user: { id: user.id }, error: null };
}
