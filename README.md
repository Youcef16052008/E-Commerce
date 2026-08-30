# Biblio — Librairie numérique

> Boutique en ligne d'e-books / licences numériques : catalogue, panier, paiement Stripe
> (mode test), bibliothèque personnelle et back-office administrateur.

**État : en construction.** La fondation (Slice 0) est posée ; les slices fonctionnelles
(arrivant) = catalogue, panier, checkout, délivrance d'entitlements.

## Stack

- **Next.js 16.3.x** (Active LTS) · **React 19.2.x** · **TypeScript strict**
- **Tailwind CSS 4.3.x**
- **PostgreSQL 17** (Neon) · **Drizzle ORM 0.45.x**
- **Better Auth 1.7.x** (email/password, RBAC)
- **Stripe Checkout** (mode test) — venir
- **Vitest 4.x** (unit/integration) · **Playwright 1.62.x** (e2e)
- Déploiement : **Vercel + Neon + R2/S3** (à venir)

## Avancement

| Slice                     | Statut |
|---------------------------|--------|
| 0 — Fondations            | ✅ Done |
| 1 — Authentication        | ⬜ à faire |
| 2 — Catalogue public      | ⬜ à faire |
| 3 — Panier                | ⬜ à faire |
| 4 — Checkout Stripe       | ⬜ à faire |
| 5 — Bibliothèque/files    | ⬜ à faire |
| 6 — Commandes             | ⬜ à faire |
| 7 — Admin                 | ⬜ à faire |
| 8 — Dashboard admin       | ⬜ à faire |
| 9 — Qualité / accessibilité | ⬜ à faire |
| 10 — Déploiement          | ⬜ à faire |
| 11 — Étude de cas portfolio | ⬜ à faire |

## Démarrage

```bash
cp .env.example .env        # renseigner DATABASE_URL, BETTER_AUTH_SECRET, etc.
npm install
npm run db:migrate          # applique migrations Drizzle (Neon)
npm run dev                 # http://localhost:3000
```

## Commandes

| Commande                | Description |
|-------------------------|-------------|
| `npm run dev`           | Serveur de dev |
| `npm run build`         | Build production |
| `npm run lint`          | ESLint |
| `npm run typecheck`     | TypeScript strict |
| `npm test`              | Tests unitaires / intégration |
| `npm run test:e2e`      | Tests end-to-end (Playwright) |
| `npm run db:generate`   | Génère une migration Drizzle |
| `npm run db:migrate`    | Applique les migrations |
| `npm run db:studio`     | Inspecteur de base (Drizzle Studio) |

## Vérification des versions

Les versions affichées sont vérifiées au 2026-08-30. Au moment d'installer, re-vérifier :
`npm show <package> version` et les docs officielles (support/LTS).

## Documentation

- `docs/discovery.md` — problème, personas, signal senior.
- `docs/product-brief.md` — PRD, user stories, périmètre.
- `docs/architecture.md` — architecture, ERD, contrats API, sécurité.
- `docs/stack.md` — comparaison des choix et versions vérifiées.
- `docs/adr/` — décisions structurantes.
- `docs/project-state.md` — état du projet (progression).

## Sécurité (principes)

- Webhooks Stripe : signature vérifiée sur corps brut ; **source de vérité = webhook**.
- Idempotence 2 couches (`Idempotency-Key` + table `stripe_events` UNIQUE).
- Prix toujours relus côté serveur (jamais depuis le client) ; montants en centimes.
- RBAC re-vérifié dans chaque action serveur (pas seulement middleware).
- Secrets côté serveur uniquement ; `.env*` non commité.

## Licence

À définir (projet portfolio, contenu original).
