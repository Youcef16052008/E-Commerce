"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";

/**
 * Filtres + recherche du catalogue.
 * Mise à jour via l'URL (searchParams) → le rendu reste server-first.
 */
export function CatalogFilters({ genres }: { genres: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [q, setQ] = useState(searchParams.get("q") ?? "");

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page"); // retour à la page 1 à chaque changement de filtre
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="space-y-4 rounded-xl border border-neutral-200 p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setParam("q", q);
        }}
        className="flex gap-2"
      >
        <label className="sr-only" htmlFor="catalog-q">
          Rechercher
        </label>
        <input
          id="catalog-q"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un titre, un auteur…"
          className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
        <button
          type="submit"
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Rechercher
        </button>
      </form>

      <div className="flex flex-wrap gap-3 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-neutral-600">Genre</span>
          <select
            value={searchParams.get("genre") ?? ""}
            onChange={(e) => setParam("genre", e.target.value)}
            className="rounded-lg border border-neutral-300 px-2 py-1.5"
          >
            <option value="">Tous</option>
            {genres.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2">
          <span className="text-neutral-600">Format</span>
          <select
            value={searchParams.get("format") ?? ""}
            onChange={(e) => setParam("format", e.target.value)}
            className="rounded-lg border border-neutral-300 px-2 py-1.5"
          >
            <option value="">Tous</option>
            <option value="epub">EPUB</option>
            <option value="pdf">PDF</option>
          </select>
        </label>

        <label className="flex items-center gap-2">
          <span className="text-neutral-600">Trier</span>
          <select
            value={searchParams.get("sort") ?? ""}
            onChange={(e) => setParam("sort", e.target.value)}
            className="rounded-lg border border-neutral-300 px-2 py-1.5"
          >
            <option value="">Plus récents</option>
            <option value="price_asc">Prix croissant</option>
            <option value="price_desc">Prix décroissant</option>
            <option value="title">Titre A-Z</option>
          </select>
        </label>

        {searchParams.toString() && (
          <button
            onClick={() => router.push(pathname)}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 hover:bg-neutral-100"
          >
            Réinitialiser
          </button>
        )}
      </div>
    </div>
  );
}
