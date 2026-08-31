"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Bouton "Passer au paiement" (client). Appelle POST /api/checkout
 * (qui crée une session Stripe avec les prix serveur) puis redirige vers l'URL de paiement.
 */
export function CheckoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onCheckout() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", { method: "POST" });
      if (res.status === 401) {
        router.push("/auth/sign-in?next=/cart");
        return;
      }
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError("Impossible de créer la session de paiement. Réessayez.");
        return;
      }
      window.location.href = data.url; // vers Stripe Checkout
    } catch {
      setError("Erreur réseau. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={onCheckout}
        disabled={loading}
        className="mt-4 w-full rounded-full bg-neutral-900 px-6 py-3 font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
      >
        {loading ? "Redirection…" : "Passer au paiement"}
      </button>
      {error && (
        <p role="alert" className="text-center text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
