import Link from "next/link";
import { formatPrice } from "@/shared/lib/format";
import type { Product } from "@/server/db/schema";

/**
 * Carte produit (RSC). Lien vers la fiche (slug).
 * La couverture utilise une image si disponible, sinon un placeholder accessible.
 */
export function ProductCard({ product }: { product: Product }) {
  return (
    <Link
      href={`/products/${product.slug}`}
      className="group flex flex-col rounded-xl border border-neutral-200 p-4 transition hover:border-neutral-400 hover:shadow-sm"
    >
      <div className="aspect-[3/4] w-full overflow-hidden rounded-lg bg-neutral-100">
        {product.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.coverUrl}
            alt={`Couverture de ${product.title}`}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-neutral-400">
            <span className="text-3xl">📕</span>
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-1 flex-col">
        <p className="text-xs uppercase tracking-wide text-neutral-500">
          {product.genre ?? "Livre"}
        </p>
        <h3 className="mt-1 font-medium text-neutral-900 group-hover:underline">{product.title}</h3>
        <p className="mt-0.5 text-sm text-neutral-600">{product.author}</p>
        <p className="mt-3 text-sm font-semibold text-neutral-900">
          {formatPrice(product.priceInCents, product.currency)}
        </p>
      </div>
    </Link>
  );
}
