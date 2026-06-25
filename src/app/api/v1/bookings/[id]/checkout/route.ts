import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";
import { POINTS_PER_GBP_ROOM } from "@/lib/constants";
import { emitEvent } from "@/lib/event-bus";
import { logAudit } from "@/lib/audit";
import { validateBody, formatZodErrors, checkoutSchema } from "@/lib/validation";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();
    const body = await request.json().catch(() => ({}));

    const validation = validateBody(checkoutSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
    }
    // validation successful — notes available if provided

    // Get current booking with guest info
    const { data: booking, error: fetchError } = await supabase
      .from("bookings")
      .select("id, status, apartment_id, guest_id, property_id, nights, total_amount_gbp")
      .eq("id", params.id)
      .single();

    if (fetchError || !booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    if (booking.status !== "checked_in") {
      return NextResponse.json(
        { error: `Cannot check out booking with status: ${booking.status}. Must be checked_in.` },
        { status: 400 }
      );
    }

    // 1. Update booking status
    const { data: updated, error: updateError } = await supabase
      .from("bookings")
      .update({
        status: "checked_out",
        checked_out_at: new Date().toISOString(),
      })
      .eq("id", params.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // 2. Set apartment to cleaning
    await supabase
      .from("apartments")
      .update({ status: "cleaning" })
      .eq("id", booking.apartment_id);

    // 3. Create housekeeping task (checkout_clean, priority=high)
    await supabase.from("housekeeping_tasks").insert({
      property_id: booking.property_id,
      apartment_id: booking.apartment_id,
      type: "checkout_clean",
      status: "pending",
      priority: "high",
      scheduled_date: new Date().toISOString().split("T")[0],
    });

    // 4. Update guest stats if guest exists
    if (booking.guest_id) {
      const { data: guest } = await supabase
        .from("guests")
        .select("total_stays, total_nights, total_spend_gbp, loyalty_points")
        .eq("id", booking.guest_id)
        .single();

      if (guest) {
        const pointsEarned = Math.floor(booking.total_amount_gbp * POINTS_PER_GBP_ROOM);
        const newPoints = guest.loyalty_points + pointsEarned;

        // Determine new loyalty tier
        let newTier = "bronze";
        if (newPoints >= 15000) newTier = "platinum";
        else if (newPoints >= 5000) newTier = "gold";
        else if (newPoints >= 1000) newTier = "silver";

        await supabase
          .from("guests")
          .update({
            total_stays: guest.total_stays + 1,
            total_nights: guest.total_nights + booking.nights,
            total_spend_gbp: guest.total_spend_gbp + booking.total_amount_gbp,
            loyalty_points: newPoints,
            loyalty_tier: newTier,
          })
          .eq("id", booking.guest_id);

        // 5. Insert loyalty transaction
        await supabase.from("loyalty_transactions").insert({
          guest_id: booking.guest_id,
          transaction_type: "earn",
          points: pointsEarned,
          balance_after: newPoints,
          description: `Checkout: ${booking.nights} nights, £${booking.total_amount_gbp}`,
          reference_type: "booking",
          reference_id: booking.id,
        });
      }
    }

    // 6. Emit event bus event
    await emitEvent("booking.checked_out", "bookings", {
      booking_id: booking.id,
      apartment_id: booking.apartment_id,
      guest_id: booking.guest_id,
    }, supabase);

    await logAudit(supabase, {
      action: "booking.checkout",
      category: "booking",
      resource_type: "booking",
      resource_id: updated?.id || params.id,
      description: `Checked out booking ${params.id}`,
      new_data: { status: "checked_out" },
    });

    return NextResponse.json({ data: updated });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
