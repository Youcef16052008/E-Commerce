/**
 * Seed de données de démonstration pour le catalogue.
 * - Idempotent : crée (ou met à jour) via le slug, ne duplique pas.
 * - Produits marqués publiés = visibles publiquement.
 *
 * Usage : npm run seed:products
 */
import "./load-env";

import { db } from "../src/server/db";
import { products } from "../src/server/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

type SeedProduct = {
  slug: string;
  title: string;
  description: string;
  author: string;
  genre: string;
  language: string;
  format: "epub" | "pdf";
  priceInCents: number;
};

const DATA: SeedProduct[] = [
  {
    slug: "la-mer-des-etoiles",
    title: "La Mer des Étoiles",
    description:
      "Un voyage initiatique entre science-fiction et poésie, à travers une galaxie imaginaire.",
    author: "Camille Rostand",
    genre: "Science-fiction",
    language: "fr",
    format: "epub",
    priceInCents: 899,
  },
  {
    slug: "l-art-de-bien-coder",
    title: "L'Art de bien coder",
    description: "Un guide pratique et honnête sur les bonnes pratiques d'ingénierie logicielle.",
    author: "Nadia Belkacem",
    genre: "Informatique",
    language: "fr",
    format: "pdf",
    priceInCents: 1499,
  },
  {
    slug: "cuisines-du-bassin-mediterraneen",
    title: "Cuisines du Bassin Méditerranéen",
    description: "Recettes et traditions culinaires de la Méditerranée, racontées avec passion.",
    author: "Sofia Marchetti",
    genre: "Cuisine",
    language: "fr",
    format: "epub",
    priceInCents: 1290,
  },
  {
    slug: "les-jardins-de-cordoue",
    title: "Les Jardins de Cordoue",
    description: "Roman historique au cœur de l'Andalousie du Xe siècle.",
    author: "Ibrahim El-Mansour",
    genre: "Roman",
    language: "fr",
    format: "epub",
    priceInCents: 750,
  },
  {
    slug: "coffee-ritual",
    title: "Coffee Ritual",
    description: "Une approche slow-life du café de spécialité, de la graine à la tasse.",
    author: "Jonas Lindqvist",
    genre: "Lifestyle",
    language: "en",
    format: "pdf",
    priceInCents: 1099,
  },
  {
    slug: "deep-work-in-a-digital-age",
    title: "Deep Work in a Digital Age",
    description: "Retrouver la concentration dans un monde saturé de distractions.",
    author: "Elena Petrova",
    genre: "Développement personnel",
    language: "en",
    format: "epub",
    priceInCents: 999,
  },
  {
    slug: "the-silent-tide",
    title: "The Silent Tide",
    description: "Thriller atmosphérique sur une île balayée par les tempêtes.",
    author: "Rory McAllister",
    genre: "Thriller",
    language: "en",
    format: "pdf",
    priceInCents: 1350,
  },
  {
    slug: "astronomy-for-early-risers",
    title: "Astronomy for Early Risers",
    description: "Observer le ciel avant l'aube : un guide pour débutants curieux.",
    author: "Tadeo Alvarez",
    genre: "Science",
    language: "en",
    format: "epub",
    priceInCents: 1199,
  },
  {
    slug: "petits-feux-de-saison",
    title: "Petits Feux de Saison",
    description: "Poèmes courts sur les saisons, dans une édition soignée.",
    author: "Marie-Hélène Courtois",
    genre: "Poésie",
    language: "fr",
    format: "epub",
    priceInCents: 499,
  },
  {
    slug: "l-algorithme-secret",
    title: "L'Algorithme Secret",
    description: "Enquête journalistique sur les coulisses des données et de l'IA.",
    author: "Karim Ziani",
    genre: "Essai",
    language: "fr",
    format: "pdf",
    priceInCents: 1350,
  },
  {
    slug: "wild-fermentation",
    title: "Wild Fermentation",
    description:
      "Introduction accessible à la fermentation maison et à la microbiologie alimentaire.",
    author: "Ingrid Sorensen",
    genre: "Cuisine",
    language: "en",
    format: "pdf",
    priceInCents: 1080,
  },
  {
    slug: "minimal-motion",
    title: "Minimal Motion",
    description: "Design et mouvement : principes d'animation web sobres et efficaces.",
    author: "Luc Devillers",
    genre: "Design",
    language: "fr",
    format: "pdf",
    priceInCents: 1690,
  },
];

async function main() {
  for (const p of DATA) {
    const existing = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.slug, p.slug))
      .limit(1);

    const row = {
      ...p,
      id: existing[0]?.id ?? randomUUID(),
      fileUrl: null,
      published: true,
      updatedAt: new Date(),
    };

    if (existing.length > 0) {
      await db.update(products).set(row).where(eq(products.slug, p.slug));
    } else {
      await db.insert(products).values(row);
    }
  }
  console.log(`✓ Catalogue seeded : ${DATA.length} produits (publiés).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
