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
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
