# Runbook de déploiement — Biblio (Slice 10)

**Cible : Vercel (Next 16) + Neon (Postgres 17) + Cloudflare R2 + Stripe (mode test).**

> **Statut (2026-09-01) : config + procédure prêtes, déploiement À FAIRE.**
> Les credentials Vercel/Neon/R2 ne sont pas disponibles dans le sandbox Arena —
> chaque étape du § Post-deploy est donc marquée « à faire ». Rien n'est
> inventé : aucune URL live, aucun résultat de smoke test fictif.

## Prérequis

- Compte Vercel (Hobby gratuit suffit), compte Neon (Free), compte Cloudflare
  (R2 Free : 10 Go), compte Stripe (mode test).
- Accès au repo GitHub `Youcef16052008/E-Commerce`.
- **Aucun secret dans le code, aucune URL de push avec token** (cf.
  `docs/project-state.md` — sécurité git).

---

## 1. Base de données — Neon

1. Console Neon → nouveau projet (ou réutiliser `fragrant-bonus-35221703`).
2. Utiliser la **branche `production`** (les previews Vercel pourront créer des
   branches éphémères si besoin, plus tard).
3. Copier la connection string → `DATABASE_URL` (Vercel, scopes Production +
   Preview). Ajouter `?sslmode=require` si absent.
4. Appliquer les migrations **depuis une machine avec le repo** (pas de
   `db:push` en prod — le journal `drizzle/meta` est versionné et complet) :

   ```bash
   cp .env.example .env   # renseigner UNIQUEMENT DATABASE_URL
   npm ci
   npm run db:migrate     # drizzle-kit migrate → journal + snapshots
   ```

5. Vérifier : `npm run db:studio` → 10 tables (`products`, `cart_items`,
   `orders`, `order_items`, `entitlements`, `stripe_events` + 4 tables auth).

## 2. Stockage — Cloudflare R2

1. Console R2 → créer le bucket **`biblio`** (région auto).
2. R2 → « Manage R2 API Tokens » → nouveau token **« Object Read & Write »** →
   noter `STORAGE_ACCESS_KEY_ID` + `STORAGE_SECRET_ACCESS_KEY`.
3. Noter l'**Account ID** (API tokens page) → `STORAGE_ACCOUNT_ID`.
4. **Upload des fichiers HORS request path** (jamais dans le code, jamais via
   le client) — depuis une machine avec les `STORAGE_*` posées :

   ```bash
   npm run books:validate     # valide les 12 EPUB/PDF de démo (books/)
   npm run books:upload       # upload + mappe products.file_url = s3://biblio/…
   # catalogue de masse (optionnel, ~500 œuvres Gutenberg) :
   npm run import:gutenberg
   ```

5. Vérification bout en bout :

   ```bash
   npm run storage:check      # upload test → URL pré-signée → GET 200 → SHA-256
   ```

   L'endpoint R2 est déduit : `https://<STORAGE_ACCOUNT_ID>.r2.cloudflarestorage.com`
   (path-style, `STORAGE_FORCE_PATH_STYLE=true` — même code que MinIO local,
   cf. ADR-006).

## 3. Vercel

1. Vercel → « Add New… » → **Project** → importer le repo GitHub.
2. Framework détecté : **Next.js** (ne rien modifier dans la build command :
   `next build`). **Aucun `vercel.json` requis** (pas de rewrite/headers custom
   au MVP — le webhook est appelé directement sur son path par Stripe).
3. **Environment Variables** (Project → Settings → Environment Variables) sur
   les scopes **Production + Preview** :

   | Variable                    | Valeur                                                                        |
   | --------------------------- | ----------------------------------------------------------------------------- |
   | `DATABASE_URL`              | connection string Neon (branche `production`)                                 |
   | `BETTER_AUTH_SECRET`        | `openssl rand -base64 32` (nouveau, prod)                                     |
   | `BETTER_AUTH_URL`           | **l'URL HTTPS publique** (ex. `https://<slug>.vercel.app`) — CRITIQUE cookies |
   | `STRIPE_SECRET_KEY`         | `sk_test_…` (mode test)                                                       |
   | `STRIPE_WEBHOOK_SECRET`     | `whsec_…` (après l'étape 4)                                                   |
   | `STRIPE_TAX_CODE`           | vide (Managed Payments désactivé)                                             |
   | `STORAGE_ACCOUNT_ID`        | ID compte R2                                                                  |
   | `STORAGE_ACCESS_KEY_ID`     | key id du token                                                               |
   | `STORAGE_SECRET_ACCESS_KEY` | secret du token                                                               |
   | `STORAGE_BUCKET`            | `biblio`                                                                      |
   | `STORAGE_REGION`            | `auto`                                                                        |
   | `STORAGE_FORCE_PATH_STYLE`  | `true`                                                                        |

   > ⚠️ Si `BETTER_AUTH_URL` n'est pas l'URL https publique, la session est
   > émise sur le mauvais domaine → « déconnecté » permanent.

4. **Deployment protection** (option conseillé) : les previews restent
   publiques mais peuvent être protégées par password (Vercel → Deployments).
5. Déployer `main` → Vercel fait `npm ci && next build && start`
   (Node version : laisser la détectée ou pin `24.x` dans Vercel →
   Project → Settings → General → Node.js Version).
6. Le deploy automatique à chaque push sur `main` est le comportement Vercel
   standard — **aucun nouveau workflow GitHub requis** (le CI existant
   `.github/workflows/ci.yml` reste la porte de qualité avant merge).

## 4. Stripe — webhook de test

1. Installer la CLI Stripe (`stripe login` avec le compte test).
2. Depuis le terminal :

   ```bash
   stripe listen --forward-to https://<slug>.vercel.app/api/webhooks/stripe
   ```

   → la CLI affiche `Webhook signing secret: whsec_…` → copier dans Vercel
   (`STRIPE_WEBHOOK_SECRET`).

3. Dashboard Stripe (test) → **Developers → Webhooks → Add endpoint** :
   - URL : `https://<slug>.vercel.app/api/webhooks/stripe`
   - Event : **`checkout.session.completed`** (le seul consommé)
4. Le webhook lit le **corps brut** (route Next `export const runtime`
   par défaut node, `request.text()` avant `stripe.webhooks.constructEvent`) —
   signature vérifiée avant tout traitement ; idempotence 2 couches
   (`Idempotency-Key` + `stripe_events.stripe_event_id` UNIQUE).
5. Tester en réel : achat test complet (`4242 4242 4242 4242`, date future,
   CVC quelconque) → la commande passe `paid`/`fulfilled`, l'entitlement est
   créé, le téléchargement est disponible dans la bibliothèque.

## 5. Admin — mot de passe fort one-shot

1. **Après** le deploy (variables en place) :

   ```bash
   SEED_ADMIN_EMAIL="votre-email@domaine.fr" \
   SEED_ADMIN_PASSWORD="$(openssl rand -base64 18)" \
   npm run seed:admin
   ```

   (script idempotent : crée via l'API Better Auth + élève le rôle `admin`.)

2. **Changer immédiatement** le mot de passe après la première connexion
   (meilleure pratique — le mot de passe généré a transité par terminal/env).
3. Ne JAMAIS réutiliser le mot de passe démo `Bibli0-Admin!` en production.

## 6. Smoke checklist (post-deploy)

À exécuter sur l'URL publique après le deploy `main` :

- [ ] `/` — accueil rendu (200), identité Biblio, lien catalogue.
- [ ] Auth — sign-up → connecté (nom dans l'en-tête) → déconnexion →
      re-connexion (les 3 étapes doivent fonctionner sur le domaine https).
- [ ] Catalogue — liste des ouvrages, recherche/filtres, fiche produit.
- [ ] Panier → **checkout → webhook → entitlement → download** (achat test
      4242…) : commande `Livrée` dans `/orders`, ouvrage téléchargeable dans
      `/library` (URL pré-signée R2 → 200, contenu intact).
- [ ] Admin — compte non admin : `/admin` → panneau **403** et
      `GET /api/admin/stats` → **403** ; compte admin : `/admin` → **200** avec
      les **stats réelles** (produits/commandes/revenu/clients cohérents avec
      la base) et `GET /api/admin/stats` → **200** JSON.
- [ ] Aucun secret côté client : aucun `sk_test_`, `whsec_`, `BETTER_AUTH_SECRET`
      ou connection string dans le HTML/JS servi (inspecter les sources +
      `Network`).
- [ ] (Option) relancer **Lighthouse** sur l'URL publique (`docs/lighthouse.md`
      — même commande, + profil desktop) pour les scores « prod ».

## 7. Rollback

- **App** : Vercel → Deployments → cliquer sur un deployment antérieur →
  « Promote to Production » (redeploy instantané, ~1 min).
- **Base** : les migrations Drizzle de ce projet sont **additives**
  (`0000`→`0003`, aucune DROP/ALTER destructif) — aucun rollback SQL nécessaire
  au MVP ; en cas de migration future destructive, prévoir le down SQL
  correspondant dans le journal (drizzle-kit) AVANT de la fusionner.
- **R2** : supprimer un object ne casse rien (404 typé si l'ouvrage n'existe
  plus) ; re-upload via `books:upload` / `import:gutenberg`.

---

## Post-deploy — état (2026-09-01)

| Étape                              | État                                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1. Neon + `db:migrate`             | **à faire** (base Neon existante `fragrant-bonus-35221703` déjà migrée + seedée lors des Slices 0-7 — à re-vérifier au deploy) |
| 2. R2 + upload livres              | **à faire** (bucket + token + upload)                                                                                          |
| 3. Vercel + env Production/Preview | **à faire** (import repo + variables)                                                                                          |
| 4. Webhook Stripe test             | **à faire** (`stripe listen` + endpoint)                                                                                       |
| 5. Seed admin mdp fort one-shot    | **à faire** (après deploy)                                                                                                     |
| 6. Smoke checklist                 | **à faire** (aucun résultat réel — rien d'inventé)                                                                             |
| 7. Procédure de rollback           | documentée ci-dessus (pas encore exercée)                                                                                      |

> Dès que le déploiement réel est fait : remplir ce tableau avec les **résultats
> réels** (URL, dates, scores Lighthouse prod) et passer l'ADR-005 en
> **Adopté** (critère : URL live réelle).
