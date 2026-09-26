import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Les fichiers de test s'exécutent à SÉQUENCE (fileParallelism: false).
 * Raison : les tests d'intégration partagent UNE base, et certains d'entre eux
 * (stats admin) utilisent la méthode en écarts — baseline avant/après sur des
 * agrégats GLOBAUX — qui n'est exacte que si personne d'autre n'écrit pendant
 * la mesure. En parallèle, les autres suites (orders, fulfillment, admin…)
 * créent des produits/commandes dans la fenêtre de mesure et cassent les
 * deltas (échec CI du 2026-09-05 : admin-stats « expected 2 to be 1 »).
 * La suite unit est trop rapide pour que la séquence coûte quelque chose.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/{unit,integration}/**/*.{test,spec}.{ts,tsx}"],
    setupFiles: ["./tests/setup-env.ts"],
    globals: true,
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.d.ts",
        "src/app/**",
        "src/server/db/**",
        "src/shared/ui/**",
        "**/*.config.*",
      ],
      /**
       * Plancher de couverture (fix-plan L5.3) — `npm run test:coverage` (CI).
       * Ciblé sur les chemins d'argent : checkout (session Stripe, webhook,
       * fulfillment) et entitlements (bibliothèque, téléchargement). Les
       * composants `ui/*.tsx` sont exclus : ce sont des client components
       * couverts par Playwright, pas par Vitest.
       * Branches checkout à 65 % (mesuré 70,4 % le 2026-09-26 : les branches
       * manquantes sont des garde-fous d'erreur Stripe réseau, non simulés
       * sans clé) ; relever à 70 quand un mock Stripe stable existera (Lot 6).
       */
      thresholds: {
        "src/features/checkout/**/!(*.tsx)": {
          lines: 70,
          statements: 70,
          functions: 70,
          branches: 65,
        },
        "src/features/library/**/!(*.tsx)": {
          lines: 70,
          statements: 70,
          functions: 70,
          branches: 70,
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
