"use client";

import { useState } from "react";

/**
 * Bouton de téléchargement (client). Appelle POST /api/me/library/[productId]/download
 * qui retourne une URL pré-signée à durée limitée, puis déclenche le téléchargement.
 */
export function DownloadButton({ productId, hasFile }: { productId: string; hasFile: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDownload() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/me/library/${productId}/download`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          data.error === "FILE_NOT_AVAILABLE"
            ? "Fichier non disponible."
            : data.error === "STORAGE_NOT_CONFIGURED"
              ? "Stockage non configuré."
              : "Téléchargement impossible.",
        );
        return;
      }
      const data = await res.json();
      // Ouvre l'URL pré-signée dans un nouvel onglet (téléchargement direct).
      window.open(data.url, "_blank");
    } catch {
      setError("Erreur réseau.");
    } finally {
      setLoading(false);
    }
  }

  if (!hasFile) return null;

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={onDownload}
        disabled={loading}
        className="rounded-full border border-neutral-300 px-4 py-1.5 text-sm font-medium hover:bg-neutral-100 disabled:opacity-50"
      >
        {loading ? "Préparation…" : "Télécharger"}
      </button>
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
