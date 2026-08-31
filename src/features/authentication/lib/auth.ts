import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/server/db";

/**
 * Config Better Auth — self-hosted, email/password.
 * - Session : server-side httpOnly (jamais exposée au client).
 * - Rôle : champ `role` sur l'utilisateur (customer | admin), non modifiable par le
 *   client (`input: false`). La sécurité est re-vérifiée dans chaque action serveur.
 * - Rate limiting : strict par défaut ; désactivé (ou très relaxé) uniquement pour les
 *   tests e2e via `BETTER_AUTH_RATE_LIMIT_DISABLED=1`.
 */
const rateLimitDisabled = process.env.BETTER_AUTH_RATE_LIMIT_DISABLED === "1";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: {
    enabled: true,
  },
  rateLimit: rateLimitDisabled
    ? { enabled: false }
    : {
        window: 60,
        max: 20,
      },
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "customer",
        input: false,
      },
    },
  },
  plugins: [nextCookies()],
});
