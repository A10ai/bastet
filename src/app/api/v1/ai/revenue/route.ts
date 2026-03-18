import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";
import {
  getAllRevenueData,
  getWhatIfSimulation,
} from "@/lib/revenue-engine";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();
    const data = await getAllRevenueData(supabase);
    return NextResponse.json({ data });
  } catch (err) {
    console.error("[AI/Revenue] Error:", err);
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
    const {
      current_rate,
      new_rate,
      occupancy,
      elasticity = -0.5,
    } = body as {
      current_rate: number;
      new_rate: number;
      occupancy: number;
      elasticity?: number;
    };

    if (
      typeof current_rate !== "number" ||
      typeof new_rate !== "number" ||
      typeof occupancy !== "number"
    ) {
      return NextResponse.json(
        { error: "current_rate, new_rate, and occupancy are required numbers" },
        { status: 400 }
      );
    }

    const result = getWhatIfSimulation(current_rate, new_rate, occupancy, elasticity);
    return NextResponse.json({ data: result });
  } catch (err) {
    console.error("[AI/Revenue] What-If Error:", err);
    return NextResponse.json(
      { error: "Failed to run what-if simulation" },
      { status: 500 }
    );
  }
}
