import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/authentication/lib/session";
import { isAdmin } from "@/shared/config/session-role";

/**
 * Layout admin : vérification serveur.
 * - Non connecté → redirect sign-in avec ?next=/admin
 * - Connecté mais non admin → panneau 403 explicite (pas de 404 masqué)
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();

  if (!user) {
    redirect("/auth/sign-in?next=/admin");
  }

  if (!isAdmin(user.role)) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-10 text-center">
          <p className="text-sm font-medium uppercase tracking-wide text-red-600">403</p>
          <h1 className="mt-2 text-2xl font-semibold text-red-900">Accès refusé</h1>
          <p className="mt-2 text-red-800">
            Cette zone est réservée aux administrateurs. Votre compte (
            <span className="font-medium">{user.email}</span>) n&apos;a pas le rôle requis.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Retour à l&apos;accueil
          </Link>
        </div>
      </main>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-neutral-200 bg-neutral-50">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Administration
          </span>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium">
            <Link href="/admin" className="text-neutral-700 hover:text-neutral-900">
              Tableau de bord
            </Link>
            <Link href="/admin/products" className="text-neutral-700 hover:text-neutral-900">
              Produits
            </Link>
            <Link href="/admin/orders" className="text-neutral-700 hover:text-neutral-900">
              Commandes
            </Link>
          </nav>
        </div>
      </div>
      {children}
    </div>
  );
}
