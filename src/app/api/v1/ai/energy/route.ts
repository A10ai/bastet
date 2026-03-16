import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getEnergyOverview,
  getEnergyByBuilding,
  getEnergyHeatmap,
  getEnergyTimeline,
  getEnergyRecommendations,
} from "@/lib/energy-engine";

/**
 * GET /api/v1/ai/energy
 * Returns full energy dashboard data: overview, building breakdown,
 * heatmap, 24-hour timeline, and AI recommendations.
 */
export async function GET() {
  try {
    const supabase = createServerSupabaseClient();

    // Run independent queries in parallel
    const [overview, byBuilding, heatmap, recommendations] = await Promise.all([
      getEnergyOverview(supabase),
      getEnergyByBuilding(supabase),
      getEnergyHeatmap(supabase),
      getEnergyRecommendations(supabase),
    ]);

    // Timeline needs counts from overview
    const wastefulVacant = heatmap.filter(
      (c) =>
        ["available", "blocked", "out_of_service"].includes(c.status) &&
        c.is_wasteful
    ).length;

    const timeline = getEnergyTimeline(overview.occupied_units, wastefulVacant);

    return NextResponse.json({
      data: {
        overview,
        by_building: byBuilding,
        heatmap,
        timeline,
        recommendations,
      },
    });
  } catch (err) {
    console.error("[Energy API]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
