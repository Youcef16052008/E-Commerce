# ADR-005 — Déploiement & stockage

## Statut

Proposé (2026-09-01).

> Critère de passage en **Adopté** : une **URL live réelle** (déploiement
> Vercel validé + checklist post-deploy du runbook exécutée). À ce jour, le
> sandbox Arena n'a pas accès aux credentials Vercel/Neon/R2 → déploiement
> manuel à faire (`docs/runbook-deploy.md`), statut resté **Proposé**.

## Contexte

Budget faible, délai 4-6 semaines, app serverless Next 16. Fichiers e-books à héberger hors du
serveur (assets volumineux), accès à durée limitée.

## Décision

- **Vercel** (Next 16) + **Neon** (Postgres 17) + **R2/S3** pour les fichiers e-books.

## Conséquences

- Secrets via variables d'environnement Vercel ; `.env.example` commité (avec
  section Production documentée), `.env*` non commité.
- **`BETTER_AUTH_URL` = URL https publique** : sans elle, les cookies de session
  sont émis sur le mauvais domaine et la connexion est cassée en production.
- Migrations Drizzle versionnées, appliquées en CI ; seeds de démo reproductibles.
  En prod : `npm run db:migrate` (jamais `db:push`) — le journal `drizzle/meta`
  est complet et versionné.
- Accès fichiers : URL **pré-signée à TTL court (ex 15 min)**, générée côté
  serveur. L'upload se fait côté serveur, **hors request path**
  (`books:upload` / `import:gutenberg`), jamais depuis le client.
- Webhook Stripe : corps brut + vérification de signature avant traitement ;
  endpoint `/api/webhooks/stripe` (event `checkout.session.completed`).
- Rollback par re-déploiement (Vercel → « Promote to Production ») ; migrations
  du MVP additives (aucun down SQL requis).
- Monitoring/erreurs : service d'observabilité (Sentry ou équivalent) à activer
  au déploiement (hors périmètre MVP).
- CI : aucun nouveau workflow requis — le deploy Vercel auto sur `main` est la
  porte d'entrée ; `.github/workflows/ci.yml` (format → lint → typecheck →
  migrate → seed → tests → build → e2e) reste la barrière avant merge.

## Risques

Quotas gratuits Vercel/Neon/R2 — surveiller. CORS du bucket à configurer.

## Blocages actuels (2026-09-01)

1. **Pas de credentials de déploiement dans le sandbox** (Vercel, compte R2,
   token) → les étapes 1-6 du runbook restent « à faire » (manuel, ~30 min).
2. **Webhook Stripe** nécessite un compte test + `stripe listen` sur une
   machine avec la CLI → à faire après le deploy Vercel (runbook §4).
3. **Lighthouse « prod »** (URL publique, profils mobile + desktop) à relancer
   après le déploiement pour compléter `docs/lighthouse.md`.

Aucun de ces blocages ne remet en cause le choix d'architecture (Vercel +
Neon + R2) : ils concernent l'exécution du déploiement, pas la décision.
