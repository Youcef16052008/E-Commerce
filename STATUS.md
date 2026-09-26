# STATUS — Biblio

> **Single source of truth for project status.** Anything that disagrees with
> this file is wrong. Absorbs `docs/project-state.md`, `docs/implementation-plan.md`
> and `docs/stack.md` (removed 2026-09-25 — see `docs/fix-plan.md` D-03).
> Rule: every claim names **date · environment · command**. No live result is
> inferred.

**Updated:** 2026-09-25 · **HEAD:** `ddb44a9` · **Live URL:** none yet (Lot 4,
`docs/runbook-deploy.md`) · **Work queue:** [`docs/fix-plan.md`](docs/fix-plan.md)

## Slices

| Slice                       | Scope                                              | Status                 |
| --------------------------- | -------------------------------------------------- | ---------------------- |
| 0 — Fondations              | Next 16 · TS strict · Tailwind · Drizzle · CI      | ✅ Done                |
| 1 — Authentication          | Better Auth, RBAC, seed admin                      | ✅ Done                |
| 2 — Catalogue public        | recherche/filtres/SEO, API                         | ✅ Done                |
| 3 — Panier                  | BDD, quantité = 1, prix relus serveur              | ✅ Done                |
| 4 — Checkout Stripe         | session, webhook signé, idempotence 2 couches      | ✅ Done                |
| 5 — Bibliothèque / fichiers | entitlements, URLs pré-signées 15 min              | ✅ Done                |
| 6 — Commandes               | historique, machine à états                        | ✅ Done                |
| 7 — Admin                   | CRUD produits, commandes, 401/403                  | ✅ Done                |
| 8 — Dashboard admin         | agrégations SQL réelles, zéro N+1                  | ✅ Done                |
| 9 — Qualité / accessibilité | a11y AA, Lighthouse mesuré, e2e admin              | ✅ Done                |
| 10 — Déploiement            | runbook + config **prêts** ; **exécution à faire** | 🔄 Blocked on accounts |
| 11 — Étude de cas portfolio | screenshots, texte, lien live                      | ⬜ Todo (Lot 3–4)      |

External audit (Sheet Set A, 13 defects) → **all tracked in
[`docs/fix-plan.md`](docs/fix-plan.md)**, Lot 1–6. Repo hygiene defects
(D-03/04/08/09/10/12/13) closed 2026-09-25.

## Validation ledger — what actually ran

| Date       | Environment                                                | What ran                                                                                                                                                        | Result                                                                                                                                                    |
| ---------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-31 | Local Postgres 17                                          | `db:migrate` + seeds, slices 1–5 paths                                                                                                                          | ✅ verified in real                                                                                                                                       |
| 2026-09-01 | Local, LH 13.4.1 mobile                                    | Lighthouse `/` `/products` `/auth/sign-in`                                                                                                                      | ✅ 99/100/100/100, 100/100/100/100, 100/…, CLS 0 (`docs/lighthouse.md`)                                                                                   |
| 2026-09-05 | Local `next build`+`start`                                 | pre-deploy smoke (routes 200/307/401, 5 security headers)                                                                                                       | ✅ local only, not prod                                                                                                                                   |
| 2026-09-05 | CI (GitHub Actions, Node 24, postgres:17)                  | format→lint→typecheck→migrate→seed→unit/integration→build→e2e                                                                                                   | ✅ green, e2e 8/8 (13.2 s, no flaky)                                                                                                                      |
| 2026-09-08 | Windows + Neon + MinIO                                     | `import:gutenberg` 500 books, 0 fail · `storage:check` 200 + SHA-256 intact · `test:integration` 8/8                                                            | ✅ validated in real                                                                                                                                      |
| 2026-09-25 | This session, sandbox Node 22                              | `format:check` · `typecheck` · `docs:check` (new)                                                                                                               | ✅ green                                                                                                                                                  |
| 2026-09-25 | Local dev `:3000` + PG 17 (L4.1 script)                    | `npm run smoke` — 16-step HTTP chain (catalogue→cart→checkout→library→download→admin)                                                                           | ✅ 15 passed · 0 failed · 1 skipped (checkout: no Stripe keys here ⇒ SKIP, FAIL under `SMOKE_REQUIRE_STRIPE=1`) · owner path via local paid-order fixture |
| 2026-09-26 | This session, sandbox Node 22                              | L5.1 (re-done after re-clone loss) `format:check` · `lint` · `typecheck` · `vitest` · `docs:check` · `next build` · seed guard                                  | ✅ 140 passed / 49 skipped (27 files, +18 mail tests) · docs 36 paths · build ✓ · `NODE_ENV=production seed-admin` exit 1                                 |
| 2026-09-26 | Sandbox Node 22 + embedded PG 17 `:5433` + dev `:3000`     | L5.2 GDPR: `vitest` (unit + `tests/integration/account.test.ts` with `DATABASE_URL`) · curl chain `/legal` `/account` `/api/me/export` `DELETE /api/me/account` | ✅ 4/4 integration · HTTP 200/307/401/401 → sign-up → export 200 (attachment) → 400 bad phrase → 200 `mode:hard` → export 401                             |
| 2026-09-26 | Sandbox Node 22 + embedded PG 17 (seeded)                  | L5.3 `npm run test:coverage` (thresholds checkout/library) · trial at 99 % to prove the gate fails                                                              | ✅ 204 passed / 1 skipped · floor exit 0 · trial exit 1 (`Coverage for lines (84.24%) does not meet … threshold (99%)`)                                   |
| 2026-09-26 | This session (docs only)                                   | L5.4 ADR-008/009/010 written · `format:check` · `docs:check`                                                                                                    | ✅ 3 ADRs, architecture §12 + runbook §3 pre-live checklist updated                                                                                       |
| 2026-09-26 | This session                                               | L5.5 `npx markdownlint-cli2` baseline (709 errors) → relaxed config → `npm run docs:lint` · injected bare-URL trial                                             | ✅ real tree exit 0 · trial exit 1 (`MD034/no-bare-urls`)                                                                                                 |
| 2026-09-26 | Sandbox Node 22 + embedded PG 17 (seeded)                  | L6.1 `db:migrate` (0008) · `vitest` outbox unit+integration · `npm run outbox:drain` · cron route 503/401/200                                                   | ✅ 3 jobs done; reconcile rows open/closed; receipts + refund notices journalised in `mail_log` (console provider); second pass idempotent                |
| 2026-09-26 | Sandbox Node 22 + embedded PG 17 (fresh migrate 0000→0009) | L6.2 FTS: `vitest` search unit+integration · `EXPLAIN` with `enable_seqscan=off`                                                                                | ✅ 10/10 · `Bitmap Index Scan on products_search_vector_idx`                                                                                              |
| 2026-09-26 | Sandbox Node 22 + PG 17 + dev `:3000` (admin session)      | L6.3 `vitest` csv unit + admin-bulk integration · curl: bulk/export/import anon, export, import dry-run/apply, bulk publish                                     | ✅ 12/12 · 401/401/401 · export 200 (12 rows, BOM) · `created:1` · `updated:1` · `published = True`                                                       |
| —          | **Not run**                                                | isolated-PG integration of phase-1 migrations (`db:migrate:test`), full Stripe test buy+refund round-trip                                                       | ⬜ prerequisite before any live decision (Lot 4)                                                                                                          |
| —          | **No URL**                                                 | deploy, live smoke, Lighthouse-on-prod                                                                                                                          | ⬜ Lot 4                                                                                                                                                  |

## Stack (versions re-verified 2026-08-30; re-check `npm show <pkg> version` at install)

| Layer             | Choice                | Installed                                                                  |
| ----------------- | --------------------- | -------------------------------------------------------------------------- |
| Framework         | Next.js               | **16.3.3**                                                                 |
| Runtime           | Node.js               | **24** (CI) / 22 in some sandboxes                                         |
| UI / CSS          | React · Tailwind CSS  | **19.2.8** · **4.3.3**                                                     |
| DB / ORM          | PostgreSQL · Drizzle  | **17** (Neon) · **0.45.2** / kit 0.31.10                                   |
| Auth / Validation | Better Auth · Zod     | **1.7.2** · **4.5.4**                                                      |
| Payments          | Stripe Checkout       | **22.6.0** — **test mode, locked by code** (`sk_live_`/`rk_live_` refused) |
| Storage           | AWS SDK S3 (R2/MinIO) | **3.1121.x**                                                               |
| Tests             | Vitest · Playwright   | **4.1.11** · **1.62.1**                                                    |

Decision matrix and rejected alternatives were folded from `docs/stack.md`
into [`docs/fix-plan.md` history](docs/fix-plan.md); structured decisions live
in [`docs/adr/`](docs/adr/).

## Conventions

TS strict, no unjustified `any`. Prices in integer cents, always re-read server-side.
Zod at every boundary. Typed errors. Server-only secrets. Payment statuses are
Stripe's authority (`paid → fulfilled` is the only manual transition).

## Known issues / open risks

- **Deploy not executed** (accounts: Vercel, Neon, R2, Stripe test) — the one
  blocker; everything else in the audit is secondary (`docs/fix-plan.md` Lot 4).
- Isolated-PG validation of phase-1 migrations + full Stripe test round-trip
  still to run (table above).
- `esbuild` moderate dev-only vuln via `drizzle-kit`; no runtime impact,
  breaking downgrade → re-evaluate, don't force.
- No transactional email (D-05) · no GDPR deletion/export (D-06) ·
  no scheduled reconciliation (D-11) — Lots 5–6.
- Demo books are one-page "Exemplaire de démonstration" files while priced —
  must be labelled as demo or replaced before anything resembling real selling
  (Gutenberg import provides the real catalogue).

## Next action

Execute **Lot 1 → Lot 4** of [`docs/fix-plan.md`](docs/fix-plan.md), in order.
