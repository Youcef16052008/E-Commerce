# Runbook de déploiement — Biblio (Slice 10)

**Cible : Vercel (Next 16) + Neon (Postgres 17) + Cloudflare R2 + Stripe (mode test).**

> **Statut (2026-09-08) : test/staging d’abord, aucun Stripe live.** Les migrations
> `0004`→`0007`, les intégrations PostgreSQL, les webhooks test et la réconciliation
> distante doivent être validés sur une base Arena/OAuth **isolée** avant toute
> préversion externe. Les credentials ne sont pas disponibles dans ce sandbox : aucun
> résultat de base réelle ou paiement Stripe test n’est inventé.

## Prérequis

- Compte Vercel (Hobby gratuit suffit), compte Neon (Free), compte Cloudflare
  (R2 Free : 10 Go), compte Stripe (mode test).
- Accès au repo GitHub `Youcef16052008/E-Commerce`.
- **Aucun secret dans le code, aucune URL de push avec token** (cf.
  `docs/project-state.md` — sécurité git).

---

## 1. Base de données de test isolée — obligatoire

1. Via Arena/OAuth, créer ou sélectionner une base PostgreSQL **jetable et non
   productive**. Ne jamais réutiliser une URL de développement, de préproduction
   partagée ou de production : les intégrations écrivent et nettoient leurs données.
2. Créer le fichier local ignoré par Git, sans jamais y copier de secret dans ce dépôt :

   ```bash
   cp .env.test.example .env.test
   # renseigner DATABASE_URL avec la base isolée et les valeurs Stripe TEST fournies par Arena
   npm ci
   npm run db:migrate:test
   npm run test:integration:test
   ```

3. Conserver les sorties de migration/test avec le run de staging. La migration est
   versionnée (`0000`→`0007`) ; **ne pas employer `db:push`** pour ce contrôle.
4. Vérifier avec `npm run db:studio:test` que les 12 tables attendues existent :
   `products`, `cart_items`, `orders`, `order_items`, `entitlements`, `refunds`,
   `stripe_events`, `stripe_sync_log` et les 4 tables Better Auth.
5. Seulement après ce contrôle, une base de préversion Vercel distincte peut recevoir
   la même procédure via `DATABASE_URL` et `npm run db:migrate`. Une production n’est
   pas autorisée par cette phase.

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
   `next build`). **Aucun `vercel.json` requis** (les headers de sécurité sont
   déclarés dans `next.config.ts` et appliqués par Next au build ; le webhook
   est appelé directement sur son path par Stripe).
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
   > Les clés `sk_live_` / `rk_live_` sont refusées par le code : ne renseigner
   > qu’un compte Stripe test dans tous les environnements de cette phase.

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
   - Événements (les 7 consommés par l'app) :
     - **`checkout.session.completed`**
     - **`checkout.session.async_payment_succeeded`** (paiements à notification
       différée — virement, SEPA… : c'est lui qui déclenche la livraison)
     - **`checkout.session.async_payment_failed`** (commande → `failed`)
     - **`checkout.session.expired`** (libère le fingerprint de checkout afin
       qu'un panier expiré puisse démarrer une nouvelle intention)
     - **`refund.created`**, **`refund.updated`**, **`refund.failed`** (un remboursement est confirmé, reste pending ou échoue ; seul le succès révoque l'entitlement)
4. Le webhook lit le **corps brut** (`request.text()` avant
   `stripe.webhooks.constructEvent`) — signature vérifiée avant tout
   traitement ; le traitement est **attendu avant la réponse** (500 en cas
   d'erreur → Stripe réessaie avec backoff) ; idempotence 2 couches
   (`Idempotency-Key` + `stripe_events.stripe_event_id` UNIQUE) ; livraison
   atomique (transaction : `paid` + entitlements + panier). Garde-fous :
   `payment_status === "paid"` exigé, session Stripe et montant/devise Stripe
   comparés à la commande. L'insertion de `stripe_events` est dans la même
   transaction que `paid` + entitlements + panier ciblé : une erreur retourne
   500 et Stripe peut rejouer l'événement sans perdre la délivrance.
5. Tester en réel : achat test complet (`4242 4242 4242 4242`, date future,
   CVC quelconque) → la commande passe `paid` (« Payée »), l'entitlement est
   créé, le téléchargement est disponible dans la bibliothèque.
6. Tester le remboursement **uniquement en mode test** : depuis une commande `paid` ou `fulfilled`, demander le remboursement dans `/admin/orders`. Vérifier dans le Dashboard Stripe test qu'un seul Refund est créé, que la commande affiche d'abord `Remboursement en cours`, puis `Remboursée` seulement après le webhook et que l'ouvrage disparaît alors de la bibliothèque. Un timeout/une erreur d'API laisse la commande en attente : ne pas recliquer ; investiguer d'abord dans Stripe et `/admin/payments`.
7. Exécuter ensuite les deux réconciliations avec cette même base/test account :

   ```bash
   npm run payments:reconcile -- --strict
   npm run stripe:reconcile -- --limit 25 --strict
   ```

   Un seul séparateur `--` est requis par npm, y compris avec npm 12 : les arguments
   suivants sont transmis au script. Ne pas ajouter un second `--` (`-- -- --strict`),
   qui deviendrait un argument inconnu de la CLI. Ne pas lancer `npx tsx
scripts/reconcile-stripe.ts` directement : ce chemin contourne le chargeur
   obligatoire `.env.test`.

   La première examine uniquement les invariants Biblio. La seconde lit les Payment
   Intents/refunds Stripe test persistés et écrit seulement une trace non financière
   dans `stripe_sync_log`. Un résultat non vide doit être investigué dans Stripe et
   `/admin/payments` ; ne jamais modifier manuellement un statut financier ou
   accorder/révoquer un droit depuis une réconciliation.

8. Conserver le `runId` affiché par `stripe:reconcile`, les IDs d’événements webhook
   et les résultats de test dans le dossier de validation staging.

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
      4242…) : commande `Payée` dans `/orders`, ouvrage téléchargeable dans
      `/library` (URL pré-signée R2 → 200, contenu intact).
- [ ] **Headers de sécurité** servis par le serveur (`curl -I https://<slug>` :
      `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
      `Referrer-Policy`, `Strict-Transport-Security`,
      `Cross-Origin-Resource-Policy`).
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
  (`0000`→`0007`, aucune DROP/ALTER destructif). La migration `0007` ajoute un
  trigger append-only à `stripe_sync_log` : ne pas tenter de purger ce journal par
  SQL applicatif. La base de cette phase est jetable ; pour une migration future
  destructive, prévoir le down SQL correspondant dans le journal (drizzle-kit)
  **avant** de la fusionner.
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
