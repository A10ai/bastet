import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";

// ---------------------------------------------------------------------------
// Hardcoded realistic data for Hurghada hotel (no DB table yet)
// ---------------------------------------------------------------------------

const contracts = [
  { id: "tc1", operator: "TUI", market: "UK/Germany", status: "active", rooms_allotted: 40, rooms_used_avg: 32, fill_rate: 80, contracted_rate_gbp: 45, rack_rate_gbp: 85, discount_pct: 47, payment_terms: "prepaid", season: "Winter 2025/26", start_date: "2025-11-01", end_date: "2026-04-30", release_days: 21, min_nights: 7, commission_pct: 0, total_room_nights: 7200, used_room_nights: 5760, revenue_gbp: 259200 },
  { id: "tc2", operator: "Thomas Cook", market: "UK", status: "active", rooms_allotted: 25, rooms_used_avg: 20, fill_rate: 80, contracted_rate_gbp: 42, rack_rate_gbp: 85, discount_pct: 51, payment_terms: "credit_30", season: "Winter 2025/26", start_date: "2025-11-01", end_date: "2026-04-30", release_days: 14, min_nights: 7, commission_pct: 0, total_room_nights: 4500, used_room_nights: 3600, revenue_gbp: 151200 },
  { id: "tc3", operator: "FTI Touristik", market: "Germany", status: "active", rooms_allotted: 30, rooms_used_avg: 22, fill_rate: 73, contracted_rate_gbp: 48, rack_rate_gbp: 85, discount_pct: 44, payment_terms: "prepaid", season: "Winter 2025/26", start_date: "2025-11-01", end_date: "2026-04-30", release_days: 21, min_nights: 7, commission_pct: 0, total_room_nights: 5400, used_room_nights: 3960, revenue_gbp: 190080 },
  { id: "tc4", operator: "Coral Travel", market: "Russia/CIS", status: "active", rooms_allotted: 35, rooms_used_avg: 30, fill_rate: 86, contracted_rate_gbp: 38, rack_rate_gbp: 85, discount_pct: 55, payment_terms: "on_departure", season: "Year Round 2026", start_date: "2026-01-01", end_date: "2026-12-31", release_days: 7, min_nights: 10, commission_pct: 0, total_room_nights: 12775, used_room_nights: 10950, revenue_gbp: 416100 },
  { id: "tc5", operator: "Lemon Travel", market: "Poland/Czech", status: "pending", rooms_allotted: 15, rooms_used_avg: 0, fill_rate: 0, contracted_rate_gbp: 40, rack_rate_gbp: 85, discount_pct: 53, payment_terms: "credit_14", season: "Summer 2026", start_date: "2026-05-01", end_date: "2026-10-31", release_days: 14, min_nights: 7, commission_pct: 0, total_room_nights: 2745, used_room_nights: 0, revenue_gbp: 0 },
  { id: "tc6", operator: "Booking.com", market: "Global", status: "active", rooms_allotted: 0, rooms_used_avg: 8, fill_rate: 0, contracted_rate_gbp: 72, rack_rate_gbp: 85, discount_pct: 15, payment_terms: "commission", season: "Year Round", start_date: "2025-01-01", end_date: "2026-12-31", release_days: 0, min_nights: 1, commission_pct: 15, total_room_nights: 0, used_room_nights: 2920, revenue_gbp: 210240 },
];

function buildSummary() {
  const active = contracts.filter((c) => c.status === "active");
  const totalAllotted = contracts.reduce((s, c) => s + c.rooms_allotted, 0);
  const activeFillRates = active.filter((c) => c.fill_rate > 0);
  const avgFillRate =
    activeFillRates.length > 0
      ? Math.round(
          activeFillRates.reduce((s, c) => s + c.fill_rate, 0) /
            activeFillRates.length
        )
      : 0;
  const totalRevenue = contracts.reduce((s, c) => s + c.revenue_gbp, 0);
  const avgRate =
    Math.round(
      (contracts.reduce((s, c) => s + c.contracted_rate_gbp, 0) /
        contracts.length) *
        100
    ) / 100;
  const avgDiscount =
    Math.round(
      (contracts.reduce((s, c) => s + c.discount_pct, 0) / contracts.length) *
        100
    ) / 100;

  return {
    total_operators: contracts.length,
    active_contracts: active.length,
    total_allotted_rooms: totalAllotted,
    avg_fill_rate: avgFillRate,
    total_contracted_revenue: totalRevenue,
    avg_contracted_rate: avgRate,
    avg_discount_vs_rack: avgDiscount,
  };
}

function buildPerformance() {
  return contracts
    .filter((c) => c.status === "active")
    .map((c) => ({
      operator: c.operator,
      market: c.market,
      fill_rate: c.fill_rate,
      revenue_gbp: c.revenue_gbp,
      rooms_allotted: c.rooms_allotted,
      used_room_nights: c.used_room_nights,
      contracted_rate_gbp: c.contracted_rate_gbp,
      discount_pct: c.discount_pct,
    }))
    .sort((a, b) => b.revenue_gbp - a.revenue_gbp);
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;

    const { searchParams } = request.nextUrl;
    const type = searchParams.get("type") || "list";

    switch (type) {
      case "list":
        return NextResponse.json({ data: contracts });
      case "summary":
        return NextResponse.json({ data: buildSummary() });
      case "performance":
        return NextResponse.json({ data: buildPerformance() });
      default:
        return NextResponse.json(
          { error: `Unknown type: ${type}` },
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
