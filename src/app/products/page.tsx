import {
  queryPublishedProducts,
  queryGenres,
} from "@/features/products/application/product-service";
import { ProductCard } from "@/features/products/ui/product-card";
import { CatalogFilters } from "@/features/products/ui/catalog-filters";
import { Pagination } from "@/features/products/ui/pagination";

export const dynamic = "force-dynamic";

function buildPageUrl(params: URLSearchParams, page: number) {
  const next = new URLSearchParams(params);
  if (page > 1) next.set("page", String(page));
  else next.delete("page");
  const qs = next.toString();
  return qs ? `/products?${qs}` : "/products";
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") raw[k] = v;
  }

  const [result, genres] = await Promise.all([queryPublishedProducts(raw), queryGenres()]);
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) if (v) params.set(k, v);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Catalogue</h1>
      <p className="mt-1 text-neutral-600">
        {result.total} ouvrage{result.total > 1 ? "s" : ""}
      </p>

      <div className="mt-6">
        <CatalogFilters genres={genres} />
      </div>

      {result.items.length === 0 ? (
        <div className="mt-12 rounded-xl border border-dashed border-neutral-300 py-16 text-center">
          <p className="text-lg text-neutral-500">Aucun ouvrage ne correspond à votre recherche.</p>
          <p className="mt-1 text-sm text-neutral-500">Essayez d&apos;élargir vos filtres.</p>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {result.items.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}

      <Pagination
        page={result.page}
        totalPages={result.totalPages}
        buildPageUrl={(p) => buildPageUrl(params, p)}
      />
    </main>
  );
}
