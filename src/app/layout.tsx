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
        <Header />
        <div className="flex flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
