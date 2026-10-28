import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCronOrAdmin } from "@/lib/cron-auth";
import { runScheduledCycle, getLastCycle } from "@/lib/scheduled-cycle";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function runCycle(actor: string) {
  try {
    // Scheduled work runs with the service role: there is no user session.
    const results = await runScheduledCycle(createAdminClient(), actor);
    return NextResponse.json({ data: results });
  } catch (err) {
    logger.error({ err: String(err) }, "[cron/automations] unhandled");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/v1/cron/automations — one intelligence cycle (brain, automations,
 * model retraining). Called every 15 minutes by the GitHub Actions scheduler
 * (.github/workflows/automations-cron.yml) and by admins.
 */
export async function POST(request: NextRequest) {
  const gate = await requireCronOrAdmin(request);
  if (!gate.ok) return gate.error;
  return runCycle(gate.actor);
}

/**
 * GET: Vercel Cron (daily, vercel.json) calls with GET and the cron secret,
 * which runs a cycle; `?status=1` or an admin session returns the last cycle.
 */
export async function GET(request: NextRequest) {
  const gate = await requireCronOrAdmin(request);
  if (!gate.ok) return gate.error;
  if (!gate.auth && request.nextUrl.searchParams.get("status") !== "1") return runCycle(gate.actor);
  return NextResponse.json({ data: { last_cycle: await getLastCycle(createAdminClient()) } });
}
