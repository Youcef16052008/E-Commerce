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
- Déploiement : Vercel + Neon + R2/S3. **Neon câblé (project `fragrant-bonus-35221703`,**
  **branche `production`)** : migration appliquée, 12 produits + admin seedés, app testée en direct.

## Progression

- [x] Discovery, Product Brief, Stack, Architecture, Plan, ADR (docs/).
- [x] **Slice 0 — Fondations** : scaffold Next 16 + TS strict + Tailwind + Drizzle/Neon + Better Auth + Vitest + Playwright + ESLint/Prettier + CI. Migration initiale générée.
- [x] **Slice 1 — Authentication** : client/serveur Better Auth, pages connexion/inscription,
      en-tête avec session, déconnexion, RBAC, seed admin. Vérifié en réel sur un Postgres 17 local.
- [x] **Slice 2 — Catalogue public** : liste (recherche `q`, filtres genre/format/langue, tri,
      pagination), page produit + `generateMetadata` (SEO), API `GET /api/products` et
      `GET /api/products/[slug]`, seed 12 produits. Vérifié en réel (API + rendu + e2e).
- [x] **Slice 3 — Panier** : persistant en BDD (`cart_items`), ajout/retrait/maj quantité
      (bornes 1..10), total calculé côté serveur (prix relus depuis `products`), API
      `GET/POST /api/cart` + `PATCH/DELETE /api/cart/[productId]`, page `/cart`, badge panier,
      bouton "Ajouter au panier" (redirect si non connecté). Rate limiting Better Auth
      documenté (désactivé seulement en e2e via flag).
- [x] **Infra — Neon** : projet `fragrant-bonus-35221703` (branche production) lié ; migrations
      appliquées (10 tables vérifiées) ; 12 produits + admin seedés ; `DATABASE_URL` du projet
      pointé vers Neon ; `neon.ts` commité. `neon deploy`/`neon config` restent à faire.
- [x] **Slice 4 — Checkout Stripe** : session Checkout (prix serveur, Managed Payments géré),
      webhook signé + idempotence 2 couches, commande payée + entitlement + vidage panier en
      transaction. **Validé sur Neon réelle** (session créée, webhook fulfilled, doublon ignoré,
      signature invalide → 400, checkout anonyme → 401).
- [x] **Slice 5 — Bibliothèque & téléchargements** : page `/library` (ouvrages achetés), API
      `GET /api/me/library` + `POST /api/me/library/[productId]/download` (URL pré-signée, TTL 15 min),
      stockage objet S3/R2 (aws4fetch). **Validé en réel** (liste, autorisation 403 sans droit,
      503 si stockage non configuré, redirect 307 anonyme). ADR-006.
- [ ] Slice 6 — Commandes (historique) / 7 — Admin.
- [ ] Slices 8+ — voir `docs/implementation-plan.md`.

## Prochaine tâche

- **Slice 4 — Checkout Stripe** (création de session, webhook signé, idempotence,
  délivrance d'entitlement).

## Problèmes connus

- Vulnérabilité **moderate, dev-only** dans `esbuild` (via `drizzle-kit`), sans impact runtime ;
  le correctif proposé est un downgrade cassant → non appliqué, réévaluer (Note [npm audit]).
- Le sandbox local : Node v20 (au lieu de 24) et bibliothèques système Playwright installées
  via `install-deps` — OK pour le dev, la CI utilisera Node 24.
- Better Auth v1.7 : l'API route expose `auth.handler` (fonction), pas `auth.handlers` ;
  `signUpEmail` côté serveur **lève** une erreur (pas de champ `error`) ; table `account` requiert `issuer`.
- La migration 0001 (colonne `account.issuer`) a été appliquée sur Postgres 17 local.
- Tests d'intégration auth : exigent `DATABASE_URL` appliqué (local OK ; Neon → OK si `db:migrate`).
- Playwright en CI : `npx playwright install --with-deps chromium`.
