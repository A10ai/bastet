import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, rateLimitResponse, getClientIp } from "@/lib/rate-limit";
import { validateBody, formatZodErrors, onlineCancelSchema } from "@/lib/validation";
import { cancellationAssessment, getSalesSettings, notifyFrontDesk, paidOnBooking, publicBookingView } from "@/lib/online-booking";
import { bookingFromToken, publicJson, notFound, publicError } from "@/lib/online-booking-http";
import { emitEvent } from "@/lib/event-bus";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/book/:token/cancel  { reason? }
 *
 * Public: the guest cancels online while the rate plan allows it free of
 * charge (or while nothing has been paid). Inside the penalty window, or
 * on a non-refundable rate, the request is refused with the terms and the
 * guest is asked to contact the property. Refunds of a paid deposit are
 * raised for staff: the money moves only through the finance screens.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const limit = await rateLimit(`book-cancel:${getClientIp(request)}`, { windowMs: 15 * 60 * 1000, max: 10 });
  if (!limit.allowed) return rateLimitResponse(limit, "Too many requests");
  const { token } = await ctx.params;
  try {
    const body = await request.json().catch(() => ({}));
    const validation = validateBody(onlineCancelSchema, body ?? {});
    if (!validation.success) return publicError("VALIDATION", formatZodErrors(validation.error), 400);

    const admin = createAdminClient();
    const found = await bookingFromToken(admin, token);
    if (!found) return notFound();
    const { booking } = found;
    const paid = await paidOnBooking(admin, booking.id);
    const assessment = cancellationAssessment(booking, paid);
    if (!assessment.allowed) return publicJson({ error: { code: "CANCELLATION_NOT_ALLOWED", message: assessment.reason } }, { status: 409 });

    const reason = `Cancelled by guest online${validation.data.reason ? `: ${validation.data.reason}` : ""}`;
    const { error } = await admin
      .from("bookings")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString(), hold_expires_at: null, cancellation_reason: reason })
      .eq("id", booking.id)
      .in("status", ["pending", "confirmed"]);
    if (error) {
      logger.error({ err: error.message }, "[book/:token/cancel] update failed");
      return publicError("INTERNAL_ERROR", "Internal server error", 500);
    }
    await logAudit(admin, { action: "booking.cancel", category: "booking", resource_type: "booking", resource_id: booking.id, description: `${reason} (${booking.reference}); paid ${paid.toFixed(2)} GBP` });
    if (paid > 0) await notifyFrontDesk(admin, booking, "Refund due: guest cancelled online", `${paid.toFixed(2)} GBP paid, free cancellation applied`);
    await emitEvent("booking.cancelled", "online-booking", { booking_id: booking.id, reference: booking.reference, paid_gbp: paid, by: "guest" }, admin).catch(() => undefined);

    const settings = await getSalesSettings(admin, booking.property_id);
    return publicJson({ data: { booking: publicBookingView({ ...booking, status: "cancelled", hold_expires_at: null }, paid, settings), refund_due_gbp: paid } });
  } catch (err) {
    logger.error({ err: String(err) }, "[book/:token/cancel] failed");
    return publicError("INTERNAL_ERROR", "Internal server error", 500);
  }
}
