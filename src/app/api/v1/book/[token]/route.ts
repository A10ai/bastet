import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, rateLimitResponse, getClientIp } from "@/lib/rate-limit";
import { getSalesSettings, paidOnBooking, publicBookingView } from "@/lib/online-booking";
import { bookingFromToken, publicJson, notFound, publicError } from "@/lib/online-booking-http";
import { stripeConfigured } from "@/lib/stripe";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/book/:token
 *
 * Public: the state of an online booking — status, what is due now, hold
 * deadline, cancellation terms. Used by the payment page and after the
 * webhook confirms. The same token opens the guest portal (/stay/:token).
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const limit = await rateLimit(`book-status:${getClientIp(request)}`, { windowMs: 15 * 60 * 1000, max: 120 });
  if (!limit.allowed) return rateLimitResponse(limit, "Too many requests");
  const { token } = await ctx.params;
  try {
    const admin = createAdminClient();
    const found = await bookingFromToken(admin, token);
    if (!found) return notFound();
    const [settings, paid, { data: property }] = await Promise.all([
      getSalesSettings(admin, found.booking.property_id),
      paidOnBooking(admin, found.booking.id),
      admin.from("properties").select("name, phone, email, city, country").eq("id", found.booking.property_id).maybeSingle(),
    ]);
    await admin.from("booking_access_tokens").update({ last_used_at: new Date().toISOString(), use_count: found.link.use_count + 1 }).eq("id", found.link.id);
    return publicJson({ data: { booking: publicBookingView(found.booking, paid, settings), property: property ?? null, card_payments: stripeConfigured(), currencies: settings.currencies } });
  } catch (err) {
    logger.error({ err: String(err) }, "[book/:token] GET failed");
    return publicError("INTERNAL_ERROR", "Internal server error", 500);
  }
}
