# Plan d'implémentation — vertical slices

> Chaque slice est une **capacité utilisable de bout en bout**. Ordre = dépendances.
> P0 obligatoire · P1 importante · P2 amélioration.

## Slice 0 — Fondations (P0)

- **Objectif** : projet Next 16 + TS strict + lint + env + base.
- **Stack** : Next 16, TS strict, Tailwind 4.3, ESLint/Prettier, Drizzle + Neon, Vitest, Playwright, GitHub Actions.
- **Fichiers** : config, `src/server/db/schema`, `.env.example`, `README` initial, `docs/PROJECT_STATE.md`.
- **Commandes** : `npm run dev`, `npm run lint`, `npm run typecheck`, `npm test`.
- **Critères** : `npm run build` passe ; schéma init créé ; CI verte.
- **Risques** : versions → ré-vérifier à l'install, épingler.

## Slice 1 — Authentication (P0)

- **User story** : U3 — créer un compte et se connecter (email/mot de passe).
- **Fichiers** : `features/authentication/*`, config Better Auth, schéma users (via Better Auth), ajout colonne `role`.
- **Tests** : unit (validation mot de passe), intégration (connexion), e2e (register → login → logout).
- **Critères** : session httpOnly, RBAC (rôle admin) présent, données sensibles jamais au client.

## Slice 2 — Catalogue public (P0)

- **User story** : U1, U2 — liste, recherche, filtres, page produit.
- **Fichiers** : `features/products/*`, services de lecture, composants UI.
- **Données** : table `products` + seed de démonstration.
- **Tests** : unit (filtres/validation), intégration (serveur), e2e (voir produit).
- **Critères** : SEO, états loading/empty/error, accessible.

## Slice 3 — Panier (P0)

- **User story** : U4 — panier persistant.
- **Fichiers** : `features/cart/*`, `shared/state` (utilisation de l'URL/état serveur, pas de store global superflu).
- **Tests** : unit (calcul total serveur), intégration, e2e.
- **Critères** : panier reconstruit depuis la BDD à la reconnexion ; validation des quantités.

## Slice 4 — Checkout Stripe (P0) ★ cœur du projet

- **User story** : U5, U6 — paiement test + délivrance d'entitlement.
- **Fichiers** : `features/checkout/*` (création session, webhook, idempotence), table `stripe_events`, `orders`, `order_items`, `entitlements`.
- **Tests** : unit (prix relu serveur, calcul), intégration (webhook signé idempotent, doublon ignoré), e2e (parcours achat complet via Stripe CLI test + webhook).
- **Critères** : ne jamais faire confiance au prix client ; `checkout.session.completed` signé et non déjà traité → création entitlement ; panier vidé après paiement.

## Slice 5 — Bibliothèque & téléchargement (P0) ✅ Done

- **User story** : U7 — accès au fichier acheté.
- **Fichiers** : `features/library/*` (page /library, GET /api/me/library,
  POST /api/me/library/[productId]/download), `src/server/storage/index.ts`
  (`@aws-sdk/client-s3` + `s3-request-presigner`).
- **Données** : `products.file_url` = `s3://<bucket>/books/<slug>.<format>` ;
  e-books de démo générés (`books/`) et validés (`zipfile` : mimetype en premier, stored).
- **Tests** : unit — `tests/unit/storage.test.ts` (config, parse, **pré-signature SigV4
  query-string**, TTL) ; intégration — liste, 403 sans entitlement, 404 sans fichier,
  503 sans config, URL pré-signée + **GET 200 contenu intact** (si stockage configuré).
- **Critères** : seul le propriétaire accède (autorisation objet) ; URL TTL 15 min ;
  un seul entitlement par produit (index unique) ; 401/403/404/503 typés.
- **Stockage** : MinIO local (`scripts/setup-minio.sh`) pour la démo, R2 pour la prod
  (bascule via `STORAGE_*` uniquement, voir ADR-006).

## Slice 5bis — Catalogue de masse (import Gutendex) ✅ Done

- **Objectif** : passer d'une démo de 12 produits à une vraie librairie **sans dépendance
  externe en production**.
- **Décision** : importer ~500 œuvres du domaine public depuis Gutendex (Project Gutenberg)
  dans la base + stockage locaux ; source utilisée uniquement à l'import.
- **Livré** : `src/features/catalog-import/*` (mapper pur + orchestrateur + dépôt),
  `scripts/import-gutendex.ts`, migration `drizzle/0002_catalog-import.sql` (additive),
  `GET /api/covers/gutenberg/[id]`, env `IMPORT_*` + `GUTENDEX_BASE_URL`, ADR-007.
- **Testing** : 14 tests unitaires mapping + 2 tests orchestrateur (stubs), 41 tests
  unitaires au total, `tsc`/ESLint/Prettier verts.

## Slice 6 — Commandes / historique (P1) ✅ Done

- **User story** : U7 — historique des commandes, statuts.
- **Fichiers** : `features/orders/*` (types, libellés de statut, repo, service),
  page `/orders` (RSC, redirige vers sign-in si non connecté), `GET /api/me/orders`,
  lien « Commandes » dans l'en-tête.
- **Données** : `order_items.quantity` (snapshot de la quantité achetée, migration
  `0003_order-quantity`) ; devises `orders`/`order_items` unifiées **USD**.
- **Tests** : unit — libellés/styles de statut (5 tests) ; intégration — liste avec
  articles/quantité/total + isolation entre utilisateurs (2 tests, base réelle).
- **Critères** : statuts cohérents avec le paiement (pending → paid → fulfilled…) ;
  totaux relus en base (jamais recalculés côté client) ; aucune fuite entre comptes.

## Slice 7 — Admin (P0/P1) ✅ Done

- **User story** : U8, U10 — CRUD produits, gestion commandes.
- **Fichiers** : `features/admin/*` (domain schemas/types, application services +
  `requireAdmin`, infrastructure repo, UI formulaires/actions), pages
  `/admin`, `/admin/products`, `/admin/products/new`, `/admin/products/[id]/edit`,
  `/admin/orders`, routes API `/api/admin/products`, `/api/admin/products/[id]`,
  `/api/admin/orders`, `/api/admin/orders/[id]/status`.
- **Sécurité** : `requireAdmin()` re-vérifie la session (401 non connecté, 403
  customer) ; layout admin redirige vers sign-in ou affiche un panneau 403
  explicite ; lien « Admin » dans l'en-tête uniquement si `role === admin`.
- **CRUD** : slug auto via `slugify` partagé (`src/shared/lib/slugify.ts`) ;
  collision slug → 409 ; suppression refusée (409 `PRODUCT_REFERENCED`) si le
  produit apparaît dans `order_items` (FK RESTRICT).
- **Commandes** : liste globale avec email/nom client ; changement de statut
  (pending|paid|fulfilled|failed|refunded) avec libellés FR.
- **Tests** : unit — schemas + garde admin ; intégration — CRUD, slug dupliqué,
  produit référencé, commandes + statut, 404.
- **Critères** : routes protégées côté serveur ; interface admin dédiée ; hors
  périmètre Slice 8 (pas de stats chiffrées).

## Slice 8 — Admin dashboard / stats (P1)

- **User story** : U9 — ventes, produits, commandes.
- **Fichiers** : `features/admin/dashboard/*`, requêtes d'agrégation.
- **Critères** : données réelles issues de la BDD (aucun chiffre inventé).

## Slice 9 — Qualité & accessibilité (P1)

- **Objectif** : état des tests e2e, accessibilité (navigation clavier, labels, contrastes, HTML sémantique), états loading/empty/error/success, responsive, Core Web Vitals.
- **Critères** : balances Lighthouse réellement mesurées (date/env/profil conservés), pas de score inventé.

## Slice 10 — Déploiement (P0)

- **Objectif** : Vercel + Neon + R2, migrations, seeds, CI/CD, monitoring.
- **Fichiers** : config déploiement, vars d'env prod, runbook.
- **Critères** : app publiquement déployée, webhook Stripe actif en test, checklist post-déploiement.

## Slice 11 — Portfolio / étude de cas (P0)

- **Objectif** : README complet, étude de cas, screenshots/GIF, texte LinkedIn & GitHub.
- **Critères** : lien Live Demo en tête, toutes sections du README obligatoire, aucune donnée inventée.

## Priorités résumées

- **P0** : Slices 0,1,2,3,4,5,7,10,11 (achat + admin + déploiement + portfolio)
- **P1** : Slices 6,8,9
- **P2** : i18n EN complet, abonnements, email, multi-format, multi-vendeurs, DRM.

## Risques transverses

- Réseau / versions non vérifiées à l'install → ré-vérifier et épingler.
- Webhooks Stripe en local → utiliser Stripe CLI (`stripe listen`).
- Fichiers volumineux → upload R2 côté serveur, jamais via client avec secret.
- Budget : garder les offres gratuites ; surveiller les quotas R2/Neon.
