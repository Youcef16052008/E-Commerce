# PROJECT_STATE — Biblio

Mis à jour : 2026-08-30.

## Objectif

Boutique e-commerce d'e-books / licences numériques avec délivrance d'entitlements
après paiement Stripe vérifié. Projet portfolio full-stack senior.

## Stack & versions (ré-vérifiées au 2026-08-30)

| Outil      | Choice              | Version installée                |
| ---------- | ------------------- | -------------------------------- |
| Framework  | Next.js             | **16.3.3** (Active LTS)          |
| Runtime    | Node.js             | 24 visé (sandbox local v20.20.2) |
| UI         | React               | **19.2.8**                       |
| CSS        | Tailwind CSS        | **4.3.3**                        |
| DB         | PostgreSQL          | 17 (Neon)                        |
| ORM        | Drizzle             | **0.45.2** / kit 0.31.10         |
| Validation | Zod                 | **4.5.4**                        |
| Auth       | Better Auth         | **1.7.2**                        |
| Paiement   | Stripe Checkout     | à intégrer (Slice 4)             |
| Tests      | Vitest / Playwright | **4.1.11** / **1.62.1**          |

## Architecture

Modular monolith, Next.js App Router, server-first, features-oriented. Voir `docs/architecture.md`.

## Conventions

TS strict, aucun `any` non justifié. Prix en centimes. Validation Zod aux frontières.
Erreurs typées. Secrets côté serveur. Décisions dans `docs/adr/`.

## Décisions

- Next 16 / Node 24 / React 19.2 / Tailwind 4.3.
- Postgres 17 + Drizzle. Better Auth (email/password). Stripe Checkout.
- Idempotence 2 couches (Idempotency-Key + table `stripe_events` unique).
- Déploiement : Vercel + Neon + R2/S3.

## Progression

- [x] Discovery, Product Brief, Stack, Architecture, Plan, ADR (docs/).
- [x] **Slice 0 — Fondations** : scaffold Next 16 + TS strict + Tailwind + Drizzle/Neon + Better Auth + Vitest + Playwright + ESLint/Prettier + CI. Migration initiale générée.
      Build prod OK. Tests unitaires (3) + e2e (2, desktop+mobile) verts.
      Git initialisé (commit "Slice 0").
- [ ] Slice 1 — Authentication (register/login, RBAC, seed admin).
- [ ] Slices 2+ — voir `docs/implementation-plan.md`.

## Prochaine tâche

- **Slice 1 — Authentication.** Configurer le client/serveur Better Auth, la page connexion,
  la page d'inscription, la protection des routes admin et un seed utilisateur admin.

## Problèmes connus

- Vulnérabilité **moderate, dev-only** dans `esbuild` (via `drizzle-kit`), sans impact runtime ;
  le correctif proposé est un downgrade cassant → non appliqué, réévaluer (Note [npm audit]).
- Le sandbox local : Node v20 (au lieu de 24) et bibliothèques système Playwright installées
  via `install-deps` — OK pour le dev, la CI utilisera Node 24.
- Better Auth `height`/`handler` : API v1.7 expose `auth.handler` (fonction), pas `auth.handlers`.
- Playwright : binaire `chromium` téléchargé ; nécessite `npx playwright install --with-deps chromium` en CI.
