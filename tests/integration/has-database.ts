export const PLACEHOLDER_DATABASE_URL = "postgres://user:pass@localhost:5432/biblio-placeholder";

/** Vrai si une vraie DATABASE_URL est fournie (les suites d'intégration tournent alors). */
export const hasDatabase = Boolean(
  process.env.DATABASE_URL && process.env.DATABASE_URL !== PLACEHOLDER_DATABASE_URL,
);
