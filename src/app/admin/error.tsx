"use client";

import Link from "next/link";

/**
 * Front d'erreur de la zone admin — reste dans l'en-tête admin via le layout.
 * Message FR générique (aucun détail interne exposé à l'écran).
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-sm font-medium uppercase tracking-wide text-red-600">Erreur</p>
      <h1 className="mt-2 text-2xl font-semibold">
        Une erreur est survenue dans l&apos;administration.
      </h1>
      <p className="mt-2 text-neutral-600">
        Vos données ne sont pas modifiées. Réessayez, ou revenez au tableau de bord.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-xs text-neutral-500" aria-label="Référence de l'erreur">
          Réf. {error.digest}
        </p>
      )}
      <div className="mt-8 flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Réessayer
        </button>
        <Link
          href="/admin"
          className="rounded-full border border-neutral-300 px-5 py-2.5 text-sm font-medium hover:bg-neutral-100"
        >
          Tableau de bord
        </Link>
      </div>
    </main>
  );
}
