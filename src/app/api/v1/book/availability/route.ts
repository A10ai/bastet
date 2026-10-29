import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, rateLimitResponse, getClientIp } from "@/lib/rate-limit";
import { validateBody, formatZodErrors, onlineAvailabilitySchema } from "@/lib/validation";
import { resolvePublicProperty, getSalesSettings, searchAvailability, daysUntil, expireOnlineHolds } from "@/lib/online-booking";
import { publicJson, publicError } from "@/lib/online-booking-http";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/book/availability?property=&check_in=&check_out=&adults=&children=&rate_plan_id=
 *
 * Public availability search. Every apartment type comes back with how many
 * units are free, the price through the web channel and the deposit due,
 * or a reason it cannot be sold (sold out, party too large, not on sale).
 * The booking window and length limits are applied here so the page never
 * offers something `create_online_booking` would refuse.
 */
export async function GET(request: NextRequest) {
  const limit = await rateLimit(`book-search:${getClientIp(request)}`, { windowMs: 15 * 60 * 1000, max: 120 });
  if (!limit.allowed) return rateLimitResponse(limit, "Too many searches. Please try again in a few minutes.");
  try {
    const q = request.nextUrl.searchParams;
    const raw = Object.fromEntries(["property", "check_in", "check_out", "adults", "children", "rate_plan_id"].filter((k) => q.get(k)).map((k) => [k, q.get(k)]));
    const validation = validateBody(onlineAvailabilitySchema, raw);
    if (!validation.success) return publicError("VALIDATION", formatZodErrors(validation.error), 400);
    const input = validation.data;

    const admin = createAdminClient();
    const property = await resolvePublicProperty(admin, input.property ?? null);
    if (!property) return publicError("NOT_FOUND", "This property is not taking online bookings", 404);
    const settings = await getSalesSettings(admin, property.id);
    if (!settings.online_enabled) return publicError("ONLINE_SALES_CLOSED", "Online booking is not open yet", 503);

    const nights = daysUntil(input.check_out) - daysUntil(input.check_in);
    const lead = daysUntil(input.check_in);
    if (lead < settings.min_lead_days) return publicError("TOO_SOON", `Arrivals must be booked at least ${settings.min_lead_days} day(s) ahead`, 400);
    if (lead > settings.max_advance_days) return publicError("TOO_FAR", `Arrivals can be booked up to ${settings.max_advance_days} days ahead`, 400);
    if (nights > settings.max_nights) return publicError("MAX_NIGHTS", `Online bookings are limited to ${settings.max_nights} nights`, 400);
    if (input.adults + input.children > settings.max_guests_per_booking) return publicError("TOO_MANY_GUESTS", `At most ${settings.max_guests_per_booking} guests per booking`, 400);

    // Expired holds free their apartments before we count (the cron is daily on the hosted plan).
    await expireOnlineHolds(admin).catch(() => 0);
    const offers = await searchAvailability(admin, { propertyId: property.id, checkIn: input.check_in, checkOut: input.check_out, adults: input.adults, children: input.children, ratePlanId: input.rate_plan_id ?? null }, settings);
    return publicJson({ data: { property: { id: property.id, name: property.name, slug: property.slug }, check_in: input.check_in, check_out: input.check_out, nights, adults: input.adults, children: input.children, offers } });
  } catch (err) {
    logger.error({ err: String(err) }, "[book/availability] failed");
    return publicError("INTERNAL_ERROR", "Internal server error", 500);
  }
}
