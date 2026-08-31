# PROJECT_STATE — Biblio

Mis à jour : 2026-08-30.

## Objectif

Boutique e-commerce d'e-books / licences numériques avec délivrance d'entitlements
après paiement Stripe vérifié. Projet portfolio full-stack senior.

## Stack & versions (ré-vérifiées au 2026-08-30)

| Outil      | Choice              | Version installée                 |
| ---------- | ------------------- | --------------------------------- |
| Framework  | Next.js             | **16.3.3** (Active LTS)           |
| Runtime    | Node.js             | 24 visé (sandbox local v20.20.2)  |
| UI         | React               | **19.2.8**                        |
| CSS        | Tailwind CSS        | **4.3.3**                         |
| DB         | PostgreSQL          | 17 (Neon)                         |
| ORM        | Drizzle             | **0.45.2** / kit 0.31.10          |
| Validation | Zod                 | **4.5.4**                         |
| Auth       | Better Auth         | **1.7.2**                         |
| Paiement   | Stripe Checkout     | **22.6.0** (mode test)            |
| Stockage   | AWS SDK S3          | **3.1121.x** (client + presigner) |
| Tests      | Vitest / Playwright | **4.1.11** / **1.62.1**           |

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
- [x] **Catalogue de masse — Import Gutendex** : ~500 œuvres du domaine public (Project
      Gutenberg, API sans clé) importées dans **notre** base + stockage (aucune dépendance
      en direct après import — si la source tombe, le site tourne). EPUB/PDF + couvertures
      hébergés (`books/gutenberg/…`, couvertures servies par `/api/covers/gutenberg/[id]`),
      prix **0,50 USD** (`IMPORT_PRICE_CENTS`), licence + `source`/`source_id`/`downloads`
      en base (migration additive `0002`), mapping pur testé (14 tests) + orchestrateur
      testé (2 tests, fetch/repo/storage stubbés). Monnaie boutique unifiée **USD**
      (Stripe Checkout mono-devise) : `npm run seed:products` convertit la démo.
      **✅ Validé en réel (PC Windows + Neon + MinIO local)** — `db:push` appliqué ;
      `seed:products` OK ; MinIO : bucket `biblio`, user `biblioapp`, policy `biblio-rw`
      (Windows : `storage-bin/minio.exe` + `mc.exe`) ; `books:generate` + `books:upload`
      OK + `storage:check` **200/SHA-256 identique** ; **`import:gutenberg` →
      `✓ Terminé : 500 importés, 0 déjà présents, 0 échecs (512 scannés)`** ;
      base : **512 produits** (500 `source='gutenberg'` + 12 démo) ; MinIO : **500 EPUB**
      (`books/gutenberg/`) + **500 couvertures** (`covers/gutenberg/`) ;
      `npm run test:integration` contre Neon → **3 fichiers / 8 tests verts, 1 skipped**
      (stockage configuré ⇒ le cas `STORAGE_NOT_CONFIGURED` est ignoré) — dont le
      **téléchargement réel** : URL pré-signée → GET **200** `application/epub+zip`,
      contenu intact. `.env` non tracké.
- [x] **Slice 4 — Checkout Stripe** : session Checkout (prix serveur, Managed Payments géré),
      webhook signé + idempotence 2 couches, commande payée + entitlement + vidage panier en
      transaction. **Validé sur Neon réelle** (session créée, webhook fulfilled, doublon ignoré,
      signature invalide → 400, checkout anonyme → 401).
- [x] **Slice 5 — Bibliothèque & téléchargements** : page `/library` (ouvrages achetés), API
      `GET /api/me/library` + `POST /api/me/library/[productId]/download`, adaptateur stockage
      S3 **`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`** (SigV4 **query-string**,
      remplace `aws4fetch` qui signe en en-tête → 403). 12 e-books de démo (6 EPUB valides —
      `mimetype` en premier, non compressé — + 6 PDF) dans `books/`, mappés `s3://biblio/books/…`
      via `npm run books:upload`. **Téléchargement validé de bout en bout** : upload →
      URL pré-signée (`X-Amz-Algorithm`/`X-Amz-Signature`) → GET → **200**
      `application/epub+zip`, contenu intact (SHA-256 identique, `npm run storage:check`).
      Codes 401/403/404/503 en place ; ADR-006 → **Adopté** (MinIO local pour la démo,
      R2 pour la prod, même code, bascule par `STORAGE_*`).
      **Validations réelles** : HTTP sans BDD — `GET /api/me/library` → **401**,
      `POST /api/me/library/[id]/download` → **401**, `/library` non connecté → **307**
      `/auth/sign-in?next=/library` ; stockage E2E — `npm run storage:check` → URL
      pré-signée SigV4, **GET 200 `application/epub+zip`, contenu intact** ;
      `npm run books:validate` → 12 fichiers valides ; `next build --webpack`,
      `tsc --noEmit`, ESLint, Prettier **verts** ; `npm test` → **25 tests unitaires OK**
      (9 tests d'intégration prêts, ignorés sans `DATABASE_URL`).
- [ ] Slice 6 — Commandes (historique) / 7 — Admin.
- [ ] Slices 8+ — voir `docs/implementation-plan.md`.

## Prochaine tâche

- **Slice 6 — Commandes (historique)** / Slice 7 — Admin (CRUD produits + dashboard).
- Avant déploiement (Slice 10) : `neon deploy`/`neon config`, vars R2, webhook Stripe test.

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
- Sandbox : les CDN MinIO/Docker/GitHub-assets ne sont pas accessibles → validation
  du stockage faite sur un serveur S3 compatible local (`S3rver`, npm, **non persisté
  dans package.json**, credentials `S3RVER`/`S3RVER`) ; sur la machine de démo, utiliser
  **MinIO** via `bash scripts/setup-minio.sh` (mêmes `STORAGE_*`).
- `books:upload` et les tests d'intégration exigent une vraie `DATABASE_URL` ; les
  suites d'intégration sont ignorées proprement (skip) si elle est absente.
- `next/font/google` (Geist) remplacé par des **polices système** : le build ne dépend
  plus d'aucun CDN externe (fonts.googleapis.com était bloqué en sandbox/CI).
- **`drizzle/meta/` versionné** depuis ce correctif : `drizzle-kit migrate` (CI/fresh
  clone) exige `meta/_journal.json` (dossier auparavant gitignoré → `Apply DB
migrations` échouait). Les bases déjà créées via `db:push` (Neon actuelle) restent
  en mode `db:push` ; les bases vierges/CI utilisent `db:migrate`.
- **Sécurité** : ne jamais insérer de jeton GitHub dans une URL `git push`
  (`https://ghp_...@github.com/...`). Ces jetons apparaissent dans l'historique de
  l'invite et peuvent être capturés par des scanners. Utiliser le credential helper
  (`git config --global credential.helper`) ou `gh auth login`.
- **CI verte** (PR #1, commit `322c0b1`) : Format → Lint → Typecheck → `db:migrate`
  (journal `drizzle/meta` versionné) → `seed:all` → tests unitaires/intégration →
  build → e2e (7 verts) — y compris le **vrai bug mobile corrigé** : en-tête non
  responsive (nom utilisateur recouvrait « Se déconnecter » → pointer-events),
  passée en `flex-wrap`.
- **E2E** : emails uniques par projet/exécution + `workers=1` en CI (évite le conflit
  d'inscription entre projets chromium/mobile partageant un même worker).
