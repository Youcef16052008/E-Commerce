/**
 * Deploy smoke — HTTP walk of the full customer path against a live target:
 * catalogue → cart → checkout → library → download → admin.
 *
 * Usage:
 *   npm run smoke                                   # local (default :3000)
 *   SMOKE_BASE_URL=https://<slug>.vercel.app npm run smoke -- --strict
 *
 * Environment:
 *   SMOKE_BASE_URL           target origin (default http://localhost:3000)
 *   SMOKE_ADMIN_EMAIL        admin account (default admin@biblio.test)
 *   SMOKE_ADMIN_PASSWORD     enables the positive admin step; unset = SKIP
 *   SMOKE_OWNER_EMAIL        an account that already owns a book (runbook §6
 *                            test purchase) — enables positive library+download
 *   SMOKE_OWNER_PASSWORD     password for that account
 *   SMOKE_REQUIRE_STRIPE=1   a checkout that cannot reach Stripe = FAIL (use
 *                            on a deployed target where test keys are set)
 *   SMOKE_REQUIRE_STORAGE=1  download blocked by missing storage = FAIL
 *   --strict                 every SKIP counts as a failure (exit 1)
 *
 * Notes:
 * - Users created here match the `e2e-%@biblio.test` cleanup pattern
 *   (`npm run db:cleanup:tests` removes them locally).
 * - Each run may leave one pending order when Stripe is not configured; pending
 *   orders expire via `checkout.session.expired` (runbook §4) and are expected
 *   test-mode noise.
 * - Browser-level assertions (visual rendering, hosted Stripe card entry) stay
 *   in tests/e2e and the runbook §6 human checklist — this script is the
 *   automated gate that must be green before those.
 *
 * Exit codes: 0 = no failures (skips allowed unless --strict), 1 = failures.
 */
import process from "node:process";

type Status = "PASS" | "FAIL" | "SKIP";
interface StepResult {
  step: string;
  status: Status;
  detail: string;
}
interface CatalogProduct {
  id: string;
  slug: string;
  title: string;
  priceInCents: number;
}

const BASE = (process.env.SMOKE_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const ORIGIN = new URL(BASE).origin;
const STRICT = process.argv.includes("--strict");
const REQUIRE_STRIPE = process.env.SMOKE_REQUIRE_STRIPE === "1";
const REQUIRE_STORAGE = process.env.SMOKE_REQUIRE_STORAGE === "1";

const results: StepResult[] = [];
let sessionCookie: string | null = null;

function record(step: string, status: Status, detail: string): void {
  results.push({ step, status, detail });
}

/** Perform a request with the Origin header (required by Better Auth) + session cookie. */
async function req(
  path: string,
  init: RequestInit & { withSession?: boolean } = {},
): Promise<Response> {
  const { withSession, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set("Origin", ORIGIN);
  if (withSession && sessionCookie) headers.set("Cookie", sessionCookie);
  return fetch(`${BASE}${path}`, { ...rest, headers, redirect: "manual" });
}

/** Capture the better-auth session cookie from a sign-up/sign-in response. */
function captureSession(res: Response): void {
  const setCookies =
    typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  const token = setCookies
    .filter((c) => c.startsWith("better-auth.session_token="))
    .map((c) => c.split(";")[0])[0];
  if (token) sessionCookie = token;
}

async function readJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

/** Thrown to mark a step as an honest SKIP rather than a failure. */
class SkipError extends Error {}

/** Run one step; a thrown error becomes FAIL, SkipError becomes SKIP. */
async function step(
  name: string,
  fn: () => Promise<string | void>,
  skipOnPrereq?: string,
): Promise<void> {
  if (skipOnPrereq) {
    record(name, "SKIP", skipOnPrereq);
    return;
  }
  try {
    const detail = (await fn()) ?? "ok";
    record(name, "PASS", detail);
  } catch (error) {
    if (error instanceof SkipError) {
      record(name, "SKIP", error.message);
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    record(name, "FAIL", message);
  }
}

function expect(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

async function main(): Promise<void> {
  console.log(`Biblio deploy smoke → ${BASE}${STRICT ? " (strict)" : ""}\n`);

  // ---- home + security headers -------------------------------------------
  let homeRes: Response | null = null;
  await step("home", async () => {
    homeRes = await req("/");
    expect(homeRes.status === 200, `GET / → ${homeRes.status}`);
    const html = await homeRes.text();
    expect(html.includes("Biblio"), "home HTML missing Biblio identity");
    return "200, identity present";
  });

  await step("security-headers", async () => {
    expect(homeRes, "home request did not run");
    const required: [string, string][] = [
      ["x-frame-options", "DENY"],
      ["x-content-type-options", "nosniff"],
      ["referrer-policy", "no-referrer"],
      ["strict-transport-security", ""],
      ["cross-origin-resource-policy", "same-origin"],
    ];
    const missing = required
      .filter(([h, v]) => {
        const got = homeRes!.headers.get(h);
        return got === null || (v !== "" && !got.includes(v));
      })
      .map(([h]) => h);
    expect(missing.length === 0, `missing headers: ${missing.join(", ")}`);
    return "5/5 headers present";
  });

  // ---- catalogue ----------------------------------------------------------
  let firstProduct: CatalogProduct | null = null;
  await step("catalogue", async () => {
    const page = await req("/products");
    expect(page.status === 200, `GET /products → ${page.status}`);
    expect((await page.text()).includes("Catalogue"), "catalogue page marker missing");
    const api = await req("/api/products");
    expect(api.status === 200, `GET /api/products → ${api.status}`);
    const body = await readJson<{ items: CatalogProduct[] }>(api);
    expect(body.items.length > 0, "catalogue API returned 0 products (seed missing?)");
    const picked = body.items[0];
    expect(picked.id && picked.slug && picked.priceInCents > 0, "product row malformed");
    firstProduct = picked;
    return `${body.items.length} products`;
  });

  await step("product-page", async () => {
    expect(firstProduct, "catalogue step did not run");
    const res = await req(`/products/${firstProduct.slug}`);
    expect(res.status === 200, `GET /products/${firstProduct.slug} → ${res.status}`);
    const html = await res.text();
    expect(html.includes(firstProduct.title), "product page missing title");
    const dollars = `$${(firstProduct.priceInCents / 100).toFixed(2)}`;
    expect(html.includes(dollars), `product page missing server price ${dollars}`);
    return "SSR title + server price present";
  });

  await step("no-secrets-in-html", async () => {
    const pages = ["/", "/products"];
    const patterns: [RegExp, string][] = [
      [/sk_(test|live)_[A-Za-z0-9]{10,}/, "Stripe key"],
      [/whsec_[A-Za-z0-9]{10,}/, "webhook secret"],
      [/postgres:\/\/[^\s"']+:[^\s"']+@/, "database URL"],
      [/BETTER_AUTH_SECRET\s*[:=]\s*["'][^"']{8,}/, "auth secret"],
    ];
    for (const path of pages) {
      const res = await req(path);
      expect(res.status === 200, `GET ${path} → ${res.status}`);
      const html = await res.text();
      for (const [re, label] of patterns) {
        expect(!re.test(html), `${label} leaked in HTML of ${path}`);
      }
    }
    return "no credential patterns on / and /products";
  });

  // ---- account (fresh per run) --------------------------------------------
  const email = `e2e-smoke-${Date.now()}-${Math.floor(Math.random() * 1e4)}@biblio.test`;
  let signedUp = false;
  await step("sign-up", async () => {
    const res = await req("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Smoke Bot", email, password: `MotDePasse!${Date.now()}` }),
    });
    expect(res.status === 200, `sign-up → ${res.status}`);
    captureSession(res);
    expect(sessionCookie, "sign-up set no session cookie");
    signedUp = true;
    const body = await readJson<{ user: { role: string } }>(res);
    expect(body.user.role === "customer", `role is ${body.user.role}, expected customer`);
    return `session established (${email})`;
  });
  const prereq = signedUp ? undefined : "sign-up failed";

  await step(
    "session",
    async () => {
      const res = await req("/api/me/library", { withSession: true });
      expect(res.status === 200, `GET /api/me/library → ${res.status}`);
      const body = await readJson<{ items: unknown[] }>(res);
      expect(Array.isArray(body.items), "library payload is not { items: [...] }");
      return "cookie accepted, items array returned";
    },
    prereq,
  );

  // ---- cart ----------------------------------------------------------------
  await step(
    "cart-add",
    async () => {
      expect(firstProduct, "catalogue step did not run");
      const res = await req("/api/cart", {
        method: "POST",
        withSession: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: firstProduct.id }),
      });
      expect(res.status === 201, `POST /api/cart → ${res.status}`);
      const body = await readJson<{
        ok: boolean;
        items: { productId: string; unitPriceInCents: number }[];
        totalInCents: number;
      }>(res);
      expect(body.ok === true, "cart response missing ok");
      const line = body.items.find((i) => i.productId === firstProduct!.id);
      expect(line, "added product not in cart");
      expect(
        line.unitPriceInCents === firstProduct.priceInCents,
        `unit price ${line.unitPriceInCents} ≠ catalogue ${firstProduct.priceInCents} (server pricing broken)`,
      );
      expect(body.totalInCents === firstProduct.priceInCents, "cart total mismatch");
      return "201, server-side price matches catalogue";
    },
    prereq,
  );

  await step(
    "cart-page-gate",
    async () => {
      const anon = await req("/cart");
      expect(anon.status === 307, `anon GET /cart → ${anon.status} (expected 307)`);
      const location = anon.headers.get("location") ?? "";
      expect(location.includes("/auth/sign-in"), `anon /cart redirected to ${location}`);
      const authed = await req("/cart", { withSession: true });
      expect(authed.status === 200, `authed GET /cart → ${authed.status}`);
      return "307 anon → sign-in, 200 authed";
    },
    prereq,
  );

  // ---- checkout ------------------------------------------------------------
  await step(
    "checkout",
    async () => {
      const res = await req("/api/checkout", { method: "POST", withSession: true });
      if (res.status === 200) {
        const body = await readJson<{ url: string; orderId: string }>(res);
        expect(body.orderId, "checkout response missing orderId");
        expect(
          typeof body.url === "string" && body.url.startsWith("https://checkout.stripe.com/"),
          `checkout url is not a Stripe host: ${body.url}`,
        );
        return "session created on Stripe (full purchase: runbook §6)";
      }
      const body = await readJson<{ error?: string }>(res).catch(() => ({ error: "?" }));
      if (body.error === "PAYMENT_ERROR") {
        if (REQUIRE_STRIPE) {
          throw new Error(
            "STRIPE_SECRET_KEY missing or Stripe unreachable on this target (SMOKE_REQUIRE_STRIPE=1)",
          );
        }
        throw new SkipError(
          "no Stripe test keys on this target (set STRIPE_SECRET_KEY; SMOKE_REQUIRE_STRIPE=1 makes this a failure)",
        );
      }
      throw new Error(`POST /api/checkout → ${res.status} (${body.error})`);
    },
    prereq,
  );

  // ---- library + download gates --------------------------------------------
  await step(
    "library-empty",
    async () => {
      const res = await req("/api/me/library", { withSession: true });
      expect(res.status === 200, `GET /api/me/library → ${res.status}`);
      const body = await readJson<{ items: unknown[] }>(res);
      expect(Array.isArray(body.items), "library payload malformed");
      expect(body.items.length === 0, "fresh user unexpectedly owns books");
      return "fresh account, empty library as expected";
    },
    prereq,
  );

  await step(
    "download-gate",
    async () => {
      expect(firstProduct, "catalogue step did not run");
      const res = await req(`/api/me/library/${firstProduct.id}/download`, {
        method: "POST",
        withSession: true,
      });
      expect(res.status === 403, `non-owner download → ${res.status} (expected 403)`);
      const body = await readJson<{ error: string }>(res);
      expect(body.error === "NOT_ENTITLED", `error is ${body.error}, expected NOT_ENTITLED`);
      return "403 NOT_ENTITLED for non-owner";
    },
    prereq,
  );

  // ---- admin ----------------------------------------------------------------
  await step("admin-gates", async () => {
    const anonStats = await req("/api/admin/stats");
    expect(anonStats.status === 401, `anon /api/admin/stats → ${anonStats.status} (expected 401)`);
    const anonPage = await req("/admin");
    expect(anonPage.status === 307, `anon GET /admin → ${anonPage.status} (expected 307)`);
    const location = anonPage.headers.get("location") ?? "";
    expect(location.includes("/auth/sign-in"), `anon /admin redirected to ${location}`);
    if (sessionCookie) {
      const cust = await req("/api/admin/stats", { withSession: true });
      expect(cust.status === 403, `customer /api/admin/stats → ${cust.status} (expected 403)`);
      return "401 anon · 307 anon page · 403 customer";
    }
    return "401 anon · 307 anon page (customer probe skipped: no session)";
  });

  const adminPassword = process.env.SMOKE_ADMIN_PASSWORD;
  await step("admin-positive", async () => {
    if (!adminPassword) {
      throw new SkipError(
        "set SMOKE_ADMIN_PASSWORD to run the positive admin check (docs/local-dev.md locally)",
      );
    }
    const signIn = await req("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: process.env.SMOKE_ADMIN_EMAIL ?? "admin@biblio.test",
        password: adminPassword,
      }),
    });
    expect(signIn.status === 200, `admin sign-in → ${signIn.status}`);
    captureSession(signIn);
    expect(sessionCookie, "admin sign-in set no session cookie");
    const stats = await req("/api/admin/stats", { withSession: true });
    expect(stats.status === 200, `admin /api/admin/stats → ${stats.status}`);
    const body = await readJson<{
      productsTotal: number;
      ordersByStatus: Record<string, number>;
      revenueFormatted: string;
    }>(stats);
    expect(body.productsTotal >= 1, "admin stats: 0 products (seed missing?)");
    for (const key of ["pending", "paid", "fulfilled", "refund_pending", "failed", "refunded"]) {
      expect(key in body.ordersByStatus, `admin stats missing status bucket ${key}`);
    }
    expect(typeof body.revenueFormatted === "string", "admin stats missing revenueFormatted");
    const page = await req("/admin", { withSession: true });
    expect(page.status === 200, `GET /admin → ${page.status}`);
    expect((await page.text()).includes("Tableau de bord"), "admin dashboard marker missing");
    return `200, ${body.productsTotal} products, 6 status buckets, SSR dashboard`;
  });

  // ---- positive library + download (owner account from a completed purchase) ----
  const ownerEmail = process.env.SMOKE_OWNER_EMAIL;
  const ownerPassword = process.env.SMOKE_OWNER_PASSWORD;
  const ownerPrereq =
    ownerEmail && ownerPassword
      ? undefined
      : "set SMOKE_OWNER_EMAIL/SMOKE_OWNER_PASSWORD after one real test purchase (runbook §6)";
  let ownedProduct: { productId: string; title: string } | null = null;

  await step(
    "owner-library",
    async () => {
      const signIn = await req("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: ownerEmail, password: ownerPassword }),
      });
      expect(signIn.status === 200, `owner sign-in → ${signIn.status}`);
      captureSession(signIn);
      expect(sessionCookie, "owner sign-in set no session cookie");
      const lib = await req("/api/me/library", { withSession: true });
      expect(lib.status === 200, `owner GET /api/me/library → ${lib.status}`);
      const libBody = await readJson<{ items: { productId: string; title: string }[] }>(lib);
      expect(libBody.items.length >= 1, "owner library is empty — do a test purchase first");
      ownedProduct = libBody.items[0];
      const orders = await req("/api/me/orders", { withSession: true });
      expect(orders.status === 200, `owner GET /api/me/orders → ${orders.status}`);
      const ordersBody = await readJson<{ orders: { status: string }[] }>(orders);
      expect(ordersBody.orders.length >= 1, "owner has no orders despite owning a book");
      const statuses = [...new Set(ordersBody.orders.map((o) => o.status))].join(",");
      return `${libBody.items.length} book(s), ${ordersBody.orders.length} order(s) [${statuses}]`;
    },
    ownerPrereq,
  );

  await step(
    "owner-download",
    async () => {
      expect(ownedProduct, "owner-library step did not run");
      const dl = await req(`/api/me/library/${ownedProduct.productId}/download`, {
        method: "POST",
        withSession: true,
      });
      if (dl.status === 403) {
        throw new Error("owner download → 403 NOT_ENTITLED (entitlement missing after purchase)");
      }
      if (dl.status === 404 || dl.status === 503) {
        const body = await readJson<{ error?: string }>(dl).catch(() => ({ error: "?" }));
        if (!REQUIRE_STORAGE) {
          throw new SkipError(
            `entitlement ok but file/storage unavailable (${body.error}) — run books:upload + storage:check (runbook §2)`,
          );
        }
        throw new Error(`download blocked with SMOKE_REQUIRE_STORAGE=1: ${body.error}`);
      }
      expect(dl.status === 200, `owner download → ${dl.status}`);
      const { url } = await readJson<{ url: string }>(dl);
      expect(typeof url === "string" && url.length > 0, "download response has no URL");
      const file = await fetch(url, { method: "GET" });
      expect(file.status === 200, `presigned GET → ${file.status}`);
      const bytes = (await file.arrayBuffer()).byteLength;
      expect(bytes > 0, "downloaded file is empty");
      return `file delivered, ${bytes} bytes`;
    },
    ownerPrereq ?? (ownedProduct ? undefined : "owner-library step failed"),
  );

  // ---- summary ----------------------------------------------------------------
  const failed = results.filter((r) => r.status === "FAIL");
  const skipped = results.filter((r) => r.status === "SKIP");
  const passed = results.filter((r) => r.status === "PASS");
  const width = Math.max(...results.map((r) => r.step.length));
  for (const r of results) {
    const mark = r.status === "PASS" ? "✓" : r.status === "FAIL" ? "✗" : "→";
    console.log(`${mark} ${r.step.padEnd(width)}  ${r.detail}`);
  }
  console.log(
    `\n${passed.length} passed · ${failed.length} failed · ${skipped.length} skipped` +
      (STRICT && skipped.length > 0 ? " (strict: skips fail)" : ""),
  );
  const mustFail = failed.length > 0 || (STRICT && skipped.length > 0);
  process.exitCode = mustFail ? 1 : 0;
}

main().catch((error: unknown) => {
  console.error("smoke aborted:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
