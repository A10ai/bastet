import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { runAllAutomations, getAutomations } from "@/lib/automations-engine";
import { requireAuth } from "@/lib/api-auth";

/**
 * POST /api/v1/ai/automations/run
 * Executes all enabled automations against live Supabase data.
 * Returns per-automation results and updated automation metadata.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.error!;

  try {
    const supabase = createServerSupabaseClient();
    const runResults = await runAllAutomations(supabase);
    const automations = getAutomations();

    // Flatten all results into a combined log
    const allActions = runResults.flatMap((r) =>
      r.results.map((result) => ({
        automation_id: r.automation_id,
        automation_name: r.automation_name,
        ...result,
      }))
    );

    const actionCount = allActions.filter(
      (a) => !a.action.endsWith("_check") && a.action !== "error"
    ).length;

    return NextResponse.json({
      data: {
        automations,
        run_results: runResults,
        log: allActions,
        summary: {
          automations_run: runResults.length,
          total_actions: actionCount,
          timestamp: new Date().toISOString(),
        },
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
