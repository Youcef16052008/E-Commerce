import { NextRequest, NextResponse } from "next/server";
import { queryProductBySlug } from "@/features/products/application/product-service";
import { formatPrice } from "@/shared/lib/format";

/**
 * GET /api/products/[slug] — détail d'un produit publié.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const product = await queryProductBySlug(slug);

  if (!product) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    id: product.id,
    slug: product.slug,
    title: product.title,
    description: product.description,
    author: product.author,
    genre: product.genre,
    language: product.language,
    format: product.format,
    coverUrl: product.coverUrl,
    priceInCents: product.priceInCents,
    currency: product.currency,
    price: formatPrice(product.priceInCents, product.currency),
  });
}
