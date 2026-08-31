# Biblio — Librairie numérique

> Boutique en ligne d'e-books / licences numériques : catalogue, panier, paiement Stripe
> (mode test), bibliothèque personnelle et back-office administrateur.

**État : en construction.** Fondations (0), Authentication (1), Catalogue public (2),
Panier (3), Checkout Stripe (4), Bibliothèque & téléchargements (5), Commandes (6)
et Admin (7) en place. Prochaine : Dashboard admin / stats (8).

## Credentials de démonstration (dev local)

| Rôle  | Email               | Mot de passe    |
| ----- | ------------------- | --------------- |
| Admin | `admin@biblio.test` | `Bibli0-Admin!` |

> Créez-le avec `npm run seed:admin` (changez le mot de passe en production).

## Administration

Espace back-office réservé au rôle `admin` (`/admin`) :

- **Produits** (`/admin/products`) — CRUD complet (création, édition, publier /
  dépublier, suppression). Les brouillons sont visibles ici uniquement ; le
  catalogue public n'expose que les produits `published`.
- **Commandes** (`/admin/orders`) — liste globale avec email client, totaux et
  changement de statut (pending → paid → fulfilled…).
- **API** : `GET/POST /api/admin/products`, `GET/PATCH/DELETE /api/admin/products/[id]`,
  `GET /api/admin/orders`, `PATCH /api/admin/orders/[id]/status` — 401 si non
  connecté, **403** si rôle customer.
- Compte seed : `admin@biblio.test` / `Bibli0-Admin!` (`npm run seed:admin`).

## Stack

- **Next.js 16.3.x** (Active LTS) · **React 19.2.x** · **TypeScript strict**
- **Tailwind CSS 4.3.x**
- **PostgreSQL 17** (Neon) · **Drizzle ORM 0.45.x**
- **Better Auth 1.7.x** (email/password, RBAC)
- **Stripe Checkout** (mode test) — venir
- **Vitest 4.x** (unit/integration) · **Playwright 1.62.x** (e2e)
- Déploiement : **Vercel + Neon + R2/S3** (à venir)

## Avancement

| Slice                       | Statut     |
| --------------------------- | ---------- |
| 0 — Fondations              | ✅ Done    |
| 1 — Authentication          | ✅ Done    |
| 2 — Catalogue public        | ✅ Done    |
| 3 — Panier                  | ✅ Done    |
| 4 — Checkout Stripe         | ✅ Done    |
| 5 — Bibliothèque / fichiers | ✅ Done    |
| 6 — Commandes               | ✅ Done    |
| 7 — Admin                   | ✅ Done    |
| 8 — Dashboard admin         | ⬜ à faire |
| 9 — Qualité / accessibilité | ⬜ à faire |
| 10 — Déploiement            | ⬜ à faire |
| 11 — Étude de cas portfolio | ⬜ à faire |

## Démarrage

```bash
cp .env.example .env        # renseigner DATABASE_URL, BETTER_AUTH_SECRET, etc.
npm install
npm run db:migrate          # applique les migrations Drizzle (base vierge / CI)
npm run dev                 # http://localhost:3000
```

> Le dossier `drizzle/meta/` est **versionné** : indispensable pour que
> `drizzle-kit migrate` fonctionne sur un clone/CI frais. Si votre base existante
> a été créée avec `npm run db:push`, continuez d'utiliser `db:push` (ne rejouez
> pas `db:migrate` dessus : les CREATE TABLE seraient dupliqués).

## Commandes

| Commande                 | Description                                                       |
| ------------------------ | ----------------------------------------------------------------- |
| `npm run dev`            | Serveur de dev                                                    |
| `npm run build`          | Build production                                                  |
| `npm run lint`           | ESLint                                                            |
| `npm run typecheck`      | TypeScript strict                                                 |
| `npm test`               | Tests unitaires / intégration                                     |
| `npm run test:e2e`       | Tests end-to-end (Playwright)                                     |
| `npm run db:generate`    | Génère une migration Drizzle                                      |
| `npm run db:migrate`     | Applique les migrations                                           |
| `npm run db:studio`      | Inspecteur de base (Drizzle Studio)                               |
| `npm run books:generate` | Génère les e-books de démo (`books/`)                             |
| `npm run books:validate` | Valide les EPUB/PDF (zipfile, mimetype en premier)                |
| `npm run books:upload`   | Upload les fichiers + mappe `products.file_url`                   |
| `npm run storage:check`  | Test bout en bout du stockage (upload → presign → 200)            |
| `npm run storage:minio`  | Met en place MinIO local (serveur, bucket, user, policy, données) |

## Stockage local (démo) — MinIO

Les fichiers ne transitent jamais par l'app : le serveur renvoie des **URLs
pré-signées SigV4** (15 min) après vérification de l'achat.

```bash
bash scripts/setup-minio.sh   # télécharge MinIO, démarre :9000, bucket biblio,
                              # user applicatif + policy, seed + upload des e-books
cp .env.example .env          # puis renseigner les STORAGE_* affichés
npm run storage:check         # vérification de bout en bout
```

Production : Cloudflare **R2** avec les mêmes `STORAGE_*` (ajouter
`STORAGE_ACCOUNT_ID` à la place de `STORAGE_ENDPOINT`) — aucun changement de code
(voir `docs/adr/006-storage.md`).

## Catalogue de masse — Project Gutenberg (Gutendex)

Le catalogue démo peut être **importé** (copié) depuis les ~70 000 œuvres du domaine
public de Project Gutenberg (API Gutendex, sans clé). Après l'import, le site
**ne dépend plus d'aucune source externe** : métadonnées + EPUB + couvertures vivent
dans votre base et votre stockage.

```bash
npm run db:push            # applique la migration additive 0002 (source/license/…)
npm run seed:products      # convertit les 12 produits démo en USD (boutique mono-devise)
npm run import:gutenberg   # importe les 500 livres les plus populaires
```

Personnalisable via `.env` (voir `.env.example`) : `IMPORT_GUTENDEX_LIMIT`,
`IMPORT_GUTENDEX_LANGUAGES`, `IMPORT_PRICE_CENTS` (défaut **50 → 0,50 USD**),
`IMPORT_PUBLISHED`, `IMPORT_MIN_DOWNLOADS`, et `GUTENDEX_BASE_URL` (miroir auto-hébergé).

**✅ Validé en réel** : 500 livres importés (0 échec), 512 produits en base,
500 EPUB + 500 couvertures dans MinIO, tests d'intégration 8/8 sur Neon
(y compris téléchargement pré-signé → 200 → contenu intact).

- **Licence** : œuvres du domaine public (États-Unis) — licence enregistrée par produit,
  usage commercial autorisé (`docs/adr/007-catalog-import.md`).
- **Idempotent** : relançable sans doublon (dédupliqué par `source + source_id`).
- **Ne jamais utiliser** Z-Library / Anna's Archive / LibGen (contenus piratés).

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
