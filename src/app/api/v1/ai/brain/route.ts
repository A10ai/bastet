import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";
import {
  getBrainConfig,
  updateBrainConfig,
  runBrainCycle,
  getBrainHistory,
} from "@/lib/ai-brain";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();
    const config = getBrainConfig();
    const history = await getBrainHistory(supabase, 10);

    return NextResponse.json({ data: { config, history } });
  } catch (err) {
    console.error("[AI Brain API] GET error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case "run_cycle": {
        const config = getBrainConfig();
        if (!config.enabled) {
          return NextResponse.json(
            { error: "Brain is disabled" },
            { status: 400 }
          );
        }

        const result = await runBrainCycle(supabase);
        return NextResponse.json({ data: result });
      }

      case "update_config": {
        const { config } = body;
        if (!config || typeof config !== "object") {
          return NextResponse.json(
            { error: "Missing config object" },
            { status: 400 }
          );
        }

        // Only allow safe fields to be updated
        const safeUpdates: Record<string, unknown> = {};
        if (typeof config.mode === "string" && ["supervised", "autonomous"].includes(config.mode)) {
          safeUpdates.mode = config.mode;
        }
        if (typeof config.enabled === "boolean") {
          safeUpdates.enabled = config.enabled;
        }
        if (typeof config.cycle_interval_minutes === "number" && config.cycle_interval_minutes > 0) {
          safeUpdates.cycle_interval_minutes = config.cycle_interval_minutes;
        }

        const updated = updateBrainConfig(safeUpdates);
        return NextResponse.json({ data: { config: updated } });
      }

      case "approve": {
        const { decision_id } = body;
        if (!decision_id) {
          return NextResponse.json(
            { error: "Missing decision_id" },
            { status: 400 }
          );
        }

        // Get decision
        const { data: decision, error: fetchErr } = await supabase
          .from("brain_decisions")
          .select("*")
          .eq("id", decision_id)
          .single();

        if (fetchErr || !decision) {
          return NextResponse.json(
            { error: "Decision not found" },
            { status: 404 }
          );
        }

        // Mark as approved + executed
        await supabase
          .from("brain_decisions")
          .update({ approved: true, executed: true })
          .eq("id", decision_id);

        // If it has an event, emit it
        if (decision.event_type) {
          const { emitEvent } = await import("@/lib/event-bus");
          try {
            await emitEvent(
              decision.event_type,
              "ai_brain",
              decision.event_payload || {},
              supabase
            );
          } catch (err) {
            console.error("[AI Brain] Failed to emit event on approve:", err);
          }
        }

        // Update config stats
        const config = getBrainConfig();
        updateBrainConfig({ total_executed: config.total_executed + 1 });

        return NextResponse.json({ data: { approved: true, decision_id } });
      }

      case "reject": {
        const { decision_id } = body;
        if (!decision_id) {
          return NextResponse.json(
            { error: "Missing decision_id" },
            { status: 400 }
          );
        }

        const { error: rejectErr } = await supabase
          .from("brain_decisions")
          .update({ approved: false, executed: false })
          .eq("id", decision_id);

        if (rejectErr) {
          return NextResponse.json(
            { error: "Failed to reject decision" },
            { status: 500 }
          );
        }

        return NextResponse.json({ data: { rejected: true, decision_id } });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (err) {
    console.error("[AI Brain API] POST error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
