# Local development — Biblio

> Everything about running the project locally. The README stays short on
> purpose (`docs/fix-plan.md` D-10); this is where the detail lives.

## ⚠️ Demo credentials — local only

| Role  | Email               | Password        |
| ----- | ------------------- | --------------- |
| Admin | `admin@biblio.test` | `Bibli0-Admin!` |

Create it with `npm run seed:admin`.

> **NEVER use this password in production.** `scripts/seed-admin.ts` refuses to
> run with the default password when `NODE_ENV=production` and requires
> `SEED_ADMIN_PASSWORD` there. Rotate immediately on any shared environment.

## Quickstart

```bash
cp .env.example .env   # DATABASE_URL, BETTER_AUTH_SECRET, STRIPE_*, STORAGE_*
npm install
npm run db:migrate     # fresh base / CI (see drizzle/meta note below)
npm run dev            # http://localhost:3000
```

> `drizzle/meta/` is versioned: `drizzle-kit migrate` needs it on a fresh
> clone/CI. If your base was created with `npm run db:push`, keep using
> `db:push` (don't re-run `db:migrate` — CREATE TABLEs would duplicate).

## Commands

| Command                                                        | Description                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------- |
| `npm run dev`                                                  | Dev server                                                    |
| `npm run build`                                                | Production build                                              |
| `npm run lint` / `npm run typecheck` / `npm run format:check`  | ESLint · TS strict · Prettier                                 |
| `npm run docs:check`                                           | Docs ↔ filesystem parity (architecture §11)                   |
| `npm run docs:lint`                                            | markdownlint (relaxed config, `.markdownlint-cli2.jsonc`)     |
| `npm run test:coverage`                                        | Tests + coverage floor on checkout/library (L5.3)             |
| `npm test`                                                     | Unit / integration (integration skips without `DATABASE_URL`) |
| `npm run test:e2e`                                             | Playwright end-to-end                                         |
| `npm run db:generate` / `db:migrate` / `db:push` / `db:studio` | Drizzle lifecycle                                             |
| `npm run seed:admin` / `seed:products` / `seed:all`            | Demo data                                                     |
| `npm run books:generate` / `books:validate` / `books:upload`   | Demo e-books (EPUB/PDF)                                       |
| `npm run storage:check`                                        | E2E storage test (upload → presign → 200)                     |
| `npm run storage:minio`                                        | MinIO local setup (server :9000, bucket, user, policy, data)  |
| `npm run import:gutenberg`                                     | Import public-domain catalogue (Gutendex)                     |
| `npm run payments:reconcile` / `stripe:reconcile`              | Manual reconciliation CLIs                                    |
| `npm run db:cleanup:tests`                                     | Clean test leftovers                                          |
| `npm run smoke`                                                | HTTP smoke: catalogue → cart → checkout → library → admin     |

## Storage (local demo — MinIO)

Files never pass through the app: the server returns **presigned SigV4 URLs**
(15 min) after verifying the purchase.

```bash
bash scripts/setup-minio.sh   # MinIO on :9000, bucket biblio, app user + policy
cp .env.example .env          # fill the STORAGE_* values shown
npm run storage:check         # upload → presign → 200, end to end
```

Production uses Cloudflare **R2** with the same `STORAGE_*` (add
`STORAGE_ACCOUNT_ID` instead of `STORAGE_ENDPOINT`) — no code change
(`docs/adr/006-storage.md`).

## Mass catalogue — Project Gutenberg (Gutendex)

Import ~500 popular public-domain works (Gutendex API, no key). After import the
site depends on **no external source**: metadata + EPUB + covers live in your
own DB and storage.

```bash
npm run db:push            # additive migration 0002 (source/license/…)
npm run seed:products      # 12 demo products converted to USD (single-currency shop)
npm run import:gutenberg   # 500 most popular books
```

`.env` knobs: `IMPORT_GUTENDEX_LIMIT`, `IMPORT_GUTENDEX_LANGUAGES`,
`IMPORT_PRICE_CENTS` (default 50 → $0.50), `IMPORT_PUBLISHED`,
`IMPORT_MIN_DOWNLOADS`, `GUTENDEX_BASE_URL` (self-hosted mirror).

Validated in real (2026-09-08): 500 imported, 0 failures, 512 products, 500 EPUB

- 500 covers in MinIO, integration tests 8/8 on Neon including presigned
  download → 200 → intact content. **Licence:** public-domain (US), recorded per
  product (`docs/adr/007-catalog-import.md`). Idempotent by `source + source_id`.
  **Never use** Z-Library / Anna's Archive / LibGen (pirated content).

## Admin back-office API (`/admin`, role `admin`)

401 if not signed in, **403** if role `customer`. Re-checked in every handler
(middleware is UX only).

- `GET/POST /api/admin/products`, `GET/PATCH/DELETE /api/admin/products/[id]`
- `GET /api/admin/orders`, `PATCH /api/admin/orders/[id]/status` (only manual
  transition: `paid → fulfilled`; payment statuses return 409
  `PAYMENT_STATUS_MANAGED_BY_STRIPE`)
- `POST /api/admin/orders/[id]/refund` (202 = request queued, not confirmed)
- `GET /api/admin/stats`, `GET /api/admin/payments/exceptions`

## Version checks

Versions in `STATUS.md` were verified 2026-08-30. At install time re-check:
`npm show <package> version` plus official docs (support/LTS).

## Operational notes

- **Never put a GitHub token in a `git push` URL** — tokens land in shell
  history and get swept by scanners. Use the credential helper or `gh auth login`.
- Playwright in CI: `npx playwright install --with-deps chromium`.
- Build fails without `DATABASE_URL` (by design, `src/server/db/index.ts`);
  use dummy values for smoke builds.
- `next/font/google` was replaced by system fonts — no build-time CDN dependency.
- Better Auth v1.7 quirks: route exposes `auth.handler` (not `auth.handlers`);
  `signUpEmail` throws (no `error` field); `account` table requires `issuer`.
