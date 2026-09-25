# Fix plan — closing the shipping gap

> Source : external audit "Sheet Set A" (repository audit, commit `ddb44a9`)
>
> - maintainer review. Every defect D-01 → D-13 has exactly one owning lot.
>   Ordered by what unblocks everything else. **Do not refactor the payment core
>   to do any of this** — it is the part of the repository that already works.

**Decisions locked (2026-09-25):** README language = **English primary** +
`README.fr.md` · code licence = **MIT** (content licence stays per-product) ·
Rev B folder renames (`library → entitlements`, `server → platform`) are
**deferred until after deploy** — only the docs/source parity check lands now.

## Audit errata (verified against the repo before acting)

| Audit claim                           | Reality                                     | Action                                    |
| ------------------------------------- | ------------------------------------------- | ----------------------------------------- |
| D-09: admin password "3× in README"   | 2× (L15, L36)                               | fixed anyway — password leaves the README |
| G-07: CI = "1 job, 11 steps"          | 12 steps                                    | corrected here                            |
| Overall "weighted 6.4"                | weights undisclosed; plain mean = 6.5       | plan uses no hidden weights               |
| D-08: `CLAUDE.md` is "11-byte debris" | it is a valid `@AGENTS.md` import directive | **kept**, not deleted                     |

## Lot map

| Lot | Name                 | Closes                                                         | Owner                       | When              |
| --- | -------------------- | -------------------------------------------------------------- | --------------------------- | ----------------- |
| 1   | Truth & hygiene      | D-03, D-04, D-08, D-09, D-10, D-12a, D-13                      | me                          | **now**           |
| 2   | Runtime alignment    | D-07                                                           | me                          | now (small)       |
| 3   | Evidence (local)     | D-02 (visual half)                                             | me                          | now (best effort) |
| 4   | Ship                 | **D-01** (blocker)                                             | **you** — accounts required | after Lot 1–3     |
| 5   | Trust                | D-05, D-06, coverage floor, ADR-008/009/010, markdownlint      | me                          | weeks 2–4         |
| 6   | Reliability & growth | D-11, search, admin bulk, Lighthouse CI, case study (slice 11) | me                          | weeks 5–8         |

---

## Lot 1 — Truth & hygiene (executes now, no credentials)

Goal: one status file, one short README, docs that describe the filesystem,
zero process debris, zero credentials on the front page.

- [x] **L1.1** `STATUS.md` (root) — single source of truth: slice table,
      validation ledger (what ran · where · when · evidence), stack versions,
      known issues, roadmap. Absorbs `docs/project-state.md` +
      `docs/implementation-plan.md` + `docs/stack.md` → then those are removed.
      _(closes D-03)_
- [x] **L1.2** `docs/product.md` — merge of `discovery.md` + `product-brief.md`
      (problem, personas, stories, scope, acceptance). _(D-03, doc map)_
- [x] **L1.3** `docs/local-dev.md` — everything the README sheds: full command
      table, **single** credential mention with a "never in production" banner,
      MinIO setup, Gutenberg import, version-check note, admin API reference,
      git-token operational note. _(D-09, D-10)_
- [x] **L1.4** `docs/architecture.md` §2 + §11 rewritten **from the
      filesystem**: 9 real feature modules (adds `catalog-import`, `refunds`;
      `entitlements` → real folder `library`), `server/{db,payments,storage}`,
      no `styles/`, no `infra/`. _(D-04)_
- [x] **L1.5** `scripts/check-docs.ts` + `npm run docs:check` + CI step —
      fails when a path named in architecture §11 is missing from disk, or a
      `src/` directory is undocumented. Makes D-04 unrepeatable. _(D-04)_
- [x] **L1.6** Archive dated reviews → `docs/reviews/`:
      `audit-2026-09-07.md`, `hardening-plan.md`,
      `plan-de-transformation-phase-par-phase-2026-09-07.md`.
      **Delete** `ci-fix.md` + `ci-order.patch` (patch verified already applied
      in `.github/workflows/ci.yml`). `CLAUDE.md` kept (see errata). _(D-08)_
- [x] **L1.7** `README.md` rewritten ≤120 lines / ≤~2.6 KB: what it is, status
      line → STATUS, screenshot slot (filled in Lot 3), why interesting,
      6-line quickstart, docs map, MIT. No password, no 15-command table, no
      MinIO/Gutenberg prose, no admin API dump. _(D-10, D-09, D-12a)_
- [x] **L1.8** `README.fr.md` — French mirror (audience decision: EN primary).
      _(D-13)_
- [x] **L1.9** `LICENSE` — MIT, copyright 2026 Youcef16052008. _(D-12a)_
- [x] **L1.10** `scripts/seed-admin.ts` — hard-fail when `NODE_ENV=production`
      without `SEED_ADMIN_PASSWORD` (no default password in prod); never echo
      the password in production logs. _(D-09, code half)_
- [x] **L1.11** Green gate: `format:check` · `lint` · `typecheck` · `test` ·
      `build` (dummy env) · `docs:check` · `docs:check` in `ci.yml`.

**Lot 1 DoD** — a newcomer sees ≤120 README lines and knows where truth lives;
the demo admin password is confined to its sanctioned locations —
`docs/local-dev.md` (the only doc that prints it) plus the code defaults in
`scripts/seed-admin.ts` and `tests/e2e/admin.spec.ts` — and never appears in
either README;
`npm run docs:check` is green locally and in CI.

## Lot 2 — Runtime alignment (small, now)

- [x] **L2.1** `@types/node` `^20` → `^24` (matches CI Node 24 / target),
      `engines.node` declared, typecheck still green. _(D-07)_
- [x] **L2.2** CI asserts `process.version` major = 24. _(D-07)_

## Lot 3 — Evidence, local (best effort in this sandbox)

No system Postgres here → attempt an npm-installable local Postgres (or PGlite

- wire socket). If it runs: migrate → seed → `next dev` → capture the six
  screenshots the audit demands (home, product, cart, checkout/success, library,
  admin dashboard) into `docs/screenshots/`, wire them **above the fold** in both
  READMEs.

* [x] **L3.1** Local DB up (or honest "blocked" note in STATUS).
* [x] **L3.2** Six screenshots captured + committed.
* [x] **L3.3** README screenshot slots filled.

**Lot 3 DoD** — the repo shows the product without anyone running it.

## Lot 4 — Ship (**blocked on you**: Vercel / Neon / R2 / Stripe accounts)

I prepare everything that doesn't need your accounts; you execute
`docs/runbook-deploy.md` (7 steps) — **run it yourself; never paste credentials
into chat.**

- [x] **L4.1** Me: deploy pre-flight checklist + smoke script
      (catalogue → cart → checkout → library → download → admin).
      Delivered `docs/deploy-preflight.md` + `scripts/smoke.ts`
      (`npm run smoke`, `--strict` + `SMOKE_REQUIRE_*` gates); local run
      2026-09-25: 15 passed · 0 failed · 1 skipped (checkout — no Stripe keys
      in this sandbox; becomes a failure under `SMOKE_REQUIRE_STRIPE=1`).
- [ ] **L4.2** You: runbook steps 1–7, Stripe test webhook → prod URL.
- [ ] **L4.3** Me: live URL on README line 1, screenshots re-shot against prod,
      tag `v1.0.0`, e2e against preview.

**Lot 4 DoD (unchanged from audit)** — a stranger with no local setup opens the
link, buys a $0.50 book with the Stripe test card, finds it in `/library`,
downloads it intact, sees the order in `/admin`.

## Lot 5 — Trust (weeks 2–4)

- [ ] **L5.1** `platform/mail` interface (Resend/Postmark/SES by env, like
      storage) + receipt & refund templates. _(D-05)_
- [ ] **L5.2** GDPR: account deletion, data export, `/legal` page, content
      licence statement. _(D-06)_
- [ ] **L5.3** Coverage floor 70 % on checkout + entitlements paths in CI.
- [ ] **L5.4** ADR-008 partial refunds · ADR-009 VAT/micro-enterprise ·
      ADR-010 transactional email.
- [ ] **L5.5** markdownlint in CI with a relaxed config (baseline run first —
      if legacy noise is large, fix rules not the whole archive in one pass).

**Lot 5 DoD** — green CI includes docs parity + coverage; every open financial
question is answered by an ADR.

## Lot 6 — Reliability & growth (weeks 5–8, pick 3)

- [ ] **L6.1** Outbox table + Vercel Cron route draining it; exceptions page
      becomes a view over real rows; hand-run CLIs stay as manual override. _(D-11)_
- [ ] **L6.2** Search over 512 products — Postgres FTS, no new infrastructure.
- [ ] **L6.3** Admin: bulk publish, CSV import/export.
- [ ] **L6.4** Lighthouse CI budget: LCP < 1.8 s on `/` and `/products`.
- [ ] **L6.5** Portfolio case study (slice 11) built from the ADRs.
- [ ] **L6.6** _(decision point, post-deploy)_ boundary lint
      (`import/no-restricted-paths`) for the Rule-01 dependency rule — the only
      part of audit Rev B adopted; folder **renames stay deferred**.

**Lot 6 DoD** — three features a user would notice, none touching the payment
core, and one metric you can point at in an interview.

## Defect → lot traceability

| D-01 | D-02 | D-03 | D-04 | D-05 | D-06 | D-07 | D-08 | D-09 | D-10 | D-11 | D-12                | D-13 |
| ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ------------------- | ---- |
| L4   | L3   | L1   | L1   | L5   | L5   | L2   | L1   | L1   | L1   | L6   | L1(a) + you(rename) | L1   |

## Standing rules (every lot)

1. **Never refactor the payment core** (checkout, webhook, refunds, FSM) for a
   fix in this plan.
2. **No new infrastructure** — no Redis, no queue, no services, no event bus.
3. **No unevidenced claims** — every "done" names date · environment · command.
4. **Green gate before any lot closes**: format · lint · typecheck · tests ·
   build · docs:check.
