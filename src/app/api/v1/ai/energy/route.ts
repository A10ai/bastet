import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";
import {
  getEnergyOverview,
  getEnergyByBuilding,
  getEnergyByFloorGrouped,
  getEnergyHeatmap,
  getEnergyTimeline,
  getEnergyRecommendations,
} from "@/lib/energy-engine";
import { logger } from "@/lib/logger";

/**
 * GET /api/v1/ai/energy
 * Returns full energy dashboard data: overview, building breakdown,
 * heatmap, 24-hour timeline, and AI recommendations.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();

    // Run independent queries in parallel
    const [overview, byBuilding, byFloor, heatmap, recommendations] = await Promise.all([
      getEnergyOverview(supabase),
      getEnergyByBuilding(supabase),
      getEnergyByFloorGrouped(supabase),
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
        by_floor: byFloor,
        heatmap,
        timeline,
        recommendations,
      },
    });
  } catch (err) {
    logger.error({ err }, "[Energy API]");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
