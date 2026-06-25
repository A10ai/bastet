import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";
import {
  getAllRevenueData,
  getWhatIfSimulation,
} from "@/lib/revenue-engine";
import { validateBody, formatZodErrors, revenueAnalysisSchema } from "@/lib/validation";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();
    const data = await getAllRevenueData(supabase);
    return NextResponse.json({ data });
  } catch (err) {
    logger.error({ err }, "[AI/Revenue] Error");
    return NextResponse.json(
      { error: "Failed to generate revenue intelligence" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const body = await request.json();

    const validation = validateBody(revenueAnalysisSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
    }
    const {
      current_rate,
      new_rate,
      occupancy,
      elasticity = -0.5,
    } = validation.data;

    const result = getWhatIfSimulation(current_rate, new_rate, occupancy, elasticity);
    return NextResponse.json({ data: result });
  } catch (err) {
    logger.error({ err }, "[AI/Revenue] What-If Error");
    return NextResponse.json(
      { error: "Failed to run what-if simulation" },
      { status: 500 }
    );
  }
}
