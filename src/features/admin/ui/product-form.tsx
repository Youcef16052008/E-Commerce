"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type ProductFormValues = {
  title: string;
  author: string;
  description: string;
  genre: string;
  language: string;
  format: "epub" | "pdf";
  /** Prix saisi en USD décimal (ex. "0.50") — converti en centimes à l'envoi. */
  priceUsd: string;
  coverUrl: string;
  fileUrl: string;
  published: boolean;
  slug: string;
};

const EMPTY: ProductFormValues = {
  title: "",
  author: "",
  description: "",
  genre: "",
  language: "fr",
  format: "epub",
  priceUsd: "0.50",
  coverUrl: "",
  fileUrl: "",
  published: false,
  slug: "",
};

function toCents(priceUsd: string): number | null {
  const n = Number(priceUsd.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/**
 * Formulaire client de création / édition d'un produit admin.
 * POST (création) ou PATCH (édition) via fetch, puis navigation + refresh.
 */
export function ProductForm({
  mode,
  productId,
  initial,
  /** URL fichier non http(s) (ex. s3://) à conserver si le champ est laissé vide. */
  preservedFileUrl,
}: {
  mode: "create" | "edit";
  productId?: string;
  initial?: Partial<ProductFormValues>;
  preservedFileUrl?: string | null;
}) {
  const router = useRouter();
  const [values, setValues] = useState<ProductFormValues>({ ...EMPTY, ...initial });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function set<K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const priceInCents = toCents(values.priceUsd);
    if (priceInCents === null || priceInCents > 100_000) {
      setError("Prix invalide (0,00 – 1 000,00 USD).");
      return;
    }

    const typedFile = values.fileUrl.trim();
    // En édition, ne pas écraser une URL s3:// existante si le champ (http only) est vide.
    const fileUrl =
      typedFile ||
      (mode === "edit" && preservedFileUrl && !preservedFileUrl.startsWith("http")
        ? undefined
        : "");

    const payload: Record<string, unknown> = {
      title: values.title.trim(),
      author: values.author.trim(),
      description: values.description.trim() || null,
      genre: values.genre.trim() || null,
      language: values.language.trim() || null,
      format: values.format,
      priceInCents,
      currency: "usd",
      coverUrl: values.coverUrl.trim() || "",
      published: values.published,
    };
    if (fileUrl !== undefined) {
      payload.fileUrl = fileUrl;
    }
    if (values.slug.trim()) {
      payload.slug = values.slug.trim();
    }

    setLoading(true);
    try {
      const url = mode === "create" ? "/api/admin/products" : `/api/admin/products/${productId}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = data.error ?? "ERROR";
        const messages: Record<string, string> = {
          VALIDATION: "Données invalides. Vérifiez les champs.",
          SLUG_TAKEN: "Ce slug est déjà utilisé.",
          NOT_FOUND: "Produit introuvable.",
          FORBIDDEN: "Accès refusé.",
          UNAUTHORIZED: "Connectez-vous en tant qu'administrateur.",
        };
        setError(messages[code] ?? `Erreur (${code}).`);
        return;
      }
      router.push("/admin/products");
      router.refresh();
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 max-w-2xl space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium sm:col-span-2">
          Titre <span className="text-red-600">*</span>
          <input
            required
            maxLength={200}
            value={values.title}
            onChange={(e) => set("title", e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
          />
        </label>
        <label className="block text-sm font-medium">
          Auteur <span className="text-red-600">*</span>
          <input
            required
            maxLength={120}
            value={values.author}
            onChange={(e) => set("author", e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
          />
        </label>
        <label className="block text-sm font-medium">
          Slug (optionnel)
          <input
            value={values.slug}
            onChange={(e) => set("slug", e.target.value)}
            placeholder="auto-généré depuis le titre"
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 font-mono text-sm outline-none focus:border-neutral-900"
          />
        </label>
        <label className="block text-sm font-medium sm:col-span-2">
          Description
          <textarea
            maxLength={2000}
            rows={4}
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
          />
        </label>
        <label className="block text-sm font-medium">
          Genre
          <input
            maxLength={80}
            value={values.genre}
            onChange={(e) => set("genre", e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
          />
        </label>
        <label className="block text-sm font-medium">
          Langue
          <input
            maxLength={10}
            value={values.language}
            onChange={(e) => set("language", e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
          />
        </label>
        <label className="block text-sm font-medium">
          Format
          <select
            value={values.format}
            onChange={(e) => set("format", e.target.value as "epub" | "pdf")}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
          >
            <option value="epub">EPUB</option>
            <option value="pdf">PDF</option>
          </select>
        </label>
        <label className="block text-sm font-medium">
          Prix (USD) <span className="text-red-600">*</span>
          <input
            required
            inputMode="decimal"
            value={values.priceUsd}
            onChange={(e) => set("priceUsd", e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
          />
        </label>
        <label className="block text-sm font-medium sm:col-span-2">
          URL de couverture (http/https)
          <input
            type="url"
            value={values.coverUrl}
            onChange={(e) => set("coverUrl", e.target.value)}
            placeholder="https://…"
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
          />
        </label>
        <label className="block text-sm font-medium sm:col-span-2">
          URL du fichier (http/https ou s3:// non accepté ici — laisser vide)
          <input
            type="url"
            value={values.fileUrl}
            onChange={(e) => set("fileUrl", e.target.value)}
            placeholder="https://… (optionnel)"
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
          <input
            type="checkbox"
            checked={values.published}
            onChange={(e) => set("published", e.target.checked)}
            className="size-4 rounded border-neutral-300"
          />
          Publié (visible dans le catalogue)
        </label>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
        >
          {loading ? "Enregistrement…" : mode === "create" ? "Créer le produit" : "Enregistrer"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/products")}
          className="rounded-lg border border-neutral-300 px-5 py-2.5 text-sm font-medium hover:bg-neutral-100"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
