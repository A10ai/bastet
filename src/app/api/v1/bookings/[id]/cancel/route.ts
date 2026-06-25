import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";
import { validateBody, formatZodErrors, cancelBookingSchema } from "@/lib/validation";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();
    const body = await request.json().catch(() => ({}));

    const validation = validateBody(cancelBookingSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
    }
    const { cancellation_reason, reason } = validation.data;
    const cancellationReason = cancellation_reason || reason;

    // Get current booking
    const { data: booking, error: fetchError } = await supabase
      .from("bookings")
      .select("id, status, apartment_id")
      .eq("id", params.id)
      .single();

    if (fetchError || !booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    const cancellableStatuses = ["pending", "confirmed"];
    if (!cancellableStatuses.includes(booking.status)) {
      return NextResponse.json(
        { error: `Cannot cancel booking with status: ${booking.status}. Must be pending or confirmed.` },
        { status: 400 }
      );
    }

    // Update booking
    const { data: updated, error: updateError } = await supabase
      .from("bookings")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancellation_reason: cancellationReason || null,
      })
      .eq("id", params.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    await logAudit(supabase, {
      action: "booking.cancel",
      category: "booking",
      resource_type: "booking",
      resource_id: updated?.id || params.id,
      description: `Cancelled booking ${params.id}`,
      new_data: body,
    });

    return NextResponse.json({ data: updated });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
