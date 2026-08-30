# Architecture — Biblio

## 1. Vue générale
Modular monolith (default). Next.js 16 App Router, server-first. Architecture orientée
**features** (domain / application / infrastructure / ui). La base de données n'est jamais
touchée depuis le client ; toute mutation passe par Server Actions ou Route Handlers
avec validation et autorisation côté serveur.

### Diagramme de contexte (Mermaid)
```mermaid
graph LR
  subgraph Utilisateurs
    V[Visiteur]
    C[Client]
    A[Admin]
  end
  B[Biblio - Next.js 16]
  subgraph Externes
    S[Stripe]
    NE[(Neon Postgres)]
    R2[(R2 / S3 - fichiers)]
    EMAIL[Email (plus tard)]
  end
  V --> B
  C --> B
  A --> B
  B --> S
  S -->|webhooks signés| B
  B --> NE
  B --> R2
  B -.V2.-> EMAIL
```

### Diagramme des conteneurs (Mermaid)
```mermaid
graph TB
  subgraph "Web"
    U[UI React / RSC + Client Components]
  end
  subgraph "Application server (Next.js)"
    SRV[Server Actions & Route Handlers]
    AUTH[Better Auth]
    DOM[Domaine métier / features]
    PAI[Paiement - Stripe]
    DLB[Délivrance fichiers]
  end
  subgraph "Données"
    PG[(PostgreSQL)]
    OBJ[(R2 / S3)]
  end
  subgraph "Externe"
    STRIPE[Stripe API + webhooks]
  end
  U --> SRV
  SRV --> AUTH
  SRV --> DOM
  DOM --> PAI
  PAI --> STRIPE
  STRIPE -->|webhook| PAI
  DOM --> PG
  DOM --> DLB
  DLB --> OBJ
```

## 2. Responsabilités
- **features/authentication** : Better Auth (email/password), sessions, RBAC.
- **features/products** : catalogue, recherche, filtres, page produit (lecture publique).
- **features/cart** : panier persistant (BDD), ajout/retrait/quantité.
- **features/checkout** : création Stripe Checkout Session, gestion webhooks, idempotence.
- **features/entitlements** : droits d'accès + génération d'URL signées (downloaded links).
- **features/orders** : commandes, historique, statuts.
- **features/admin** : CRUD produits, dashboard, gestion commandes (rôle admin).
- **shared/** : UI, config, types, lib (validation, erreurs typées).
- **server/db** : schéma Drizzle + connexion + migrations.
- **infra/storage** : adaptateur R2/S3 (liens pré-signés).

## 3. Modèle de données (ERD)
```mermaid
erDiagram
  USER ||--o{ ORDER : passe
  USER ||--o{ ENTITLEMENT : possede
  USER ||--o{ CART_ITEM : contenait
  PRODUCT ||--o{ ORDER_ITEM : reference
  PRODUCT ||--o{ CART_ITEM : dans
  ORDER ||--o{ ORDER_ITEM : contient
  ORDER ||--o{ ENTITLEMENT : cree
  PRODUCT ||--o{ ENTITLEMENT : donne
  STRIPE_EVENT ||--o{ ORDER : traite

  USER { text id PK; text email UK; text name; text passwordHash; text role "customer|admin"; timestamp createdAt }
  PRODUCT { text id PK; text slug UK; text title; text description; text author; text genre; text language; text format "epub|pdf"; text coverUrl; text fileUrl; int priceInCents; boolean published; timestamp createdAt; timestamp updatedAt }
  CART_ITEM { text userId FK; text productId FK; int quantity; pk(userId, productId) }
  ORDER { text id PK; text userId FK; text status "pending|paid|fulfilled|failed|refunded"; int totalInCents; text currency; timestamp createdAt; timestamp paidAt }
  ORDER_ITEM { text orderId FK; text productId FK; text titleSnapshot; int priceInCents; text currency; pk(orderId, productId) }
  ENTITLEMENT { text id PK; text userId FK; text productId FK; text orderId FK; timestamp createdAt; timestamp expiresAt "null" }
  STRIPE_EVENT { text id PK; text stripeEventId UK; text type; timestamp processedAt }
```
> Champs montants toujours en **centimes** (int), jamais en float. Prix toujours relu côté serveur.

## 4. Contrats API

### Public (catalogue)
- `GET /api/products` → liste filtrée (query : `q`, `genre`, `price`, `page`). Validation Zod.
- `GET /api/products/[slug]` → détail.

### Auth (Better Auth)
- Routes gérées par Better Auth (`/api/auth/*`), session httpOnly cookie.

### Panier (session requise)
- `GET /api/cart`, `POST /api/cart` {productId, qty}, `PATCH /api/cart/[productId]`, `DELETE /api/cart/[productId]`.

### Checkout (session requise)
- `POST /api/checkout` → crée un Stripe Checkout Session (prix relu serveur), renvoie `url`.
- `POST /api/webhooks/stripe` → corps brut, vérif signature, traitement idempotent.

### Bibliothèque (session requise)
- `GET /api/me/library` → entités dont l'utilisateur a le droit.
- `POST /api/me/library/[productId]/download` → URL pré-signée (R2/S3) temporaire.

### Admin (session + rôle admin)
- `GET/POST /api/admin/products`, `PATCH/DELETE /api/admin/products/[id]`.
- `GET /api/admin/orders`, `GET /api/admin/stats`.

## 5. Authentification & autorisation
- **Better Auth** (email/password), session server-side httpOnly (pas de token dans le client).
- **RBAC** : `role` sur `user`. Middleware = UX (redirection). **La sécurité est re-vérifiée
  dans chaque Server Action / Route Handler** (jamais middleware seul — à la suite de CVE-2025-29927).
- Autorisation objet par objet (ex : bibliothèque filtrée par `userId`).

## 6. Sécurité — stratégie
- **Webhooks Stripe** : corps brut + `stripe.webhooks.constructEvent` (signature). 
- **Idempotence 2 couches** : `Idempotency-Key` à la création de session + table `stripe_events`
  avec `stripeEventId UNIQUE` (ON CONFLICT DO NOTHING) côté réception.
- Prix toujours relu depuis la BDD, jamais depuis le client.
- Validation **Zod** à toutes les frontières (publiques et privées).
- Erreurs typées ; aucun détail interne exposé (message générique en prod).
- Headers de sécurité, cookies httpOnly+secure+sameSite, CSRF géré par les Server Actions de Next.
- Secrets : uniquement côté serveur ; `.env.example` fourni ; `.env*` jamais commité.
- Rate limiting sur auth (plugin Better Auth) et download.

## 7. Cache & fraîcheur des données
- Catalogue : rendu serveur, cache revalidable (ISR) pour les listes publiques.
- Bibliothèque/panier : données propres à l'utilisateur → **pas de cache global partagé**.
- URLs signées : TTL court (ex : 15 min), régénérées à la demande.
- Pas de Redis : aucun besoin d'état distribué au MVP (modular monolith).

## 8. Traitement asynchrone
- Webhook : réponse 2xx rapide, traitement asynchrone. Pas de queue au MVP (Webhook léger et
  idempotent). Si les emails arrivant en V2 rendent le traitement lent, on introduira une queue.

## 9. Observabilité
- Logs structurés (JSON) sans PII. Suivi des erreurs via un service (Sentry ou équivalent) dès
  la phase déploiement. Métriques de checkout (webhooks reçus/échoués, taux d'entitlement créé).

## 10. Déploiement
- **Vercel** (Next 16) + **Neon** (Postgres 17) + **R2/S3** (fichiers). Secrets via vars d'env Vercel.
- CI GitHub Actions : lint, typecheck, tests, build. Migrations Drizzle versionnées, appliquées en CI/review.
- Rollback : re-déploiement d'une précédente version + migrations réversibles quand possible.

## 11. Structure de dossiers
```
src/
├── app/                      # App Router (routes)
├── features/
│   ├── authentication/       # Better Auth, RBAC
│   ├── products/             # catalogue, recherche
│   ├── cart/                 # panier persistant
│   ├── checkout/             # Stripe, webhooks, idempotence
│   ├── entitlements/         # droits + téléchargements
│   ├── orders/               # commandes
│   └── admin/                # back-office
├── shared/                   # ui, lib, config, types, utils
├── server/
│   ├── db/                   # Drizzle schéma + connexion
│   └── storage/              # adaptateur R2/S3
└── styles/
tests/{unit,integration,e2e}
docs/{architecture,adr,api}
```

## 12. Décisions structurantes
- `docs/adr/001-framework.md` · `002-database.md` · `003-authentication.md`
- `004-payments.md` · `005-deployment.md`
