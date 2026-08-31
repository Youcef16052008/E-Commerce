import { getSessionUser } from "@/features/authentication/lib/session";
import { NextResponse } from "next/server";

/**
 * Helper serveur : exige un utilisateur connecté pour les routes du panier.
 * Retourne l'utilisateur ou une réponse 401 (à retourner immédiatement).
 */
export async function requireCartUser(): Promise<
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
