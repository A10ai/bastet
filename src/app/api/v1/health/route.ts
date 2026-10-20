import { NextResponse } from "next/server";
import { runHealthChecks, type HealthBody } from "@/lib/health";

// Never prerender: a cached health payload (timestamp frozen at build time)
// defeats the purpose of a health check.
export const dynamic = "force-dynamic";

// Short memo so a public endpoint cannot be used to hammer the database:
// however often monitors (or anyone) poll, the dependencies are probed at
// most once every MEMO_MS per instance.
/**
 * GET /api/v1/health
 *
 * Public, unauthenticated. Returns 200 when the app can serve traffic and 503
 * when a hard dependency (database or auth) is down. Soft problems (stale
 * cron, missing night audit, per-instance rate limiting) mark the check
 * "degraded" but keep 200 so a slow dependency does not take the site out
 * of rotation. Details are deliberately coarse: no error text reaches callers.
 *
 * Used by: Dockerfile HEALTHCHECK, docker-compose, uptime monitors (see
 * docs/ALERTING.md), and the deploy runbook's smoke step.
 */
const MEMO_MS = 10_000;
let memo: { at: number; body: HealthBody; status: number } | null = null;

export async function GET() {
  if (memo && Date.now() - memo.at < MEMO_MS) {
    return NextResponse.json({ ...memo.body, cached: true }, { status: memo.status, headers: { "Cache-Control": "no-store" } });
  }
  const { body, status } = await runHealthChecks();
  memo = { at: Date.now(), body, status };
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

