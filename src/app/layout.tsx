import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Header } from "@/shared/ui/header";
import "./globals.css";

// Polices système locales : build sans dépendance réseau (pas de fetch Google Fonts),
// rendu identique partout et aucune requête vers un CDN externe.

export const metadata: Metadata = {
  title: {
    default: "Biblio — Librairie numérique",
    template: "%s · Biblio",
  },
  description:
    "Achetez et retrouvez vos e-books et contenus numériques depuis votre bibliothèque personnelle.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {/* Lien d'évitement : visible uniquement au focus clavier (a11y). */}
        <a
          href="#contenu-principal"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-neutral-900 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
        >
          Aller au contenu principal
        </a>
        <Header />
        <div id="contenu-principal" tabIndex={-1} className="flex flex-1 flex-col outline-none">
          {children}
        </div>
      </body>
    </html>
  );
}
