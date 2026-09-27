/**
 * Drain manuel de l'outbox (même code que le Cron Vercel `/api/cron/outbox`).
 *
 * Usage :
 *   npm run outbox:drain                 # enfile les travaux périodiques + draine
 *   npm run outbox:drain -- --no-enqueue # draine seulement ce qui est déjà en file
 *   npm run outbox:drain -- --limit=25
 */
import "./load-env";
import { runOutbox } from "../src/features/outbox/application/outbox-service";

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const summary = await runOutbox({
    enqueue: !args.includes("--no-enqueue"),
    limit: limitArg ? Number(limitArg.split("=")[1]) : 10,
  });
  console.log(JSON.stringify(summary, null, 2));
  if (summary.processed.some((p) => p.outcome === "failed")) process.exitCode = 2;
}

// Le client postgres (`max: 1`) garde la boucle d'événements vivante : sortie explicite.

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    console.error("✗ Drain impossible :", error instanceof Error ? error.message : error);
    process.exit(1);
  });
