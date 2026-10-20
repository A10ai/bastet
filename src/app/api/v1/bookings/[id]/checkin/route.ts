import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { emitEvent } from "@/lib/event-bus";
import { logAudit } from "@/lib/audit";
import { validateBody, formatZodErrors, checkinSchema } from "@/lib/validation";
import { rpcErrorResponse } from "@/lib/rpc-error";
import { logger } from "@/lib/logger";

/**
 * POST /api/v1/bookings/:id/checkin
 *
 * Runs `checkin_booking()` (migration 00020): one transaction that locks the
 * booking, requires status=confirmed, a guest on file, arrival date reached
 * in the property's business date, and an available (clean) apartment.
 */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await requireRole(request, ROLES.FRONT_DESK);
    if (!auth.authenticated) return auth.error!;
    const supabase = await createServerSupabaseClient();
    const body = await request.json().catch(() => ({}));

    const validation = validateBody(checkinSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
    }

    const { data: booking, error } = await supabase.rpc("checkin_booking", {
      p_booking_id: params.id,
      p_notes: validation.data.notes ?? null,
    });

    if (error) return rpcErrorResponse(error, "checkin_booking");

    const b = booking as { id: string; apartment_id: string; guest_id: string | null; property_id: string };

    // Downstream side effects (notifications, VIP handling). The core state
    // change is already committed; handler failures are recorded, not fatal.
    await emitEvent(
      "booking.checked_in",
      "bookings",
      { booking_id: b.id, apartment_id: b.apartment_id, guest_id: b.guest_id },
      supabase
    );

    await logAudit(supabase, {
      user_id: auth.userId,
      user_email: auth.email,
      action: "booking.checkin",
      category: "booking",
      resource_type: "booking",
      resource_id: b.id,
      description: `Checked in booking ${b.id}`,
      new_data: { status: "checked_in" },
    });

    return NextResponse.json({ data: booking });
  } catch (err) {
    logger.error({ err: String(err) }, "[bookings/checkin] unhandled");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
