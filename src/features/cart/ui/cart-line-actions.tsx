"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * A digital-book cart line is a single personal licence. There is therefore no
 * quantity control: the only customer action is removing the licence.
 */
export function CartLineActions({ productId }: { productId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

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
    <button
      onClick={removeLine}
      disabled={busy}
      aria-label="Retirer du panier"
      className="rounded-lg border border-red-200 px-2 py-1 text-sm text-red-700 disabled:opacity-50"
    >
      Retirer
    </button>
  );
}
