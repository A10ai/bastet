import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { getBrainConfig } from "@/lib/ai-brain";
import { runScheduledCycle, getLastCycle } from "@/lib/scheduled-cycle";
import { validateBody, formatZodErrors, schedulerSchema } from "@/lib/validation";
import { logger } from "@/lib/logger";

/**
 * Scheduler status and manual trigger.
 *
 * Scheduling itself is done by Vercel Cron (vercel.json -> /api/v1/cron/*),
 * not by in-process timers: a serverless function cannot keep an interval
 * alive, and the old implementation also crashed outside a request scope.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ROLES.MANAGEMENT);
  if (!auth.authenticated) return auth.error!;
  const supabase = await createServerSupabaseClient();
  const last = await getLastCycle(supabase);
  return NextResponse.json({
    data: {
      enabled: true,
      mode: "vercel-cron",
      interval_minutes: 15,
      last_run: last?.at ?? null,
      last_result: last?.payload ?? null,
      brain_config: await getBrainConfig(),
    },
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ROLES.ADMIN);
  if (!auth.authenticated) return auth.error!;
  try {
    const body = await request.json();
    const validation = validateBody(schedulerSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
    }
    const { action } = validation.data;

    if (action === "run_now") {
      const supabase = await createServerSupabaseClient();
      const results = await runScheduledCycle(supabase, auth.email || "admin");
      return NextResponse.json({ data: results });
    }

    return NextResponse.json(
      {
        error: {
          code: "MANAGED_BY_CRON",
          message: "Start, stop and interval are managed by Vercel Cron (vercel.json). Use run_now to trigger a cycle.",
        },
      },
      { status: 410 }
    );
  } catch (err) {
    logger.error({ err: String(err) }, "[ai/scheduler] unhandled");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
