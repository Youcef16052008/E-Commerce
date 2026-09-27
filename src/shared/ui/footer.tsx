import Link from "next/link";

/** Pied de page : liens légaux (RGPD, licence de contenu). Composant de présentation pur. */
export function Footer() {
  return (
    <footer className="border-t border-neutral-200 px-4 py-6 text-xs text-neutral-500 sm:px-6">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-2">
        <span>Biblio — librairie numérique · œuvres du domaine public, fichiers sans DRM.</span>
        <nav className="flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/legal" className="hover:text-neutral-900">
            Mentions légales &amp; confidentialité
          </Link>
          <Link href="/legal#licence" className="hover:text-neutral-900">
            Licence de contenu
          </Link>
          <Link href="/account" className="hover:text-neutral-900">
            Mes données
          </Link>
        </nav>
      </div>
    </footer>
  );
}
