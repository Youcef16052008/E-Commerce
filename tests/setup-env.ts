/**
 * Chargé par Vitest avant chaque fichier de test.
 *
 * - Charge `.env` du projet (même logique que les scripts tsx) pour que les
 *   suites d'INTÉGRATION tournent avec une vraie `DATABASE_URL` sans édition
 *   manuelle. En CI, les variables sont injectées directement par le workflow
 *   (elles restent prioritaires : `load-env` n'écrase jamais l'existant).
 * - Sans `DATABASE_URL`, on pose une URL PLACEHOLDER jamais utilisée pour des
 *   requêtes : le module DB ne lève pas à la collecte, et les suites
 *   d'intégration se désactivent via `tests/integration/has-database.ts`.
 */
import "../scripts/load-env";

export const PLACEHOLDER_DATABASE_URL = "postgres://user:pass@localhost:5432/biblio-placeholder";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = PLACEHOLDER_DATABASE_URL;
}
