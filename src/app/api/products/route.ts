import { NextRequest, NextResponse } from "next/server";
import { queryPublishedProducts } from "@/features/products/application/product-service";
import { formatPrice } from "@/shared/lib/format";

/**
 * GET /api/products — liste publique du catalogue (produits publiés).
 * Query supportée : q, genre, language, format, sort, page, pageSize.
 */
export async function GET(request: NextRequest) {
  const input = Object.fromEntries(request.nextUrl.searchParams.entries());
  const result = await queryPublishedProducts(input);

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
      priceInCents: p.priceInCents,
      currency: p.currency,
      price: formatPrice(p.priceInCents, p.currency),
    })),
  });
}
