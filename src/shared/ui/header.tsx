import Link from "next/link";
import { getSessionUser } from "@/features/authentication/lib/session";
import { LogoutButton } from "@/features/authentication/ui/logout-button";
import { CartLink } from "@/features/cart/ui/cart-link";

/**
 * En-tête serveur : affiche l'état d'authentification selon la session.
 * Le composant lit la session côté serveur (RSC) — aucun token côté client.
 */
export async function Header() {
  const user = await getSessionUser();

  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-neutral-200 px-4 py-3 sm:px-6 sm:py-4">
      <Link href="/" className="text-lg font-semibold tracking-tight">
        Biblio
      </Link>
      <nav className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:gap-4">
        <Link
          href="/products"
          className="text-sm font-medium text-neutral-600 hover:text-neutral-900"
        >
          Catalogue
        </Link>
        {user ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <CartLink />
            <Link
              href="/library"
              className="text-sm font-medium text-neutral-600 hover:text-neutral-900"
            >
              Bibliothèque
            </Link>
            <Link
              href="/orders"
              className="text-sm font-medium text-neutral-600 hover:text-neutral-900"
            >
              Commandes
            </Link>
            <span className="flex items-center gap-2 text-sm text-neutral-700">
              {user.name}
              {user.role === "admin" && (
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
                  admin
                </span>
              )}
            </span>
            <LogoutButton />
          </div>
        ) : (
          <>
            <Link
              href="/auth/sign-up"
              className="rounded-full border border-neutral-300 px-4 py-1.5 text-sm font-medium hover:bg-neutral-100"
            >
              S&apos;inscrire
            </Link>
            <Link
              href="/auth/sign-in"
              className="rounded-full bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
            >
              Se connecter
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
