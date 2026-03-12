import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("bookings")
      .select(`
        *,
        guest:guests(id, first_name, last_name, email, phone, loyalty_tier, vip_status, total_stays, total_nights, total_spend_gbp),
        apartment:apartments(id, number, floor, view_type, status, building:buildings(id, name, code), apartment_type:apartment_types(id, name, bedrooms, max_occupancy, base_weekly_rate_gbp, amenities)),
        channel:booking_channels(id, name, code, commission_rate)
      `)
      .eq("id", params.id)
      .single();

    if (error) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerSupabaseClient();
    const body = await request.json();

    // Only allow updating specific fields
    const allowedFields = [
      "status",
      "adults",
      "children",
      "infants",
      "special_requests",
      "internal_notes",
      "guest_id",
      "channel_id",
    ];
    const updates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in body) {
        updates[key] = body[key];
      }
    }

    // If confirming, set status
    if (updates.status === "confirmed") {
      // Verify current status is pending
      const { data: current } = await supabase
        .from("bookings")
        .select("status")
        .eq("id", params.id)
        .single();

      if (current?.status !== "pending") {
        return NextResponse.json(
          { error: `Cannot confirm booking with status: ${current?.status}` },
          { status: 400 }
        );
      }
    }

    const { data, error } = await supabase
      .from("bookings")
      .update(updates)
      .eq("id", params.id)
      .select(`
        *,
        guest:guests(id, first_name, last_name, email),
        apartment:apartments(id, number, building:buildings(id, name, code)),
        channel:booking_channels(id, name, code)
      `)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
