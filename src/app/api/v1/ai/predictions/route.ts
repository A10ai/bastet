import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";
import {
  forecast30Days,
  trainModel,
  getModelPerformance,
  compareWithRules,
} from "@/lib/prediction-model";

/**
 * GET /api/v1/ai/predictions?type=forecast|performance|compare|train
 *
 * Returns ML-based predictions trained on real booking data.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;

    const supabase = createServerSupabaseClient();
    const type = request.nextUrl.searchParams.get("type") || "forecast";

    switch (type) {
      case "forecast": {
        const result = await forecast30Days(supabase);
        return NextResponse.json({ data: result });
      }

      case "performance": {
        const result = await getModelPerformance(supabase);
        return NextResponse.json({ data: result });
      }

      case "compare": {
        const result = await compareWithRules(supabase);
        return NextResponse.json({ data: result });
      }

      case "train": {
        const model = await trainModel(supabase);
        return NextResponse.json({
          data: {
            model,
            message: `Model trained on ${model.training_samples} days of data. MAE: ${model.accuracy_mae}%, R²: ${model.accuracy_r_squared}`,
          },
        });
      }

      default:
        return NextResponse.json(
          { error: "Unknown type. Use: forecast, performance, compare, train" },
          { status: 400 }
        );
    }
  } catch (e) {
    console.error("Prediction API error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/ai/predictions
 * Body: { action: "train" }
 *
 * Triggers model retraining on latest data.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;

    const supabase = createServerSupabaseClient();
    const body = await request.json();

    if (body.action === "train") {
      const model = await trainModel(supabase);

      // Store trained model coefficients in system_events for audit trail
      try {
        await supabase.from("system_events").insert({
          type: "prediction.model_trained",
          source_system: "prediction-engine",
          payload: {
            model,
            triggered_by: "manual",
          },
          processed: true,
          results: [],
        });
      } catch {
        // Non-critical — logging failure should not block response
      }

      return NextResponse.json({
        data: {
          model,
          message: `Model retrained successfully on ${model.training_samples} days of data.`,
        },
      });
    }

    return NextResponse.json(
      { error: "Unknown action. Use: train" },
      { status: 400 }
    );
  } catch (e) {
    console.error("Prediction POST error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
