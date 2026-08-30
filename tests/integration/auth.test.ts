import { describe, it, expect, beforeAll } from "vitest";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/features/authentication/lib/auth";

/**
 * Tests d'intégration de l'authentification contre la base de données réelle.
 * Nécessite DATABASE_URL et la migration appliquée (local Postgres ou Neon dev).
 * Utilise un email unique pour rester idempotent entre exécutions.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const runtime = process.env as any;

describe("Authentication (intégration)", () => {
  const email = `it-auth-${Date.now()}@biblio.test`;
  const password = "MotDePasse!123";

  beforeAll(() => {
    if (!runtime.DATABASE_URL) {
      throw new Error("DATABASE_URL manquant pour les tests d'intégration.");
    }
  });

  it("signup crée un utilisateur avec rôle client", async () => {
    await auth.api.signUpEmail({
      body: { name: "IT User", email, password },
    });

    const rows = await db.select().from(user).where(eq(user.email, email)).limit(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe("customer");
    // mot de passe jamais stocké en clair sur la table user
    expect((rows[0] as unknown as { password?: string }).password).toBeUndefined();
  });

  it("signin avec mauvais mot de passe est rejeté", async () => {
    await expect(
      auth.api.signInEmail({
        body: { email, password: "mauvais-mdp" },
      }),
    ).rejects.toThrow();
  });
});
