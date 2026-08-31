import { NextRequest, NextResponse } from "next/server";
import { updateQuantity, removeFromCart } from "@/features/cart/application/cart-service";
import { requireCartUser } from "@/features/cart/application/require-user";
import { viewCart } from "@/features/cart/application/cart-service";

/**
 * PATCH /api/cart/[productId] — met à jour la quantité.
 * DELETE /api/cart/[productId] — retire une ligne.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const auth = await requireCartUser();
  if (auth.error) return auth.error;

  const { productId } = await params;
  const body = await request.json().catch(() => null);
  const result = await updateQuantity(auth.user.id, productId, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error.code }, { status: 400 });
  }

  const cart = await viewCart(auth.user.id);
  return NextResponse.json({ ok: true, ...cart });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const auth = await requireCartUser();
  if (auth.error) return auth.error;

  const { productId } = await params;
  await removeFromCart(auth.user.id, productId);

  const cart = await viewCart(auth.user.id);
  return NextResponse.json({ ok: true, ...cart });
}
