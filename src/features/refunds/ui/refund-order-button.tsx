"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OrderStatus } from "@/features/checkout/domain/checkout-types";

/** Starts a Stripe-backed refund; it never claims the refund is already complete. */
export function RefundOrderButton({ orderId, status }: { orderId: string; status: OrderStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (status !== "paid" && status !== "fulfilled") return null;

  async function requestRefund() {
    const confirmed = window.confirm(
      "Demander à Stripe le remboursement complet de cette commande ? La commande restera en attente jusqu’à la confirmation Stripe.",
    );
    if (!confirmed) return;

    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "requested_by_customer" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data.message ?? data.error ?? "Impossible de soumettre le remboursement.");
        return;
      }
      setMessage("Demande envoyée à Stripe. Confirmation en attente.");
      router.refresh();
    } catch {
      setMessage("Erreur réseau : vérifiez l’état de la demande avant de réessayer.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={requestRefund}
        disabled={busy}
        className="rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
      >
        {busy ? "Demande…" : "Demander un remboursement Stripe"}
      </button>
      {message && (
        <span className="max-w-48 text-xs text-neutral-600" role="status">
          {message}
        </span>
      )}
    </div>
  );
}
