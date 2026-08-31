"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MAX_QUANTITY, MIN_QUANTITY } from "../domain/cart-types";

/**
 * Contrôles d'une ligne de panier (client) : quantité et suppression.
 * Passe par l'API serveur (le prix est relu serveur à chaque action).
 */
export function CartLineActions({ productId, quantity }: { productId: string; quantity: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function setQty(next: number) {
    setBusy(true);
    try {
      const res = await fetch(`/api/cart/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: next }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeLine() {
    setBusy(true);
    try {
      const res = await fetch(`/api/cart/${productId}`, { method: "DELETE" });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setQty(Math.max(MIN_QUANTITY, quantity - 1))}
        disabled={busy || quantity <= MIN_QUANTITY}
        aria-label="Diminuer la quantité"
        className="rounded-lg border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
      >
        −
      </button>
      <span className="min-w-6 text-center text-sm">{quantity}</span>
      <button
        onClick={() => setQty(Math.min(MAX_QUANTITY, quantity + 1))}
        disabled={busy || quantity >= MAX_QUANTITY}
        aria-label="Augmenter la quantité"
        className="rounded-lg border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
      >
        +
      </button>
      <button
        onClick={removeLine}
        disabled={busy}
        aria-label="Retirer du panier"
        className="rounded-lg border border-red-200 px-2 py-1 text-sm text-red-700 disabled:opacity-50"
      >
        Retirer
      </button>
    </div>
  );
}
