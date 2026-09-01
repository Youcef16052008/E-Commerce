"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OrderStatus } from "@/features/checkout/domain/checkout-types";
import { ORDER_STATUS_LABELS } from "@/features/orders/domain/order-status";

const STATUSES: OrderStatus[] = ["pending", "paid", "fulfilled", "failed", "refunded"];

/**
 * Sélecteur client pour changer le statut d'une commande (admin).
 * PATCH /api/admin/orders/[id]/status puis refresh.
 */
export function OrderStatusSelect({ orderId, current }: { orderId: string; current: OrderStatus }) {
  const router = useRouter();
  const [value, setValue] = useState<OrderStatus>(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(next: OrderStatus) {
    if (next === value) return;
    const previous = value;
    setValue(next);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        setValue(previous);
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Erreur");
        return;
      }
      router.refresh();
    } catch {
      setValue(previous);
      setError("Réseau");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <select
        value={value}
        disabled={busy}
        onChange={(e) => onChange(e.target.value as OrderStatus)}
        className="rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-neutral-900 disabled:opacity-60"
        // Nom accessible unique par ligne (le même label sur toute la table
        // rendait l'identification de la commande ambigue pour un lecteur
        // d'écran) : "Statut de la commande a1b2c3d4".
        aria-label={`Statut de la commande ${orderId.slice(0, 8)}`}
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {ORDER_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      {error && (
        <span className="text-xs text-red-600" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
