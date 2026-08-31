import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/features/admin/application/require-admin";
import {
  queryAdminProducts,
  createAdminProduct,
} from "@/features/admin/application/admin-product-service";
import { formatPrice } from "@/shared/lib/format";

/**
 * GET  /api/admin/products — liste tous les produits (y compris brouillons).
 * POST /api/admin/products — crée un produit.
 * Protégé : admin uniquement (401 / 403).
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const input = Object.fromEntries(request.nextUrl.searchParams.entries());
  const result = await queryAdminProducts(input);

  return NextResponse.json({
    ...result,
    items: result.items.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      author: p.author,
      genre: p.genre,
      language: p.language,
      format: p.format,
      coverUrl: p.coverUrl,
      fileUrl: p.fileUrl,
      priceInCents: p.priceInCents,
      currency: p.currency,
      price: formatPrice(p.priceInCents, p.currency),
      published: p.published,
      updatedAt: p.updatedAt,
      createdAt: p.createdAt,
    })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  const result = await createAdminProduct(body);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.code, message: result.error.message },
      { status: result.error.status },
    );
  }

  return NextResponse.json({ product: result.product }, { status: 201 });
}
