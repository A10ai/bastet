import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, rateLimitResponse, getClientIp } from "@/lib/rate-limit";
import { getSalesSettings, notifyFrontDesk, paidOnBooking, publicBookingView } from "@/lib/online-booking";
import { bookingFromToken, publicJson, notFound, publicError } from "@/lib/online-booking-http";
import { stripeConfigured } from "@/lib/stripe";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/book/:token/request
 *
 * Public fallback when card payments are not configured: the guest asks
 * the property to confirm. The hold is extended to `request_hold_hours`
 * so the apartment stays reserved while staff take payment another way
 * (bank transfer, payment link) and confirm from the dashboard.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const limit = await rateLimit(`book-request:${getClientIp(request)}`, { windowMs: 15 * 60 * 1000, max: 10 });
  if (!limit.allowed) return rateLimitResponse(limit, "Too many requests");
  const { token } = await ctx.params;
  try {
    const admin = createAdminClient();
    const found = await bookingFromToken(admin, token);
    if (!found) return notFound();
    const { booking } = found;
    if (booking.status !== "pending") return publicError("INVALID_STATUS", `This booking is already ${booking.status}`, 409);
    if (stripeConfigured()) return publicError("PAY_ONLINE", "Please pay the deposit online to confirm this booking", 409);
    if (booking.hold_expires_at && new Date(booking.hold_expires_at).getTime() < Date.now()) {
      return publicError("HOLD_EXPIRED", "The hold on this booking has expired. Please search again.", 409);
    }
    const settings = await getSalesSettings(admin, booking.property_id);
    const until = new Date(Date.now() + settings.request_hold_hours * 3_600_000).toISOString();
    const { error } = await admin.from("bookings").update({ hold_expires_at: until }).eq("id", booking.id).eq("status", "pending");
    if (error) {
      logger.error({ err: error.message }, "[book/:token/request] update failed");
      return publicError("INTERNAL_ERROR", "Internal server error", 500);
    }
    await logAudit(admin, { action: "booking.request", category: "booking", resource_type: "booking", resource_id: booking.id, description: `Online booking request ${booking.reference}: confirm manually by ${until}` });
    await notifyFrontDesk(admin, booking, "Booking request to confirm", `take deposit and confirm by ${until.slice(0, 16).replace("T", " ")} UTC`);
    const paid = await paidOnBooking(admin, booking.id);
    return publicJson({ data: { booking: publicBookingView({ ...booking, hold_expires_at: until }, paid, settings), confirm_by: until } });
  } catch (err) {
    logger.error({ err: String(err) }, "[book/:token/request] failed");
    return publicError("INTERNAL_ERROR", "Internal server error", 500);
  }
}
