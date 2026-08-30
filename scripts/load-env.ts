import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * Charge `.env` (si présent) au moment de l'import, pour les scripts exécutés via
 * `tsx`/node qui ne passent pas par le loader d'env de Next.js.
 *
 * ⚠️ ESM évalue les imports dans l'ordre : ce module DOIT être le tout premier import
 * d'un script pour que `process.env` soit peuplé avant l'évaluation du module DB.
 */
(function loadEnv() {
  const file = path.resolve(process.cwd(), ".env");
  if (!existsSync(file)) return;
  const content = readFileSync(file, "utf8");
  for (const line of content.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    if (process.env[key] === undefined) {
      process.env[key] = m[2].replace(/^["']|["']$/g, "");
    }
  }
})();
