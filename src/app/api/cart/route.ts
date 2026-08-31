import { NextRequest, NextResponse } from "next/server";
import { viewCart, addToCart } from "@/features/cart/application/cart-service";
import { requireCartUser } from "@/features/cart/application/require-user";
import { formatPrice } from "@/shared/lib/format";

/**
 * GET /api/cart — panier de l'utilisateur connecté.
 * POST /api/cart — ajoute un produit au panier.
 */
export async function GET() {
  const auth = await requireCartUser();
  if (auth.error) return auth.error;

  const cart = await viewCart(auth.user.id);
  return NextResponse.json({
    ...cart,
    total: formatPrice(cart.totalInCents, cart.currency),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireCartUser();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  const result = await addToCart(auth.user.id, body);

  if (!result.ok) {
    const status =
      result.error.code === "INVALID_QUANTITY"
        ? 400
        : result.error.code === "PRODUCT_NOT_FOUND"
          ? 404
          : 400;
    return NextResponse.json({ error: result.error.code }, { status });
  }

  const cart = await viewCart(auth.user.id);
  return NextResponse.json(
    { ok: true, ...cart, total: formatPrice(cart.totalInCents, cart.currency) },
    { status: 201 },
  );
}
