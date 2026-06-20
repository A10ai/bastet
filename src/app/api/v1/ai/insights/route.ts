import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";
import { format } from "date-fns";
import {
  generateInsights,
  generatePricingRecommendations,
  generateOccupancyForecast,
  calculateHealthScore,
} from "@/lib/ai-engine";
import { forecast30Days } from "@/lib/prediction-model";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();
    const today = format(new Date(), "yyyy-MM-dd");

    // Gather operational data in parallel
    const [
      apartmentsRes,
      arrivalsRes,
      departuresRes,
      maintenanceRes,
      urgentRes,
      hkRes,
      ratesRes,
      revenueRes,
    ] = await Promise.all([
      supabase.from("apartments").select("id, status"),
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .in("status", ["confirmed", "checked_in"])
        .eq("check_in", today),
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .in("status", ["checked_in", "checked_out"])
        .eq("check_out", today),
      supabase
        .from("maintenance_requests")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "assigned", "in_progress"]),
      supabase
        .from("maintenance_requests")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "assigned", "in_progress"])
        .in("priority", ["urgent", "emergency"]),
      supabase
        .from("housekeeping_tasks")
        .select("status")
        .eq("scheduled_date", today),
      supabase.from("apartment_types").select("name, base_weekly_rate_gbp"),
      supabase
        .from("bookings")
        .select("total_amount_gbp, nights")
        .eq("status", "checked_in")
        .lte("check_in", today)
        .gt("check_out", today),
    ]);

    const apartments = apartmentsRes.data || [];
    const totalApartments = apartments.length;
    const occupiedCount = apartments.filter((a) => a.status === "occupied").length;
    const occupancy = totalApartments > 0 ? Math.round((occupiedCount / totalApartments) * 100) : 0;

    const hkDirty = (hkRes.data || []).filter(
      (t) => t.status === "pending" || t.status === "assigned"
    ).length;

    const revenueToday = (revenueRes.data || []).reduce((sum, b) => {
      return sum + (b.nights > 0 ? b.total_amount_gbp / b.nights : 0);
    }, 0);

    // Average rate
    const rates = (ratesRes.data || []).map((r) => ({
      type: r.name,
      rate: r.base_weekly_rate_gbp,
    }));
    const avgRate =
      rates.length > 0
        ? rates.reduce((s, r) => s + r.rate, 0) / rates.length
        : 75;

    const operationalData = {
      occupancy,
      avg_rate: avgRate,
      open_maintenance: maintenanceRes.count || 0,
      urgent_maintenance: urgentRes.count || 0,
      housekeeping_dirty: hkDirty,
      total_apartments: totalApartments,
      revenue_today: Math.round(revenueToday * 100) / 100,
      arrivals_today: arrivalsRes.count || 0,
      departures_today: departuresRes.count || 0,
    };

    // Run AI engine
    const insights = generateInsights(operationalData);
    const pricingRecommendations = generatePricingRecommendations(occupancy, rates);
    const healthScore = calculateHealthScore({
      occupancy,
      urgent_maintenance: operationalData.urgent_maintenance,
      housekeeping_dirty: hkDirty,
      total_apartments: totalApartments,
    });

    // Try ML-based forecast, fall back to rule-based
    let occupancyForecast;
    try {
      const mlForecast = await forecast30Days(supabase);
      // Convert ML predictions to the OccupancyForecast interface
      occupancyForecast = mlForecast.predictions.slice(0, 14).map((p) => ({
        date: p.date,
        predicted_occupancy: Math.round(p.predicted_occupancy_pct),
        confidence: Math.round(100 - mlForecast.model.accuracy_mae),
        factors: p.factors,
      }));
    } catch {
      // Fallback to rule-based if ML model fails
      occupancyForecast = generateOccupancyForecast(
        occupancy,
        operationalData.arrivals_today,
        operationalData.departures_today
      );
    }

    // Calculate aggregate stats
    const revenueOpportunity = pricingRecommendations.reduce((sum, r) => {
      if (r.change_percent > 0) {
        return sum + (r.recommended_rate - r.current_rate) * 7; // 7-day projection
      }
      return sum;
    }, 0);

    const energySavings =
      occupancy < 60 ? Math.round((100 - occupancy) * 1.8 * 30) : 0;

    const avg7dOccupancy =
      occupancyForecast.slice(0, 7).reduce((s, f) => s + f.predicted_occupancy, 0) / 7;

    return NextResponse.json({
      data: {
        insights,
        pricing_recommendations: pricingRecommendations,
        occupancy_forecast: occupancyForecast,
        health_score: healthScore,
        stats: {
          total_insights: insights.length,
          revenue_opportunity: Math.round(revenueOpportunity),
          energy_savings_potential: energySavings,
          predicted_occupancy_7d: Math.round(avg7dOccupancy),
          ai_actions_taken: insights.filter((i) => i.severity !== "info").length,
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
