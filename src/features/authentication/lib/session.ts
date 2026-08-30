import { headers } from "next/headers";
import { auth } from "./auth";
import { isAdmin } from "@/shared/config/session-role";

/**
 * Récupère l'utilisateur courant depuis la requête (côté serveur).
 * À appeler dans les Server Actions composants serveur / Route Handlers.
 * La sécurité est TOUJOURS re-vérifiée ici (jamais uniquement dans le middleware).
 */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function getSessionUser() {
  const session = await getSession();
  return session?.user ?? null;
}

/** Retourne `true` si l'utilisateur courant est un admin. */
export async function isCurrentUserAdmin() {
  const user = await getSessionUser();
  return isAdmin(user?.role ?? null);
}
