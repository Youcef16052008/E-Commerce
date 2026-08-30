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

## Slice 5 — Bibliothèque & téléchargement (P0)

- **User story** : U7 — accès au fichier acheté.
- **Fichiers** : `features/entitlements/*`, adaptateur R2/S3 (URL pré-signée).
- **Tests** : unit (résolution entitlement), intégration (accès refusé sans droit), e2e.
- **Critères** : seul le propriétaire accède ; URL à TTL court ; même produit → un seul entitlement.

## Slice 6 — Orders (P1)

- **User story** : U7 — historique des commandes, statuts.
- **Fichiers** : `features/orders/*`, page "mes commandes".
- **Critères** : statuts cohérents avec le paiement.

## Slice 7 — Admin (P0/P1)

- **User story** : U8, U10 — CRUD produits, gestion commandes.
- **Fichiers** : `features/admin/*`, dashboard.
- **Tests** : autorisation (admin vs client → 403), CRUD, validation.
- **Critères** : routes protégées côté serveur ; interface admin dédiée.

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
