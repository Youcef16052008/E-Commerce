"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Barre d'actions groupées (L6.3) : Publier / Dépublier la sélection, export CSV
 * (filtre courant), import CSV en deux temps (simulation → application).
 * Les cases à cocher des lignes portent `name="ids"` et `form="bulk-form"` :
 * la sélection vit dans le DOM, pas dans un état global.
 */
type ImportReport = {
  dryRun: boolean;
  parsed: number;
  errors: { line: number; message: string }[];
  toCreate: string[];
  toUpdate: string[];
  created: number;
  updated: number;
};

export function BulkProductToolbar({ exportHref }: { exportHref: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [file, setFile] = useState<File | null>(null);

  function selectedIds(): string[] {
    const form = document.getElementById("bulk-form") as HTMLFormElement | null;
    if (!form) return [];
    return Array.from(new FormData(form).getAll("ids")).map(String);
  }

  async function bulk(action: "publish" | "unpublish") {
    const ids = selectedIds();
    if (ids.length === 0) {
      setMessage("Sélectionnez au moins un produit.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids }),
      });
      const data = (await res.json().catch(() => ({}))) as { updated?: number; error?: string };
      if (!res.ok) {
        setMessage(`Échec : ${data.error ?? res.status}`);
        return;
      }
      setMessage(
        `${data.updated} produit${(data.updated ?? 0) > 1 ? "s" : ""} ${action === "publish" ? "publié" : "dépublié"}${(data.updated ?? 0) > 1 ? "s" : ""}.`,
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function runImport(apply: boolean) {
    if (!file) {
      setMessage("Choisissez un fichier CSV.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/admin/products/import${apply ? "?apply=1" : ""}`, {
        method: "POST",
        body,
      });
      const data = (await res.json().catch(() => null)) as ImportReport | null;
      if (!data) {
        setMessage(`Échec de l'import (${res.status}).`);
        return;
      }
      setReport(data);
      if (apply && res.ok) {
        setMessage(`Import appliqué : ${data.created} créé(s), ${data.updated} mis à jour.`);
        setFile(null);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  const canApply = Boolean(
    report && report.dryRun && report.errors.length === 0 && report.parsed > 0,
  );

  return (
    <section
      aria-label="Actions groupées"
      className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Sélection :</span>
        <button
          type="button"
          disabled={busy}
          onClick={() => bulk("publish")}
          className="rounded border border-neutral-300 bg-white px-3 py-1.5 font-medium hover:bg-neutral-100 disabled:opacity-50"
        >
          Publier
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => bulk("unpublish")}
          className="rounded border border-neutral-300 bg-white px-3 py-1.5 font-medium hover:bg-neutral-100 disabled:opacity-50"
        >
          Dépublier
        </button>
        <span className="mx-2 hidden h-5 w-px bg-neutral-300 sm:inline-block" aria-hidden />
        <a
          href={exportHref}
          className="rounded border border-neutral-300 bg-white px-3 py-1.5 font-medium hover:bg-neutral-100"
        >
          Exporter CSV (filtre courant)
        </a>
        <label className="ml-auto flex flex-wrap items-center gap-2">
          <span className="font-medium">Importer CSV :</span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setReport(null);
            }}
            className="text-xs"
            aria-label="Fichier CSV à importer"
          />
          <button
            type="button"
            disabled={busy || !file}
            onClick={() => runImport(false)}
            className="rounded border border-neutral-300 bg-white px-3 py-1.5 font-medium hover:bg-neutral-100 disabled:opacity-50"
          >
            Simuler
          </button>
          <button
            type="button"
            disabled={busy || !canApply}
            onClick={() => runImport(true)}
            className="rounded bg-neutral-900 px-3 py-1.5 font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
            title={canApply ? "Écrire en base" : "Simulez d'abord un fichier sans erreur"}
          >
            Appliquer
          </button>
        </label>
      </div>

      {message && (
        <p role="status" className="mt-3 text-neutral-800">
          {message}
        </p>
      )}

      {report && (
        <div className="mt-3 rounded-lg border border-neutral-200 bg-white p-3">
          <p>
            {report.dryRun ? "Simulation" : "Résultat"} — {report.parsed} ligne
            {report.parsed > 1 ? "s" : ""} valide{report.parsed > 1 ? "s" : ""} ·{" "}
            {report.toCreate.length} à créer · {report.toUpdate.length} à mettre à jour ·{" "}
            {report.errors.length} erreur{report.errors.length > 1 ? "s" : ""}
          </p>
          {report.errors.length > 0 && (
            <ul className="mt-2 max-h-40 list-disc overflow-auto pl-5 text-red-700">
              {report.errors.slice(0, 50).map((e) => (
                <li key={`${e.line}-${e.message}`}>
                  ligne {e.line} : {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
