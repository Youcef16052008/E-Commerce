import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { queryProductBySlug } from "@/features/products/application/product-service";
import { AddToCartButton } from "@/features/cart/ui/add-to-cart-button";
import { formatPrice } from "@/shared/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await queryProductBySlug(slug);
  if (!product) return {};
  return {
    title: product.title,
    description: product.description ?? undefined,
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await queryProductBySlug(slug);

  if (!product) {
    notFound();
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <nav className="mb-6 text-sm text-neutral-500">
        <Link href="/products" className="hover:underline">
          Catalogue
        </Link>
        <span className="mx-2">/</span>
        <span className="text-neutral-700">{product.title}</span>
      </nav>

      <div className="grid gap-8 sm:grid-cols-2">
        <div className="aspect-[3/4] overflow-hidden rounded-xl bg-neutral-100">
          {product.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.coverUrl}
              alt={`Couverture de ${product.title}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-6xl text-neutral-400">
              📕
            </div>
          )}
        </div>

        <div className="flex flex-col">
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            {product.genre ?? "Livre"} · {product.format?.toUpperCase()}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{product.title}</h1>
          <p className="mt-1 text-lg text-neutral-600">{product.author}</p>
          <p className="mt-4 text-2xl font-semibold">
            {formatPrice(product.priceInCents, product.currency)}
          </p>

          {product.description && (
            <p className="mt-4 leading-relaxed text-neutral-700">{product.description}</p>
          )}

          <div className="mt-6 flex flex-col gap-3">
            <AddToCartButton productId={product.id} />
            <p className="text-xs text-neutral-500">
              Le paiement et la bibliothèque personnelle seront activés dans les prochaines étapes.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
