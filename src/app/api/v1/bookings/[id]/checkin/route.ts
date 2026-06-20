import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";
import { emitEvent } from "@/lib/event-bus";
import { logAudit } from "@/lib/audit";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();

    // Get current booking
    const { data: booking, error: fetchError } = await supabase
      .from("bookings")
      .select("id, status, apartment_id")
      .eq("id", params.id)
      .single();

    if (fetchError || !booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    if (booking.status !== "confirmed") {
      return NextResponse.json(
        { error: `Cannot check in booking with status: ${booking.status}. Must be confirmed.` },
        { status: 400 }
      );
    }

    // Update booking status
    const { data: updated, error: updateError } = await supabase
      .from("bookings")
      .update({
        status: "checked_in",
        checked_in_at: new Date().toISOString(),
      })
      .eq("id", params.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Set apartment to occupied
    await supabase
      .from("apartments")
      .update({ status: "occupied" })
      .eq("id", booking.apartment_id);

    // Emit event bus event
    await emitEvent("booking.checked_in", "bookings", {
      booking_id: booking.id,
      apartment_id: booking.apartment_id,
      guest_id: null,
    }, supabase);

    await logAudit(supabase, {
      action: "booking.checkin",
      category: "booking",
      resource_type: "booking",
      resource_id: updated?.id || params.id,
      description: `Checked in booking ${params.id}`,
      new_data: { status: "checked_in" },
    });

    return NextResponse.json({ data: updated });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
