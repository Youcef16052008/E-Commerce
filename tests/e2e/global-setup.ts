import { execSync } from "node:child_process";

/**
 * Prérequis e2e : garantir l'existence du compte admin (idempotent).
 *
 * - CI : `seed:all` a déjà tourné avant les tests → cet appel est un no-op.
 * - Local : rend `npm run test:e2e` autonome (aucun seed manuel requis).
 *
 * Exige `DATABASE_URL` (sans base, l'app elle-même ne peut pas authentifier
 * les comptes de test).
 */
export default function globalSetup() {
  execSync("npm run seed:admin", { stdio: "inherit" });
}
