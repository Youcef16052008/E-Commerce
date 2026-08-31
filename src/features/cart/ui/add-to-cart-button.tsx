"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Bouton "Ajouter au panier" (client). Appelle l'API serveur qui relit
 * le prix et vérifie le produit. Si non connecté, redirige vers la connexion.
 */
export function AddToCartButton({ productId }: { productId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<"idle" | "added" | "error">("idle");

  async function onAdd() {
    setLoading(true);
    setFeedback("idle");
    try {
      const res = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity: 1 }),
      });
      if (res.status === 401) {
        router.push("/auth/sign-in?next=/products");
        return;
      }
      if (!res.ok) {
        setFeedback("error");
        return;
      }
      setFeedback("added");
    } catch {
      setFeedback("error");
    } finally {
      setLoading(false);
    }
  }

  if (feedback === "added") {
    return (
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/cart")}
          className="flex-1 rounded-full bg-neutral-900 px-6 py-3 font-medium text-white hover:bg-neutral-700"
        >
          Voir mon panier
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={onAdd}
        disabled={loading}
        className="rounded-full bg-neutral-900 px-6 py-3 font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
      >
        {loading ? "Ajout…" : "Ajouter au panier"}
      </button>
      {feedback === "error" && (
        <p role="alert" className="text-sm text-red-700">
          Impossible d&apos;ajouter. Réessayez.
        </p>
      )}
    </div>
  );
}
