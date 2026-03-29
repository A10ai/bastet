import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";

// ─── Hardcoded F&B data for Bastet Hurghada aparthotel ───
// Will be replaced with Supabase queries once F&B tables are created

const OUTLETS = [
  { id: "rest1", name: "Bastet Restaurant", type: "restaurant", location: "Ground Floor", status: "open", covers_today: 145, revenue_today_gbp: 1240, avg_spend_gbp: 8.55 },
  { id: "bar1", name: "Rooftop Lounge", type: "bar", location: "Rooftop", status: "open", covers_today: 62, revenue_today_gbp: 890, avg_spend_gbp: 14.35 },
  { id: "bar2", name: "Pool Bar", type: "bar", location: "Pool Deck", status: "open", covers_today: 48, revenue_today_gbp: 420, avg_spend_gbp: 8.75 },
];

const MENU_CATEGORIES = [
  { category: "Breakfast Buffet", outlet: "Bastet Restaurant", items: 35, avg_price_gbp: 0, note: "Included with room" },
  { category: "Starters", outlet: "Bastet Restaurant", items: 12, avg_price_gbp: 4.50 },
  { category: "Main Courses", outlet: "Bastet Restaurant", items: 18, avg_price_gbp: 8.50 },
  { category: "Desserts", outlet: "Bastet Restaurant", items: 8, avg_price_gbp: 3.50 },
  { category: "Cocktails", outlet: "Rooftop Lounge", items: 15, avg_price_gbp: 7.00 },
  { category: "Spirits & Wine", outlet: "Rooftop Lounge", items: 25, avg_price_gbp: 5.50 },
  { category: "Bar Snacks", outlet: "Rooftop Lounge", items: 10, avg_price_gbp: 4.00 },
  { category: "Soft Drinks", outlet: "Pool Bar", items: 12, avg_price_gbp: 2.50 },
  { category: "Light Meals", outlet: "Pool Bar", items: 8, avg_price_gbp: 6.00 },
  { category: "Shisha", outlet: "Rooftop Lounge", items: 8, avg_price_gbp: 8.00 },
];

const DAILY_TREND = [
  { date: "2026-03-22", restaurant_gbp: 1180, rooftop_gbp: 820, pool_bar_gbp: 380, room_service_gbp: 250 },
  { date: "2026-03-23", restaurant_gbp: 1350, rooftop_gbp: 950, pool_bar_gbp: 420, room_service_gbp: 310 },
  { date: "2026-03-24", restaurant_gbp: 1100, rooftop_gbp: 780, pool_bar_gbp: 350, room_service_gbp: 220 },
  { date: "2026-03-25", restaurant_gbp: 1050, rooftop_gbp: 720, pool_bar_gbp: 310, room_service_gbp: 195 },
  { date: "2026-03-26", restaurant_gbp: 1120, rooftop_gbp: 810, pool_bar_gbp: 370, room_service_gbp: 240 },
  { date: "2026-03-27", restaurant_gbp: 1420, rooftop_gbp: 1020, pool_bar_gbp: 460, room_service_gbp: 330 },
  { date: "2026-03-28", restaurant_gbp: 1480, rooftop_gbp: 1080, pool_bar_gbp: 490, room_service_gbp: 350 },
];

const PERFORMANCE = {
  outlets: [
    {
      id: "rest1",
      name: "Bastet Restaurant",
      revenue_per_cover_gbp: 8.55,
      table_turnover: 2.4,
      peak_hours: ["07:00-09:30", "12:30-14:00", "19:00-21:30"],
      top_items: [
        { name: "Grilled Sea Bass", orders: 38, revenue_gbp: 342 },
        { name: "Egyptian Mixed Grill", orders: 32, revenue_gbp: 288 },
        { name: "Koshari", orders: 28, revenue_gbp: 140 },
        { name: "Molokhia with Rice", orders: 25, revenue_gbp: 150 },
        { name: "Umm Ali", orders: 22, revenue_gbp: 77 },
      ],
      avg_table_time_mins: 52,
      covers_capacity_pct: 72,
    },
    {
      id: "bar1",
      name: "Rooftop Lounge",
      revenue_per_cover_gbp: 14.35,
      table_turnover: 1.8,
      peak_hours: ["18:00-20:00", "21:30-23:30"],
      top_items: [
        { name: "Sunset Spritz", orders: 24, revenue_gbp: 192 },
        { name: "Shisha (Double Apple)", orders: 18, revenue_gbp: 144 },
        { name: "Mojito", orders: 16, revenue_gbp: 112 },
        { name: "Red Sea Breeze", orders: 14, revenue_gbp: 112 },
        { name: "Mezze Platter", orders: 12, revenue_gbp: 72 },
      ],
      avg_table_time_mins: 78,
      covers_capacity_pct: 65,
    },
    {
      id: "bar2",
      name: "Pool Bar",
      revenue_per_cover_gbp: 8.75,
      table_turnover: 3.2,
      peak_hours: ["11:00-13:00", "15:00-17:00"],
      top_items: [
        { name: "Fresh Mango Juice", orders: 35, revenue_gbp: 87.50 },
        { name: "Club Sandwich", orders: 22, revenue_gbp: 132 },
        { name: "Caesar Salad", orders: 18, revenue_gbp: 90 },
        { name: "Frozen Daiquiri", orders: 15, revenue_gbp: 60 },
        { name: "Falafel Wrap", orders: 14, revenue_gbp: 70 },
      ],
      avg_table_time_mins: 35,
      covers_capacity_pct: 58,
    },
  ],
  summary: {
    best_performer: "Rooftop Lounge",
    best_performer_metric: "Highest revenue per cover (14.35 GBP)",
    highest_turnover: "Pool Bar",
    highest_turnover_rate: 3.2,
    busiest_period: "Friday & Saturday evenings",
    waste_pct: 4.2,
    staff_to_cover_ratio: 1.12,
  },
};

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    // supabase client available for future F&B table queries
    const _supabase = createServerSupabaseClient();

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "overview";

    switch (type) {
      case "overview": {
        return NextResponse.json({
          data: {
            outlets: OUTLETS,
            total_revenue_today_gbp: 2550,
            total_covers_today: 255,
            breakfast_included_count: 120,
            breakfast_paid_count: 25,
            room_service_orders: 18,
            room_service_revenue_gbp: 285,
            food_cost_pct: 32,
            beverage_cost_pct: 24,
            revenue_vs_yesterday_pct: 8.5,
            monthly_revenue_gbp: 68500,
            monthly_food_cost_gbp: 21920,
            monthly_beverage_cost_gbp: 5480,
            gop_fbp_gbp: 41100,
            revenue_per_occupied_room_gbp: 13.78,
          },
        });
      }

      case "menu": {
        return NextResponse.json({ data: MENU_CATEGORIES });
      }

      case "daily_trend": {
        return NextResponse.json({ data: DAILY_TREND });
      }

      case "performance": {
        return NextResponse.json({ data: PERFORMANCE });
      }

      default: {
        return NextResponse.json(
          { error: `Unknown type "${type}". Valid types: overview, menu, daily_trend, performance` },
          { status: 400 }
        );
      }
    }
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
