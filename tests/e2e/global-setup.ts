import { execSync } from "node:child_process";

/**
 * Prérequis e2e : nettoyer les données de test orphelines, puis garantir
 * l'existence du compte admin (idempotent).
 *
 * - CI : base éphémère → le cleanup est un no-op, `seed:all` a déjà tourné
 *   avant les tests → le seed admin est un no-op.
 * - Local : rend `npm run test:e2e` autonome ET auto-nettoyant (registre L-4 :
 *   les comptes `e2e-*@biblio.test` des runs précédents n'accumulent plus
 *   dans la base de dev).
 *
 * Exige `DATABASE_URL` (sans base, l'app elle-même ne peut pas authentifier
 * les comptes de test).
 */
export default function globalSetup() {
  execSync("npm run db:cleanup:tests", { stdio: "inherit" });
  execSync("npm run seed:admin", { stdio: "inherit" });
}
