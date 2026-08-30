# ADR-005 — Déploiement & stockage

## Statut

Proposé.

## Contexte

Budget faible, délai 4-6 semaines, app serverless Next 16. Fichiers e-books à héberger hors du
serveur (assets volumineux), accès à durée limitée.

## Décision

- **Vercel** (Next 16) + **Neon** (Postgres 17) + **R2/S3** pour les fichiers e-books.

## Conséquences

- Secrets via variables d'environnement Vercel ; `.env.example` commité, `.env*` non commité.
- Migrations Drizzle versionnées, appliquées en CI ; seeds de démo reproductibles.
- Accès fichiers : URL **pré-signée à TTL court (ex 15 min)**, générée côté serveur. L'upload se
  fait côté serveur, jamais depuis le client.
- Rollback par re-déploiement ; migrations réversibles quand possible.
- Monitoring/erreurs : service d'observabilité (Sentry ou équivalent) activé au déploiement.

## Risques

Quotas gratuits Vercel/Neon/R2 — surveiller. CORS du bucket à configurer.
