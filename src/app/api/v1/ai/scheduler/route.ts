import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";
import { runBrainCycle, getBrainConfig } from "@/lib/ai-brain";
import { runAllAutomations } from "@/lib/automations-engine";
import { generateInsights } from "@/lib/ai-engine";
import { trainModel } from "@/lib/prediction-model";

// Store last run time in memory (resets on deploy)
let lastSchedulerRun: string | null = null;
let schedulerEnabled = true;
let schedulerIntervalMs = 15 * 60 * 1000; // 15 minutes default
let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let totalCycles = 0;

/**
 * GET — Returns scheduler status
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.error!;

  return NextResponse.json({
    data: {
      enabled: schedulerEnabled,
      interval_minutes: schedulerIntervalMs / 60000,
      last_run: lastSchedulerRun,
      total_cycles: totalCycles,
      is_running: schedulerTimer !== null,
      brain_config: getBrainConfig(),
    },
  });
}

/**
 * POST — Control the scheduler
 * Actions: start, stop, run_now, set_interval
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.error!;

  try {
    const body = await request.json();
    const { action, interval_minutes } = body;

    switch (action) {
      case "start": {
        schedulerEnabled = true;
        if (!schedulerTimer) {
          // Start the interval
          schedulerTimer = setInterval(async () => {
            await executeScheduledCycle();
          }, schedulerIntervalMs);
        }
        return NextResponse.json({
          data: {
            message: `Scheduler started. Running every ${schedulerIntervalMs / 60000} minutes.`,
            enabled: true,
          },
        });
      }

      case "stop": {
        schedulerEnabled = false;
        if (schedulerTimer) {
          clearInterval(schedulerTimer);
          schedulerTimer = null;
        }
        return NextResponse.json({
          data: { message: "Scheduler stopped.", enabled: false },
        });
      }

      case "run_now": {
        const result = await executeScheduledCycle();
        return NextResponse.json({ data: result });
      }

      case "set_interval": {
        const mins = Math.max(5, Math.min(60, interval_minutes || 15));
        schedulerIntervalMs = mins * 60 * 1000;

        // Restart timer with new interval
        if (schedulerTimer) {
          clearInterval(schedulerTimer);
          schedulerTimer = setInterval(async () => {
            await executeScheduledCycle();
          }, schedulerIntervalMs);
        }

        return NextResponse.json({
          data: {
            message: `Interval set to ${mins} minutes.`,
            interval_minutes: mins,
          },
        });
      }

      default:
        return NextResponse.json(
          { error: "Unknown action. Use: start, stop, run_now, set_interval" },
          { status: 400 }
        );
    }
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Execute a full scheduled cycle:
 * 1. Run AI Brain (if enabled)
 * 2. Run all automations
 * 3. Generate fresh insights
 * 4. Log the cycle
 */
async function executeScheduledCycle() {
  const startTime = Date.now();
  const supabase = createServerSupabaseClient();
  const results: {
    brain: unknown;
    automations: unknown;
    predictions: unknown;
    insights_count: number;
    duration_ms: number;
    timestamp: string;
  } = {
    brain: null,
    automations: null,
    predictions: null,
    insights_count: 0,
    duration_ms: 0,
    timestamp: new Date().toISOString(),
  };

  try {
    // 1. Run AI Brain cycle
    const brainConfig = getBrainConfig();
    if (brainConfig.enabled) {
      try {
        const brainResult = await runBrainCycle(supabase);
        results.brain = {
          decisions: brainResult.decisions?.length || 0,
          mode: brainResult.mode,
          summary: brainResult.summary,
        };
      } catch (e) {
        results.brain = { error: e instanceof Error ? e.message : "Brain cycle failed" };
      }
    } else {
      results.brain = { skipped: "Brain is disabled" };
    }

    // 2. Run all automations
    try {
      const autoResults = await runAllAutomations(supabase);
      results.automations = {
        ran: autoResults.length,
        total_actions: autoResults.reduce(
          (sum, a) => sum + a.results.filter((r) => !r.action.endsWith("_check")).length,
          0
        ),
      };
    } catch (e) {
      results.automations = { error: e instanceof Error ? e.message : "Automations failed" };
    }

    // 3. Retrain prediction model
    try {
      const model = await trainModel(supabase);
      results.predictions = {
        training_samples: model.training_samples,
        mae: model.accuracy_mae,
        r_squared: model.accuracy_r_squared,
      };
    } catch (e) {
      results.predictions = { error: e instanceof Error ? e.message : "Prediction training failed" };
    }

    // 4. Generate fresh insights (this also updates the AI Command Centre)
    try {
      const insights = generateInsights({
        occupancy: 0, // Will be computed inside
        avg_rate: 0,
        open_maintenance: 0,
        urgent_maintenance: 0,
        housekeeping_dirty: 0,
        total_apartments: 270,
        revenue_today: 0,
        arrivals_today: 0,
        departures_today: 0,
      });
      results.insights_count = insights.length;
    } catch {
      results.insights_count = 0;
    }

    // 4. Log the cycle
    results.duration_ms = Date.now() - startTime;
    lastSchedulerRun = results.timestamp;
    totalCycles++;

    // Store cycle in system_events
    try {
      await supabase.from("system_events").insert({
        type: "scheduler.cycle_completed",
        source_system: "scheduler",
        payload: results,
        processed: true,
        results: [],
      });
    } catch {
      // Non-critical
    }

    return results;
  } catch (e) {
    results.duration_ms = Date.now() - startTime;
    return {
      ...results,
      error: e instanceof Error ? e.message : "Scheduler cycle failed",
    };
  }
}
