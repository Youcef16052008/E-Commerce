# Deploy pre-flight — Biblio

> Gate **before** running `docs/runbook-deploy.md` (steps 1–7), and again after
> every re-deploy. Everything here is a check with a command or a pointer — the
> runbook stays the single source for _how_; this list is _what must be green_.
> Nothing is checked off until a real run produced the result.

- **Date:** 2026-09-25
- **Owner:** repository operator (Vercel + Neon + R2 + Stripe test accounts)
- **Paired automation:** `npm run smoke` (see §7) — HTTP walk of
  catalogue → cart → checkout → library → download → admin

## 1. Repo gate — the commit you deploy

- [ ] CI green on the exact SHA (`gh run list --limit 3` → the deploy commit
      `completed · success`).
- [ ] Locally green: `npm run format:check && npm run lint && npm run typecheck`.
- [ ] `npm test` — all suites pass (skipped = documented integration skips only).
- [ ] `npm run build` succeeds (production build, no env substitutions missing).
- [ ] `npm run docs:check` → `OK — N paths`.

## 2. Secrets & credential hygiene

- [ ] `git ls-files .env` → empty (only `.env.example` / `.env.test.example`
      are tracked; everything else matches `.gitignore`).
- [ ] No key material in the tree:
      `git grep -nE "sk_(test|live)_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9]{10,}"` → no hits.
      (Live secrets never enter git, at all.)
- [ ] Demo admin password: documented **once** in `docs/local-dev.md` (plus the
      code defaults in `scripts/seed-admin.ts` and `tests/e2e/admin.spec.ts`).
      `grep -in "password\|mot de passe\|Bibli0" README.md README.fr.md` → no hits
      (READMEs only point at `docs/local-dev.md`).
- [ ] On the target platform, every secret comes from environment variables
      (Vercel → Settings → Environment Variables) — never from a committed file.

## 3. Accounts & platform prerequisites (runbook §Prérequis)

- [ ] Vercel, Neon, Cloudflare R2, Stripe (**test mode**) accounts exist.
- [ ] Stripe keys used are test keys: the app refuses to boot with a live key
      (`^(sk|rk)_test_` guard in `src/server/payments/stripe.ts`).

## 4. Environment matrix (runbook §3)

- [ ] All variables from the runbook §3 table are set for **Production + Preview**.
- [ ] `BETTER_AUTH_URL` is the **public HTTPS origin** (`https://<slug>.vercel.app`)
      — a wrong value silently breaks session cookies on every page.
- [ ] `STRIPE_WEBHOOK_SECRET` filled **after** runbook §4 produces the `whsec_…`.
- [ ] Admin seed credentials (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`) are a
      one-shot, strong pair — not the demo password (production guard refuses the
      demo default).

## 5. Data & storage readiness (runbook §1, §2, §5)

- [ ] `npm run db:migrate` ran on the target DB with no errors (migrations are
      additive: `0000`→`0007`).
- [ ] `npm run db:studio` shows the expected schema (12 tables).
- [ ] `npm run seed:all` completed: demo catalogue + admin account exist.
- [ ] Books uploaded and verified: `npm run books:validate` →
      `npm run books:upload` → `npm run storage:check` (runbook §2).

## 6. Stripe test webhook (runbook §4)

- [ ] Endpoint registered: `https://<slug>.vercel.app/api/webhooks/stripe`
      subscribing to the **7 events the app consumes**: `checkout.session.completed`,
      `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
      `checkout.session.expired`, `refund.created`, `refund.updated`, `refund.failed`.
- [ ] Signed test purchase succeeded once: card `4242 4242 4242 4242` → order
      `paid` + book in library + download delivers bytes.
- [ ] Refund round-trip succeeded (refunded order → entitlement revoked).
- [ ] Both results recorded in the `STATUS.md` validation ledger
      (`Date | Environment | What ran | Result`) — this closes the standing
      "Not run" rows for isolated-PG migrations and Stripe round-trip.

## 7. Smoke (automated) + runbook §6 (human)

- [ ] Against the deployed URL:

  ```bash
  SMOKE_BASE_URL=https://<slug>.vercel.app \
  SMOKE_ADMIN_PASSWORD='<admin password from the deploy>' \
  SMOKE_REQUIRE_STRIPE=1 \
  npm run smoke -- --strict
  ```

  Expect **0 failed, 0 skipped**: checkout must reach Stripe (200 session),
  admin steps must be green. On the very first deploy the owner steps are the
  last to turn green — after the §6 test purchase, set
  `SMOKE_OWNER_EMAIL` / `SMOKE_OWNER_PASSWORD` and add
  `SMOKE_REQUIRE_STORAGE=1` so a download that cannot deliver bytes fails the
  gate instead of skipping.

- [ ] Walk the runbook §6 checklist in a real browser (visual rendering,
      hosted Stripe card page, success page, receipt email if enabled).

## 8. Rollback ready

- [ ] You know the rollback path **before** shipping: runbook §7
      (Vercel instant rollback / previous deployment) and the DB is disposable
      in this test-mode phase.

---

**Result:** _not yet run — fill in the `STATUS.md` validation ledger after the
first full pass._
