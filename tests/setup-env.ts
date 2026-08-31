/**
 * Chargé par Vitest avant chaque fichier de test.
 *
 * Les suites d'INTÉGRATION exigent une vraie base (Neon ou Postgres local) :
 * elles sont ignorées si `DATABASE_URL` n'est pas fournie. Pour pouvoir collecter
 * les fichiers (le module DB lève sans URL), on pose ici une URL PLACEHOLDER
 * jamais utilisée pour des requêtes — les suites se détectent via
 * `tests/integration/has-database.ts`.
 */
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/biblio-placeholder";
}
