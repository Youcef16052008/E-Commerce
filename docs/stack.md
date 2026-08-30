# Sélection de la stack (vérifiée le 2026-08-30)

> Principe : choisir la version **stable, maintenue, sécurisée, compatible** —
> jamais "la plus nouvelle" pour la forme. Ré-vérifier avec `npm show <pkg> version`
> et les docs officielles **au moment de l'installation** (les patchs évoluent vite).

## Matrice de décision

| Couche            | Candidats                          | Choix                      | Version vérifiée | Statut                  | Pourquoi (résumé)                                          | Risques |
|-------------------|------------------------------------|----------------------------|------------------|-------------------------|------------------------------------------------------------|---------|
| Framework         | Next.js 16 · 15 · Nuxt/SvelteKit   | **Next.js 16**              | 16.3.x (patches courants) | Active LTS     | SSR + full-stack, App Router, Turbopack, React 19.2, SEO.   | 15 part en EOL oct-2026 → ne pas démarrer dessus. |
| Runtime           | Node 24 · 22 · 26                  | **Node.js 24**              | 24.x           | **Active LTS** | Support jusqu'au 30 avr 2028. 26 = Current (pas LTS avant oct 2026). | 26 non-LTS → écarté pour prod. |
| UI framework      | React 19.2 · 19.1 (Canary écarté)  | **React 19.2**              | 19.2.8         | Stable         | Version appariée à Next 16. Canary jamais pour la prod.     | — |
| CSS               | Tailwind 4.3 · 3.4                 | **Tailwind CSS 4.3**        | 4.3.3          | Stable         | Design system, intégration Next officielle, perf build.     | 4.2 EOL ; plugins à mettre à jour. |
| Base de données   | PostgreSQL 17 · 16                 | **PostgreSQL 17**           | 17             | Stable         | Relationnel, JSONB, transactions solides pour les ventes.   | Utiliser l'offre serverless gratuite. |
| ORM / SQL         | Drizzle · Prisma 7                 | **Drizzle**                 | 0.45.x         | Stable         | Contrôle SQL explicite, bundle ~57KB, natif Neon/Edge, pas de codegen, 100% OSS. | Pre-1.0 → épingler les versions. |
| Validation        | Zod · valibot                      | **Zod**                     | 4.5.x          | Stable         | Dé-facto, bonne DX, partagé client/serveur. V4 est la version courante. | — |
| Auth              | Better Auth · Auth.js · Clerk      | **Better Auth**             | 1.6.x          | Stable         | TypeScript-first, self-hosted, plugins (RBAC, 2FA), successeur d'Auth.js. | Auth.js = maintenance seule → à éviter pour un nouveau projet. |
| Paiements         | Stripe Checkout (Session)          | **Stripe Checkout Sessions**| API récente à confirmer | Stable | Hébergé, idempotent, webhooks signés.                         | Ré-vérifier la version d'API exacte à l'init. |
| Tests unit/integ  | Vitest · Jest                      | **Vitest**                  | 4.1.x          | Stable         | Rapide, natif ESM/TS, compatible Next/drizzle.              | — |
| Tests e2e         | Playwright · Cypress               | **Playwright**              | 1.60+          | Stable         | Multi-navigateurs, trace viewer, excellent pour le parcours achat. | Pinner la version en CI. |
| Stockage fichiers | S3 (Cloudflare R2 Free · S3) · FS  | **R2 / S3 compatible**      | —              | Stable         | Fichiers e-books hors du serveur ; liens pré-signés.        | Config bucket + CORS. |
| Déploiement       | Vercel (gratuit) · Docker          | **Vercel + Neon**           | —              | Stable         | Zero-ops pour Next 16, gratuit, serverless.                 | Limites gratuites ; surveiller. |

## Alternatives rejetées (et pourquoi)

- **Next.js 15 (LTS Maintenance)** : EOL prévue oct 2026. Pour un nouveau projet, on ne démarre pas sur une ligne qui s'éteint.
- **Node.js 26 (Current)** : pas encore LTS (LTS en oct 2026). Aucun intérêt de prod → écarté.
- **React 19 Canary / 20 beta** : canary = jamais en prod.
- **Prisma 7** : excellent, mais Drizzle offre un contrôle SQL plus fin, un bundle bien plus léger et une intégration Edge/Neon native, sans build step. Prisma garde l'avantage sur Studio/migrations opinionnées → si tu préfères le schema-first et la maturité migration, on bascule (décision réversible, isolée derrière la couche `db/`).
- **Auth.js / NextAuth v5** : en maintenance (repris par Better Auth). Non recommandé pour un nouveau projet.
- **Supabase Auth** : bon, mais ajoute une dépendance plateforme ; Better Auth garde tout en TS + Postgres, plus démonstratif du niveau senior.

## Décisions structurantes → ADR

`docs/adr/001-framework.md` (Next 16), `002-database.md` (Postgres 17 + Drizzle),
`003-authentication.md` (Better Auth), `004-payments.md` (Stripe, idempotence 2 couches),
`005-deployment.md` (Vercel + Neon + R2/S3). *(À rédiger formellement à la phase 4.)*

## Stratégie de mise à jour

- Lockfile commité ; versions **épinglées** (pas de `latest` flottant).
- Mise à jour de sécurité si CVE ; sinon rester sur la ligne stable.
- Ré-évaluer la ligne Node 24 → 26 **après** sa bascule LTS (oct 2026).
