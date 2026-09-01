import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Administration",
};

/**
 * Landing admin — cartes de navigation (pas de chiffres : Slice 8).
 */
export default function AdminHomePage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Tableau de bord</h1>
      <p className="mt-1 text-neutral-600">
        Gérez le catalogue et les commandes. Les statistiques chiffrées arriveront plus tard.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link
          href="/admin/products"
          className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm transition hover:border-neutral-400 hover:shadow"
        >
          <h2 className="text-lg font-semibold">Produits</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Créer, modifier, publier ou supprimer des ouvrages du catalogue.
          </p>
        </Link>
        <Link
          href="/admin/orders"
          className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm transition hover:border-neutral-400 hover:shadow"
        >
          <h2 className="text-lg font-semibold">Commandes</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Consulter toutes les commandes et mettre à jour leur statut.
          </p>
        </Link>
      </div>
    </main>
  );
}
