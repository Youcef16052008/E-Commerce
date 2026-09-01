import Link from "next/link";
import type { Metadata } from "next";
import { queryAdminProducts } from "@/features/admin/application/admin-product-service";
import { ProductRowActions } from "@/features/admin/ui/product-row-actions";
import { Pagination } from "@/features/products/ui/pagination";
import { formatPrice } from "@/shared/lib/format";

export const metadata: Metadata = {
  title: "Produits · Admin",
};

export const dynamic = "force-dynamic";

function buildPageUrl(params: URLSearchParams, page: number) {
  const next = new URLSearchParams(params);
  if (page > 1) next.set("page", String(page));
  else next.delete("page");
  const qs = next.toString();
  return qs ? `/admin/products?${qs}` : "/admin/products";
}

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") raw[k] = v;
  }

  const result = await queryAdminProducts(raw);
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) if (v) params.set(k, v);

  const currentStatus = raw.status ?? "all";
  const currentQ = raw.q ?? "";

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Produits</h1>
          <p className="mt-1 text-neutral-600">
            {result.total} ouvrage{result.total > 1 ? "s" : ""} (tous statuts)
          </p>
        </div>
        <Link
          href="/admin/products/new"
          className="rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Nouveau produit
        </Link>
      </div>

      <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
        <label className="block text-sm font-medium">
          Recherche
          <input
            name="q"
            defaultValue={currentQ}
            placeholder="Titre ou auteur"
            className="mt-1 block w-56 rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
        </label>
        <label className="block text-sm font-medium">
          Statut
          <select
            name="status"
            defaultValue={currentStatus}
            className="mt-1 block rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          >
            <option value="all">Tous</option>
            <option value="published">Publiés</option>
            <option value="draft">Brouillons</option>
          </select>
        </label>
        <button
          type="submit"
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100"
        >
          Filtrer
        </button>
      </form>

      {result.items.length === 0 ? (
        <div className="mt-12 rounded-xl border border-dashed border-neutral-300 py-16 text-center">
          <p className="text-lg text-neutral-500">Aucun produit.</p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-neutral-200">
          <table className="min-w-full divide-y divide-neutral-200 text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Titre</th>
                <th className="px-4 py-3 font-medium">Auteur</th>
                <th className="px-4 py-3 font-medium">Genre</th>
                <th className="px-4 py-3 font-medium">Format</th>
                <th className="px-4 py-3 font-medium">Prix</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium">Mis à jour</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white">
              {result.items.map((p) => (
                <tr key={p.id} className="hover:bg-neutral-50">
                  <td className="max-w-[14rem] truncate px-4 py-3 font-medium" title={p.title}>
                    {p.title}
                  </td>
                  <td className="max-w-[10rem] truncate px-4 py-3 text-neutral-700">{p.author}</td>
                  <td className="px-4 py-3 text-neutral-600">{p.genre ?? "—"}</td>
                  <td className="px-4 py-3 uppercase text-neutral-600">{p.format}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatPrice(p.priceInCents, p.currency)}
                  </td>
                  <td className="px-4 py-3">
                    {p.published ? (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">
                        Publié
                      </span>
                    ) : (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                        Brouillon
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-neutral-500">
                    {formatDate(p.updatedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <ProductRowActions productId={p.id} published={p.published} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
