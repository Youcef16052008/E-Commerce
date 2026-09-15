/**
 * Read-only financial reconciliation against an explicitly configured Stripe TEST account.
 *
 * Examples:
 *   npm run stripe:reconcile
 *   npm run stripe:reconcile -- --order <biblio-order-id> --strict
 *   npm run stripe:reconcile -- --limit 50
 *
 * The only database write is an append-only, non-financial audit row in
 * stripe_sync_log. This script never changes an order, refund or entitlement.
 * It deliberately does not import `load-env`: using `.env` by accident could
 * target the wrong database/account. The npm script loads `.env.test` only.
 */
import { existsSync } from "node:fs";
import path from "node:path";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function option(name: "--limit" | "--order") {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;

  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

function parseArguments() {
  const supportedOptions = new Set(["--limit", "--order", "--strict"]);
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--") && !supportedOptions.has(arg)) {
      throw new Error(`Unsupported option: ${arg}`);
    }
  }

  const rawLimit = option("--limit");
  const limit = rawLimit === undefined ? DEFAULT_LIMIT : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new Error(`--limit must be an integer between 1 and ${MAX_LIMIT}.`);
  }

  return {
    limit,
    orderId: option("--order"),
    strict: process.argv.includes("--strict"),
  };
}

function assertTestOnlyEnvironment() {
  const envFile = path.resolve(process.cwd(), ".env.test");
  if (!existsSync(envFile)) {
    throw new Error(
      "Missing .env.test. Copy .env.test.example and configure an isolated PostgreSQL + Stripe test account.",
    );
  }
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not loaded. Run this command through `npm run stripe:reconcile`, which loads .env.test.",
    );
  }
  if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
    throw new Error("STRIPE_SECRET_KEY must be an sk_test_ key for reconciliation.");
  }
}

async function main() {
  assertTestOnlyEnvironment();
  const args = parseArguments();
  // Dynamic import ensures no database or Stripe module is initialized before
  // the test-only environment guard has completed.
  const { reconcileStripeRemotely } =
    await import("../src/features/admin/application/stripe-reconciliation-service");
  const report = await reconcileStripeRemotely(args);
  const issues = report.results.flatMap((result) => result.issues);

  console.log(`Stripe test reconciliation ${report.runId} at ${report.checkedAt.toISOString()}.`);
  console.log(
    `${report.selected} order(s): ${report.matched} matched, ${report.mismatched} mismatch(es), ${report.remoteMissing} remote missing, ${report.remoteErrors} remote error(s).`,
  );

  if (issues.length > 0) {
    console.table(
      issues.map((item) => ({
        kind: item.kind,
        orderId: item.orderId,
        paymentIntentId: item.paymentIntentId,
        localRefundId: item.localRefundId ?? "",
        remoteRefundId: item.remoteRefundId ?? "",
      })),
    );
  }

  if (args.strict && issues.length > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error(
    "Stripe reconciliation could not run:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
