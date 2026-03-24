import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";

// Commission rates by channel code
const CHANNEL_COMMISSIONS: Record<string, number> = {
  direct: 0,
  "booking.com": 0.15,
  airbnb: 0.14,
  expedia: 0.18,
  phone: 0,
  "walk-in": 0,
};

// Hardcoded OTA connection definitions
const OTA_CONNECTIONS = [
  { id: "booking_com", name: "Booking.com", logo: "B", status: "connected", commission: 15, last_sync: "2026-03-24T10:00:00Z", listings: 270 },
  { id: "airbnb", name: "Airbnb", logo: "A", status: "connected", commission: 14, last_sync: "2026-03-24T09:30:00Z", listings: 100 },
  { id: "expedia", name: "Expedia", logo: "E", status: "available", commission: 18, last_sync: null, listings: 0 },
  { id: "tripadvisor", name: "TripAdvisor", logo: "T", status: "available", commission: 12, last_sync: null, listings: 0 },
  { id: "agoda", name: "Agoda", logo: "AG", status: "available", commission: 15, last_sync: null, listings: 0 },
  { id: "direct", name: "Direct (hospitai.uk)", logo: "H", status: "connected", commission: 0, last_sync: "2026-03-24T12:00:00Z", listings: 270 },
];

// Map channel names/codes to OTA connection ids for active_bookings lookup
const CHANNEL_TO_OTA: Record<string, string> = {
  "booking.com": "booking_com",
  bookingcom: "booking_com",
  airbnb: "airbnb",
  expedia: "expedia",
  direct: "direct",
};

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "overview";

    // ── Overview: channel stats from bookings ───────────────────────────
    if (type === "overview") {
      const { data: bookings } = await supabase
        .from("bookings")
        .select("id, channel_id, total_amount_gbp, status, booking_channels(id, name, code, commission_rate)")
        .not("status", "eq", "cancelled");

      const channelMap: Record<
        string,
        { name: string; code: string; bookings_count: number; revenue_gbp: number; commission_rate: number }
      > = {};

      for (const b of bookings || []) {
        const ch = b.booking_channels as unknown as { id: string; name: string; code: string; commission_rate: number } | null;
        const name = ch?.name || "Unknown";
        const code = (ch?.code || "unknown").toLowerCase();
        const commissionRate = CHANNEL_COMMISSIONS[code] ?? ch?.commission_rate ?? 0;

        if (!channelMap[name]) {
          channelMap[name] = { name, code, bookings_count: 0, revenue_gbp: 0, commission_rate: commissionRate };
        }
        channelMap[name].bookings_count += 1;
        channelMap[name].revenue_gbp += b.total_amount_gbp || 0;
      }

      const channels = Object.values(channelMap).map((ch) => {
        const connectedCodes = ["direct", "booking.com", "airbnb"];
        return {
          name: ch.name,
          bookings_count: ch.bookings_count,
          revenue_gbp: Math.round(ch.revenue_gbp * 100) / 100,
          commission_gbp: Math.round(ch.revenue_gbp * ch.commission_rate * 100) / 100,
          commission_rate: ch.commission_rate,
          status: connectedCodes.includes(ch.code) ? "connected" : "available",
        };
      });

      const total_bookings = channels.reduce((s, c) => s + c.bookings_count, 0);
      const total_revenue_gbp = Math.round(channels.reduce((s, c) => s + c.revenue_gbp, 0) * 100) / 100;
      const total_commission_gbp = Math.round(channels.reduce((s, c) => s + c.commission_gbp, 0) * 100) / 100;
      const directBookings = channels.find((c) => c.name.toLowerCase().includes("direct"))?.bookings_count || 0;
      const direct_ratio_pct = total_bookings > 0 ? Math.round((directBookings / total_bookings) * 100) : 0;

      return NextResponse.json({
        data: { channels, total_bookings, total_revenue_gbp, total_commission_gbp, direct_ratio_pct },
      });
    }

    // ── Rates: current rates and availability ───────────────────────────
    if (type === "rates") {
      const { data: types } = await supabase
        .from("apartment_types")
        .select("id, name, base_weekly_rate_gbp");

      const { data: apartments } = await supabase
        .from("apartments")
        .select("id, apartment_type_id, status");

      const rates = (types || []).map((t) => {
        const apts = (apartments || []).filter((a) => a.apartment_type_id === t.id);
        const available_count = apts.filter((a) => a.status === "available").length;
        const base_rate_gbp = Math.round((t.base_weekly_rate_gbp / 7) * 100) / 100;
        return {
          type: t.name,
          base_rate_gbp,
          available_count,
          total_count: apts.length,
        };
      });

      return NextResponse.json({ data: { rates } });
    }

    // ── Performance: channel performance comparison ─────────────────────
    if (type === "performance") {
      const { data: bookings } = await supabase
        .from("bookings")
        .select("id, channel_id, total_amount_gbp, nights, status, booking_channels(id, name, code)")

      const channelPerf: Record<
        string,
        { name: string; total_revenue: number; total_nights: number; count: number; cancelled: number; total_all: number }
      > = {};

      for (const b of bookings || []) {
        const ch = b.booking_channels as unknown as { id: string; name: string; code: string } | null;
        const name = ch?.name || "Unknown";

        if (!channelPerf[name]) {
          channelPerf[name] = { name, total_revenue: 0, total_nights: 0, count: 0, cancelled: 0, total_all: 0 };
        }
        channelPerf[name].total_all += 1;

        if (b.status === "cancelled") {
          channelPerf[name].cancelled += 1;
        } else {
          channelPerf[name].count += 1;
          channelPerf[name].total_revenue += b.total_amount_gbp || 0;
          channelPerf[name].total_nights += b.nights || 0;
        }
      }

      const performance = Object.values(channelPerf).map((ch) => ({
        channel: ch.name,
        bookings_count: ch.count,
        avg_booking_value_gbp: ch.count > 0 ? Math.round((ch.total_revenue / ch.count) * 100) / 100 : 0,
        avg_nights: ch.count > 0 ? Math.round((ch.total_nights / ch.count) * 10) / 10 : 0,
        cancellation_rate: ch.total_all > 0 ? Math.round((ch.cancelled / ch.total_all) * 100) / 100 : 0,
        total_revenue_gbp: Math.round(ch.total_revenue * 100) / 100,
      }));

      return NextResponse.json({ data: { performance } });
    }

    // ── Connections: OTA connection list with live active_bookings ───────
    if (type === "connections") {
      // Count active bookings per channel from real data
      const { data: bookings } = await supabase
        .from("bookings")
        .select("id, channel_id, status, booking_channels(id, name, code)")
        .in("status", ["confirmed", "checked_in", "pending"]);

      const activeByOta: Record<string, number> = {};
      for (const b of bookings || []) {
        const ch = b.booking_channels as unknown as { id: string; name: string; code: string } | null;
        const code = (ch?.code || "").toLowerCase();
        const otaId = CHANNEL_TO_OTA[code];
        if (otaId) {
          activeByOta[otaId] = (activeByOta[otaId] || 0) + 1;
        }
      }

      const connections = OTA_CONNECTIONS.map((conn) => ({
        ...conn,
        active_bookings: activeByOta[conn.id] || 0,
      }));

      return NextResponse.json({ data: { connections } });
    }

    return NextResponse.json(
      { error: "Invalid type parameter. Use: overview, rates, performance, connections" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[channels] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch channel data" },
      { status: 500 }
    );
  }
}
