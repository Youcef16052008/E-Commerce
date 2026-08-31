"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Lien panier (client) : interroge `/api/cart` pour afficher le nombre d'articles.
 * Reste à jour à la navigation (rafraîchi via l'URL ou re-fetch au mount).
 */
export function CartLink() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/cart");
        if (res.ok) {
          const data = await res.json();
          setCount(Number(data.totalQuantity) || 0);
        }
      } catch {
        setCount(0);
      }
    }
    void load();
  }, []);

  return (
    <Link
      href="/cart"
      className="relative flex items-center gap-1 text-sm font-medium text-neutral-600 hover:text-neutral-900"
      aria-label={`Panier${count ? ` : ${count} article(s)` : ""}`}
    >
      Panier
      {count !== null && count > 0 && (
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-neutral-900 px-1.5 text-xs text-white">
          {count}
        </span>
      )}
    </Link>
  );
}
