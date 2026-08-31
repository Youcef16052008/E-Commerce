import { PLACEHOLDER_DATABASE_URL } from "../setup-env";

/** Vrai si une vraie DATABASE_URL est fournie (les suites d'intégration tournent alors). */
export const hasDatabase = Boolean(
  process.env.DATABASE_URL && process.env.DATABASE_URL !== PLACEHOLDER_DATABASE_URL,
);
