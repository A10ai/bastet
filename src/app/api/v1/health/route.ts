import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { runHealthChecks, type HealthBody } from "@/lib/health";
import { requireCronOrAdmin } from "@/lib/cron-auth";

// Never prerender: a cached health payload (timestamp frozen at build time)
// defeats the purpose of a health check.
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/health
 *
 * Public, unauthenticated: returns only `{ status, timestamp }` with 200 when
 * the app can serve traffic and 503 when a hard dependency (database or
 * auth) is down. The per-check detail (commit, version, which dependency is
 * degraded and why) is returned only to an admin session or a caller
 * presenting the cron secret, so the public endpoint tells an attacker
 * nothing about the deployment.
 *
 * Used by: Dockerfile HEALTHCHECK, docker-compose, uptime monitors (see
 * docs/ALERTING.md), and the deploy runbook's smoke step (which sends the
 * cron secret to read the detail).
 */
const MEMO_MS = 10_000;
let memo: { at: number; body: HealthBody; status: number } | null = null;

export async function GET(request: NextRequest) {
  let body: HealthBody;
  let status: number;
  let cached = false;
  if (memo && Date.now() - memo.at < MEMO_MS) {
    ({ body, status } = memo);
    cached = true;
  } else {
    ({ body, status } = await runHealthChecks());
    memo = { at: Date.now(), body, status };
  }

  const headers = { "Cache-Control": "no-store" };
  const wantsDetail = request.headers.has("authorization") || request.cookies.getAll().some((c) => c.name.includes("auth-token"));
  if (wantsDetail) {
    const gate = await requireCronOrAdmin(request);
    if (gate.ok) return NextResponse.json({ ...body, cached }, { status, headers });
  }
  return NextResponse.json({ status: body.status, timestamp: body.timestamp, cached }, { status, headers });
}
