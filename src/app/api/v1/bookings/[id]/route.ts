import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";
import { validateBody, formatZodErrors, updateBookingSchema } from "@/lib/validation";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
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
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();
    const body = await request.json();

    const validation = validateBody(updateBookingSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
    }
    const validated = validation.data;

    // Only allow updating specific fields (validated already filtered unknowns)
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
      if (key in validated) {
        updates[key] = (validated as Record<string, unknown>)[key];
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

    await logAudit(supabase, {
      action: "booking.update",
      category: "booking",
      resource_type: "booking",
      resource_id: data?.id || params.id,
      description: `Updated booking ${params.id}`,
      new_data: body,
    });

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
