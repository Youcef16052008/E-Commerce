import { PLACEHOLDER_DATABASE_URL } from "../setup-env";

/** Vrai si une vraie DATABASE_URL est fournie (les suites d'intégration tournent alors). */
export const hasDatabase = Boolean(
  process.env.DATABASE_URL && process.env.DATABASE_URL !== PLACEHOLDER_DATABASE_URL,
);

/** Vrai si une clé Stripe de test réelle est configurée (pas le placeholder). */
export const hasStripe = Boolean(
  process.env.STRIPE_SECRET_KEY &&
  process.env.STRIPE_SECRET_KEY !== "sk_test_xxx" &&
  process.env.STRIPE_SECRET_KEY.startsWith("sk_test_"),
);
