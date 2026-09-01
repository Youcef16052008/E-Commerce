"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/**
 * Actions par ligne du tableau produits admin :
 * Éditer · Publier/Dépublier · Supprimer (avec confirm).
 */
export function ProductRowActions({
  productId,
  published,
}: {
  productId: string;
  published: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function togglePublish() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: !published }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Erreur");
        return;
      }
      router.refresh();
    } catch {
      setError("Réseau");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!confirm("Supprimer définitivement ce produit ?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/products/${productId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error === "PRODUCT_REFERENCED") {
          setError("Référencé par une commande");
        } else {
          setError(data.error ?? "Erreur");
        }
        return;
      }
      router.refresh();
    } catch {
      setError("Réseau");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1.5">
        <Link
          href={`/admin/products/${productId}/edit`}
          className="rounded border border-neutral-300 px-2 py-1 text-xs font-medium hover:bg-neutral-100"
        >
          Éditer
        </Link>
        <button
          type="button"
          disabled={busy}
          onClick={togglePublish}
          className="rounded border border-neutral-300 px-2 py-1 text-xs font-medium hover:bg-neutral-100 disabled:opacity-50"
        >
          {published ? "Dépublier" : "Publier"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className="rounded border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          Supprimer
        </button>
      </div>
      {error && (
        <span className="text-xs text-red-600" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
