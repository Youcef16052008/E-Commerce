import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/features/admin/application/require-admin";
import {
  getAdminProduct,
  updateAdminProduct,
  removeAdminProduct,
} from "@/features/admin/application/admin-product-service";

/**
 * GET    /api/admin/products/[id]
 * PATCH  /api/admin/products/[id]
 * DELETE /api/admin/products/[id]
 * Protégé : admin uniquement.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await context.params;
  const product = await getAdminProduct(id);
  if (!product) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json({ product });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const result = await updateAdminProduct(id, body);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.code, message: result.error.message },
      { status: result.error.status },
    );
  }
  return NextResponse.json({ product: result.product });
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await context.params;
  const result = await removeAdminProduct(id);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.code, message: result.error.message },
      { status: result.error.status },
    );
  }
  return NextResponse.json({ ok: true });
}
