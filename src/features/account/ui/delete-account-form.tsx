"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DELETE_CONFIRMATION_PHRASE } from "../domain/account-types";

const MESSAGES: Record<string, string> = {
  blocked:
    "Une opération de paiement est encore en cours (commande en attente ou remboursement " +
    "non confirmé). Réessayez lorsqu'elle sera soldée.",
  admin_account:
    "Un compte administrateur ne peut pas être supprimé depuis cette page : retirez d'abord " +
    "le rôle admin.",
  confirmation_required: `Tapez exactement « ${DELETE_CONFIRMATION_PHRASE} » pour confirmer.`,
  unauthorized: "Votre session a expiré. Reconnectez-vous puis réessayez.",
};

/** Formulaire « zone de danger » : suppression du compte avec phrase de confirmation. */
export function DeleteAccountForm({ hasOrders }: { hasOrders: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/me/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(MESSAGES[data.error ?? ""] ?? "La suppression a échoué. Réessayez plus tard.");
        return;
      }
      router.push("/?compte=supprime");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const ready = confirm === DELETE_CONFIRMATION_PHRASE && !busy;

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-3">
      <p className="text-sm text-neutral-700">
        {hasOrders
          ? "Vous avez des commandes : elles sont conservées 10 ans comme pièces comptables, " +
            "mais anonymisées (e-mail, nom, mot de passe, sessions, panier et droits d'accès " +
            "sont effacés). Vos livres ne seront plus téléchargeables."
          : "Votre compte et toutes ses données seront supprimés définitivement."}
      </p>
      <label className="block text-sm">
        <span className="text-neutral-700">
          Pour confirmer, tapez <strong>{DELETE_CONFIRMATION_PHRASE}</strong>
        </span>
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="off"
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 font-mono text-sm"
          aria-label="Phrase de confirmation"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!ready}
        className="rounded-full bg-red-700 px-5 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Suppression…" : "Supprimer mon compte"}
      </button>
    </form>
  );
}
