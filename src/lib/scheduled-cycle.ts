import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runBrainCycle, getBrainConfig } from "@/lib/ai-brain";
import { runAllAutomations } from "@/lib/automations-engine";
import { trainModel } from "@/lib/prediction-model";
import { expireOnlineHolds } from "@/lib/online-booking";
import { pushAllConnections } from "@/lib/channel-manager";
import { runPricingAgentForAllProperties } from "@/lib/pricing-agent";
import { runWeeklyProofReports } from "@/lib/sales-ops";
import { logger } from "@/lib/logger";

export interface CycleResults {
  brain: unknown;
  automations: unknown;
  predictions: unknown;
  online_holds: unknown;
  channel_push: unknown;
  pricing_agent: unknown;
  weekly_report: unknown;
  duration_ms: number;
  timestamp: string;
  error?: string;
}

/**
 * One scheduled intelligence cycle: AI brain, automations, model retraining.
 * Invoked by /api/v1/cron/automations (Vercel Cron) or manually by an admin.
 * It never uses timers or module state, so it is safe on serverless.
 */
export async function runScheduledCycle(supabase: SupabaseClient, actor = "cron"): Promise<CycleResults> {
  const startTime = Date.now();
  const results: CycleResults = {
    brain: null,
    automations: null,
    predictions: null,
    online_holds: null,
    channel_push: null,
    pricing_agent: null,
    weekly_report: null,
    duration_ms: 0,
    timestamp: new Date().toISOString(),
  };

  try {
    const brainConfig = await getBrainConfig();
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

    // Unpaid website holds past their deadline give the inventory back.
    try {
      results.online_holds = { expired: await expireOnlineHolds(supabase) };
    } catch (e) {
      results.online_holds = { error: e instanceof Error ? e.message : "Hold expiry failed" };
    }

    // Pricing agent: one recommendation batch per property per day, before
    // the ARI push so approved or auto-applied rates reach the channels.
    try {
      results.pricing_agent = await runPricingAgentForAllProperties(supabase);
    } catch (e) {
      results.pricing_agent = { error: e instanceof Error ? e.message : "Pricing agent failed" };
    }

    // Last week's proof report, stored once per property (idempotent).
    try {
      results.weekly_report = await runWeeklyProofReports(supabase);
    } catch (e) {
      results.weekly_report = { error: e instanceof Error ? e.message : "Weekly report failed" };
    }

    // Availability and rates to every active OTA connection.
    try {
      const pushes = await pushAllConnections(supabase);
      results.channel_push = { connections: pushes.length, processed: pushes.filter((p) => p.status === "processed").length, failed: pushes.filter((p) => p.status === "failed").map((p) => ({ id: p.connection_id, error: p.error })) };
    } catch (e) {
      results.channel_push = { error: e instanceof Error ? e.message : "Channel push failed" };
    }

    results.duration_ms = Date.now() - startTime;

    const { error } = await supabase.from("system_events").insert({
      type: "scheduler.cycle_completed",
      source_system: "scheduler",
      payload: { ...results, actor },
      processed: true,
      results: [],
    });
    if (error) logger.warn({ err: error.message }, "[scheduled-cycle] could not record cycle");

    return results;
  } catch (e) {
    results.duration_ms = Date.now() - startTime;
    return { ...results, error: e instanceof Error ? e.message : "Scheduler cycle failed" };
  }
}

/** Most recent recorded cycle, for status displays. */
export async function getLastCycle(supabase: SupabaseClient): Promise<{ at: string; payload: unknown } | null> {
  const { data } = await supabase
    .from("system_events")
    .select("created_at, payload")
    .eq("type", "scheduler.cycle_completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { at: data.created_at as string, payload: data.payload } : null;
}
