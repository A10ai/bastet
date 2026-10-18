import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { rpcErrorResponse } from "@/lib/rpc-error";

/**
 * GET /api/v1/finance/revenue?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Room revenue recognised by stay date (each night of a stay counts on the
 * night it happens), with occupied room-nights, occupancy, ADR and RevPAR.
 * This replaces "revenue = bookings whose check-in falls in the month".
 */
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ROLES.MANAGEMENT);
  if (!auth.authenticated) return auth.error!;
  const sp = request.nextUrl.searchParams;
  const today = new Date();
  const from = sp.get("from") || new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const to = sp.get("to") || new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    return NextResponse.json({ error: "from and to must be YYYY-MM-DD with from <= to" }, { status: 400 });
  }
  if (!auth.propertyId) return NextResponse.json({ error: "No property for this staff member" }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("revenue_by_stay_date", { p_property_id: auth.propertyId, p_from: from, p_to: to });
  if (error) return rpcErrorResponse(error, "revenue_by_stay_date");

  const days = (data || []) as { stay_date: string; room_nights: number; room_revenue_gbp: number; rooms_available: number }[];
  const roomNights = days.reduce((s, d) => s + Number(d.room_nights), 0);
  const revenue = days.reduce((s, d) => s + Number(d.room_revenue_gbp), 0);
  const available = days.reduce((s, d) => s + Number(d.rooms_available), 0);
  const round = (n: number) => Math.round(n * 100) / 100;
  return NextResponse.json({
    data: {
      from, to,
      room_revenue_gbp: round(revenue),
      room_nights_sold: roomNights,
      room_nights_available: available,
      occupancy_percent: available ? round((roomNights / available) * 100) : 0,
      adr_gbp: roomNights ? round(revenue / roomNights) : 0,
      revpar_gbp: available ? round(revenue / available) : 0,
      by_day: days.map((d) => ({ ...d, room_revenue_gbp: Number(d.room_revenue_gbp) })),
    },
  });
}
