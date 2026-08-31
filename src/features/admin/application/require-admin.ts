/**
 * Garde admin pour les Route Handlers.
 * - 401 si non connecté
 * - 403 si connecté mais rôle ≠ admin
 * Ne jamais se fier uniquement au middleware : re-vérification ici à chaque appel.
 */
import { NextResponse } from "next/server";
import { getSessionUser } from "@/features/authentication/lib/session";
import { isAdmin } from "@/shared/config/session-role";

export type AdminUser = {
  id: string;
  role: string;
  email: string;
  name: string;
};

export async function requireAdmin(): Promise<
  { admin: AdminUser; error: null } | { admin: null; error: NextResponse }
> {
  const user = await getSessionUser();
  if (!user) {
    return {
      admin: null,
      error: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }),
    };
  }
  if (!isAdmin(user.role)) {
    return {
      admin: null,
      error: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }),
    };
  }
  return {
    admin: {
      id: user.id,
      role: user.role ?? "customer",
      email: user.email,
      name: user.name,
    },
    error: null,
  };
}
