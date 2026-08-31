import { NextResponse } from "next/server";
import { requireUser } from "@/features/authentication/lib/require-user";
import { viewLibrary } from "@/features/library/application/library-service";

/**
 * GET /api/me/library — ouvrages achetés par l'utilisateur connecté.
 */
export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const items = await viewLibrary(auth.user.id);
  return NextResponse.json({ items });
}
