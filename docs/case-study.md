# Case study — Biblio, a digital-goods store where the money path is the product

_Portfolio write-up (fix-plan L6.5, product slice 11). Every number below names
its evidence; nothing is projected. Language: English, because the audience is a
hiring panel; the code and the ADRs it links to are in French._

## 1. The problem I chose

Most "e-commerce demo" repositories stop at a cart. The hard part of selling
e-books is not the cart — it is **never delivering a file that was not paid
for, never charging twice, and being able to prove both**. Biblio was built to
demonstrate that narrow, senior-level slice: Stripe Checkout → signed webhook →
order state machine → entitlement → pre-signed download, with refunds that
revoke the right they refund.

Constraints I set on day one and kept (see `docs/fix-plan.md`, header):

- **No new infrastructure.** No Redis, no queue, no event bus. Everything runs
  on Postgres + one Next.js deployment + a daily cron.
- **The payment core is frozen** once it is tested: every later fix goes around
  it, never through it.
- **No unevidenced claims.** Each "done" line in the plan and each row in
  `STATUS.md` names a date, an environment and the command that ran.

## 2. Decisions, in the order they mattered

| ADR                                            | Decision                                                                                                                                                                                        | Why this and not the obvious alternative                                                                                                                                       |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [ADR-004](adr/004-payments.md) Payments        | Stripe Checkout Sessions; **signed webhooks are the only source of truth**; two idempotency layers (cart fingerprint → pending order → Stripe `Idempotency-Key`, plus a `stripe_events` table). | The success page is a hint, not a fact. A retried webhook or a double-clicked "Pay" must be a no-op, and the test suite has to be able to prove it.                            |
| [ADR-006](adr/006-storage.md) Storage          | S3-compatible adapter (MinIO locally, R2 in production), **15-minute query-string pre-signed URLs**, issued only after an entitlement check.                                                    | The file must never be reachable by URL guessing. One code path for dev and prod removes an entire class of "works on my machine".                                             |
| [ADR-008](adr/008-partial-refunds.md) Refunds  | **No partial refunds in phase 1**; free-amount refunds rejected permanently; per-line refund is the only acceptable extension.                                                                  | The invariant "a revoked right ⇔ a returned amount" is what makes reconciliation and the state machine simple. A goodwill gesture belongs in a coupon, not in a Stripe refund. |
| [ADR-009](adr/009-vat-and-tax-status.md) VAT   | Test mode collects no tax and says so on `/legal`; going live is **blocked** until one of three fiscal set-ups is chosen and checked in the deploy runbook.                                     | Guessing a tax regime is worse than declaring the question open. The blocker is written where the operator will actually read it.                                              |
| [ADR-010](adr/010-transactional-email.md) Mail | Env-selected adapter (`console` default, Resend/Postmark/SES), pure templates, **sent by pulling from an outbox** — the webhook handler was not touched.                                        | Sending mail inside a webhook couples delivery to a third party's latency. Pulling from persisted rows keeps the core frozen and makes retries trivial.                        |

Rejected proposals are recorded too: the audit's folder renames
(`library → entitlements`, `server → platform`) were **not** adopted; only its
dependency rule was, as a lint rule (§4).

## 3. What "reliability without infrastructure" looks like

- **Outbox on Postgres** (`outbox_jobs`, `mail_log`, `payment_exception_rows`,
  migration `0008`). A daily Vercel cron hits `GET /api/cron/outbox` with a
  bearer secret; the same drain runs locally as `npm run outbox:drain`. Receipts
  and refund notices are enqueued by reading order state — not by adding code to
  the webhook. Evidence: 6 unit + 3 integration tests; cron route answers
  503 (unconfigured) / 401 (bad token) / 200.
- **Admin payment exceptions** are a view over persisted rows, so a reviewer
  sees the same list after a redeploy.
- **Search** is Postgres full-text search, not a SaaS: `unaccent` behind an
  `IMMUTABLE` wrapper, a generated weighted `tsvector` column and a GIN index
  (migration `0009`); the query builder neutralises `tsquery` operators from
  user input. Evidence: `EXPLAIN` with `enable_seqscan = off` →
  `Bitmap Index Scan on products_search_vector_idx`; 10 tests cover
  accent-insensitivity both ways, prefix, AND semantics and hostile input.
- **Admin bulk operations** (publish/unpublish, CSV export, CSV import) upsert
  by slug, default to **dry-run**, and refuse the whole file if one row is
  invalid — the same all-or-nothing posture as the payment path.

## 4. Guard-rails that stay on after I leave

| Guard                         | Where                                             | What it stops                                                                                                                                                     |
| ----------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coverage floor on money paths | `vitest.config.mts`, CI `test:coverage`           | `checkout` and `library` (entitlements) below 70 % lines/statements/functions (branches 65 % / 70 %) fail the build. Measured: checkout L 84 %, B 70 %.           |
| Docs parity                   | `scripts/check-docs.ts` (`npm run docs:check`)    | A new `src/**` directory not described in `docs/architecture.md` §11 fails CI (40 paths checked).                                                                 |
| Markdown lint                 | `markdownlint-cli2` in CI                         | Baseline 709 findings brought to 0 before the rule was enforced.                                                                                                  |
| Dependency rule (Rule-01)     | `eslint.config.mjs`, core `no-restricted-imports` | `domain/` cannot import frameworks, DB or outer layers; `application/` and `infrastructure/` cannot import UI; `server/` and `shared/lib/` never import features. |
| Seed guard                    | `scripts/seed-admin.ts`                           | Refuses to run with `NODE_ENV=production` (exit 1) — the demo admin cannot leak into a live database.                                                             |
| Secrets hygiene               | `docs/local-dev.md` only                          | The demo password appears in exactly three files, none of them the README.                                                                                        |

## 5. Numbers I can defend (2026-09-26, sandbox Node 22 + Postgres 17; CI Node 24 + Postgres 17)

- `vitest`: **235 passed / 1 skipped** across 46 files (unit + integration on a
  real Postgres).
- Gate that runs on every push: `format:check` · `lint` · `typecheck` ·
  `docs:check` · `docs:lint` · `test:coverage` · `next build`.
- Migrations `0000`–`0009` applied cleanly on a fresh cluster and on CI.
- Thirteen audit defects (D-01…D-13) traced to lots in `docs/fix-plan.md`; each
  closed line cites its command output.

## 6. What I would do next, and what I deliberately did not do

- **Deploy is an operator step**, tracked in `docs/runbook-deploy.md` and the
  post-deploy table of `STATUS.md`; screenshots and the `v1.0.0` tag wait for a
  live URL rather than being faked from localhost.
- **Lighthouse budget** (`docs/lighthouse.md`) is defined but only measured
  against the deployed site.
- **Per-line refunds** (ADR-008) and the **fiscal choice** (ADR-009) are the two
  decisions a real owner must take before the first live euro.

## 7. Reading order for a reviewer with 15 minutes

1. `docs/adr/004-payments.md` — the idempotency argument.
2. `src/features/checkout/` tests — see the argument executed.
3. `docs/fix-plan.md` — how the audit was triaged, what was refused and why.
4. `STATUS.md` — the evidence ledger.
