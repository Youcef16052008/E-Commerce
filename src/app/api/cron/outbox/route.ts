import { NextResponse } from "next/server";
import { isCronAuthorized, runOutbox } from "@/features/outbox/application/outbox-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/outbox — drain de l'outbox (Vercel Cron, voir `vercel.json`).
 * Auth : `Authorization: Bearer $CRON_SECRET` (≥ 16 caractères, sinon 503 :
 * on refuse de tourner sans secret plutôt que d'exposer la route).
 * Manuel : `npm run outbox:drain` (même code, sans HTTP).
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 16) {
    return NextResponse.json({ error: "cron_secret_not_configured" }, { status: 503 });
  }
  if (!isCronAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const summary = await runOutbox({ limit: 10 });
  return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
}
