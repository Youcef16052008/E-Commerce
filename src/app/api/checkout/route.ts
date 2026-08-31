import { NextResponse } from "next/server";
import { getSessionUser } from "@/features/authentication/lib/session";
import { createCheckout } from "@/features/checkout/application/checkout-service";

/**
 * POST /api/checkout — crée une session de paiement Stripe à partir du panier serveur.
 * Exige un utilisateur connecté. Aucun montant ne vient du client.
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await createCheckout(user.id);
  if (!result.ok) {
    const status =
      result.error.code === "EMPTY_CART" ? 400 : result.error.code === "PAYMENT_ERROR" ? 502 : 400;
    return NextResponse.json({ error: result.error.code }, { status });
  }

  return NextResponse.json(result.result, { status: 200 });
}
