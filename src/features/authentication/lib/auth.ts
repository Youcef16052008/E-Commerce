import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/server/db";

/**
 * Config Better Auth — self-hosted, email/password.
 * - Session : server-side httpOnly (jamais exposée au client).
 * - Rôle : champ `role` sur l'utilisateur (customer | admin), non modifiable par le
 *   client (`input: false`). La sécurité est re-vérifiée dans chaque action serveur.
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: {
    enabled: true,
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
