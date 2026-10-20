import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCronOrAdmin } from "@/lib/cron-auth";
import { runScheduledCycle, getLastCycle } from "@/lib/scheduled-cycle";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/v1/cron/automations — one intelligence cycle (brain, automations,
 * model retraining). Scheduled every 15 minutes in vercel.json.
 * GET returns the last recorded cycle.
 */
export async function POST(request: NextRequest) {
  const gate = await requireCronOrAdmin(request);
  if (!gate.ok) return gate.error;
  try {
    // Scheduled work runs with the service role: there is no user session.
    const results = await runScheduledCycle(createAdminClient(), gate.actor);
    return NextResponse.json({ data: results });
  } catch (err) {
    logger.error({ err: String(err) }, "[cron/automations] unhandled");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const gate = await requireCronOrAdmin(request);
  if (!gate.ok) return gate.error;
  return NextResponse.json({ data: { last_cycle: await getLastCycle(createAdminClient()) } });
}
