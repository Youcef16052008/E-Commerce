/**
 * Read-only database reconciliation report for operations/cron.
 *
 * Usage:
 *   npm run payments:reconcile
 *   npm run payments:reconcile -- --strict  # non-zero if an exception exists
 *
 * It intentionally does not call Stripe or mutate data. Compare these internal
 * exceptions with Stripe through the protected operational workflow; never
 * auto-grant an entitlement or fabricate a payment status from this script.
 */
import "./load-env";
import { viewPaymentExceptions } from "../src/features/admin/application/payment-exceptions-service";

async function main() {
  const strict = process.argv.includes("--strict");
  const report = await viewPaymentExceptions();

  console.log(`Réconciliation interne générée le ${report.generatedAt.toISOString()}.`);
  console.log(
    `${report.total} exception${report.total > 1 ? "s" : ""} détectée${report.total > 1 ? "s" : ""}.`,
  );
  console.table(report.counts);

  if (report.total > 0) {
    console.table(
      report.items.map((item) => ({
        type: item.kind,
        orderId: item.orderId,
        customer: item.userEmail,
        status: item.orderStatus,
        total: item.totalFormatted,
        product: item.productTitle ?? "",
      })),
    );
  }

  if (strict && report.total > 0) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error("✗ Réconciliation impossible :", error instanceof Error ? error.message : error);
  process.exit(1);
});
