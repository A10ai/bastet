import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES, roleAtLeast } from "@/lib/api-auth";
import { POINTS_PER_GBP_ROOM } from "@/lib/constants";
import { emitEvent } from "@/lib/event-bus";
import { logAudit } from "@/lib/audit";
import { validateBody, formatZodErrors, checkoutSchema } from "@/lib/validation";
import { rpcErrorResponse } from "@/lib/rpc-error";
import { logger } from "@/lib/logger";

/**
 * POST /api/v1/bookings/:id/checkout
 *
 * Runs `checkout_booking()` (migration 00020): one transaction that closes the
 * booking, sets the apartment to cleaning, creates exactly one housekeeping
 * task on the property's business date, and posts loyalty points.
 *
 * An outstanding invoice balance blocks check-out unless a manager or above
 * sends `allow_outstanding_balance: true`.
 */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await requireRole(request, ROLES.FRONT_DESK);
    if (!auth.authenticated) return auth.error!;
    const supabase = await createServerSupabaseClient();
    const body = await request.json().catch(() => ({}));

    const validation = validateBody(checkoutSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
    }

    const allowBalance =
      validation.data.allow_outstanding_balance === true && roleAtLeast(auth.role, "manager");

    const { data: result, error } = await supabase.rpc("checkout_booking", {
      p_booking_id: params.id,
      p_notes: validation.data.notes ?? null,
      p_allow_outstanding_balance: allowBalance,
      p_points_per_gbp: POINTS_PER_GBP_ROOM,
    });

    if (error) return rpcErrorResponse(error, "checkout_booking");

    const r = result as {
      booking: { id: string; apartment_id: string; guest_id: string | null };
      housekeeping_task_id: string;
      points_earned: number;
      outstanding_gbp: number;
    };

    // The housekeeping task and room status are already committed by the
    // function; the event handler only notifies (see event-bus.ts).
    await emitEvent(
      "booking.checked_out",
      "bookings",
      {
        booking_id: r.booking.id,
        apartment_id: r.booking.apartment_id,
        guest_id: r.booking.guest_id,
        housekeeping_task_id: r.housekeeping_task_id,
      },
      supabase
    );

    await logAudit(supabase, {
      user_id: auth.userId,
      user_email: auth.email,
      action: "booking.checkout",
      category: "booking",
      resource_type: "booking",
      resource_id: r.booking.id,
      description: `Checked out booking ${r.booking.id}`,
      new_data: {
        status: "checked_out",
        points_earned: r.points_earned,
        outstanding_gbp: r.outstanding_gbp,
        balance_override: allowBalance && r.outstanding_gbp > 0,
      },
    });

    return NextResponse.json({
      data: r.booking,
      meta: { points_earned: r.points_earned, outstanding_gbp: r.outstanding_gbp },
    });
  } catch (err) {
    logger.error({ err: String(err) }, "[bookings/checkout] unhandled");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
