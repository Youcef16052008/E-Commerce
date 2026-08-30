/**
 * Seed d'un utilisateur administrateur.
 * - Importe `./load-env` EN PREMIER (effet de bord ESM : peuple `DATABASE_URL`
 *   avant l'évaluation du module DB).
 * - Passe par l'API Better Auth (hachage fiable du mot de passe).
 * - Élève ensuite le rôle en `admin`.
 * - Idempotent et auto-réparateur : détecte les orphelins et recrée proprement.
 *
 * Usage : npm run seed:admin  (ou  tsx scripts/seed-admin.ts)
 */
import "./load-env";

import { db } from "../src/server/db";
import { user, account } from "../src/server/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "../src/features/authentication/lib/auth";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@biblio.test";
const ADMIN_NAME = process.env.SEED_ADMIN_NAME ?? "Administrateur";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Bibli0-Admin!";

async function main() {
  const existing = await db.select().from(user).where(eq(user.email, ADMIN_EMAIL)).limit(1);

  if (existing.length > 0) {
    const current = existing[0];
    const accounts = await db.select().from(account).where(eq(account.userId, current.id));
    if (accounts.length === 0) {
      await db.delete(user).where(eq(user.email, ADMIN_EMAIL));
      console.log(`~ Orphelin supprimé : ${ADMIN_EMAIL} (re-création propre)`);
    } else {
      if (current.role === "admin") {
        console.log(`✓ Admin existe déjà : ${ADMIN_EMAIL} (rôle admin)`);
        return;
      }
      await db.update(user).set({ role: "admin" }).where(eq(user.email, ADMIN_EMAIL));
      console.log(`✓ Rôle élevé à admin : ${ADMIN_EMAIL}`);
      return;
    }
  }

  try {
    await auth.api.signUpEmail({
      body: { name: ADMIN_NAME, email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
  } catch (err) {
    throw new Error(`Signup échoué : ${String(err)}`);
  }

  const created = await db.select().from(user).where(eq(user.email, ADMIN_EMAIL)).limit(1);
  if (created.length === 0) {
    throw new Error("Signup sans utilisateur en base");
  }
  await db.update(user).set({ role: "admin" }).where(eq(user.email, ADMIN_EMAIL));
  console.log(`✓ Admin créé : ${ADMIN_EMAIL} (password: ${ADMIN_PASSWORD})`);
  console.log("⚠️ Changez ce mot de passe après la première connexion.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
