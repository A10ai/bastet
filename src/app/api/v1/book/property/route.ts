import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, rateLimitResponse, getClientIp } from "@/lib/rate-limit";
import { resolvePublicProperty, getSalesSettings, listPublicApartmentTypes } from "@/lib/online-booking";
import { publicJson, publicError } from "@/lib/online-booking-http";
import { stripeConfigured } from "@/lib/stripe";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/book/property?property=<slug|id>
 *
 * Public: what the booking page needs before a search — the property card,
 * its apartment types with images, and the online-sales policy the guest
 * must know (deposit, hold time, booking window, currencies, terms). The
 * property defaults to PROPERTY_ID / the first property. Only properties in
 * pre_opening or active status are public.
 */
export async function GET(request: NextRequest) {
  const limit = await rateLimit(`book-property:${getClientIp(request)}`, { windowMs: 15 * 60 * 1000, max: 120 });
  if (!limit.allowed) return rateLimitResponse(limit, "Too many requests");
  try {
    const admin = createAdminClient();
    const property = await resolvePublicProperty(admin, request.nextUrl.searchParams.get("property"));
    if (!property) return publicError("NOT_FOUND", "This property is not taking online bookings", 404);
    const [settings, types] = await Promise.all([getSalesSettings(admin, property.id), listPublicApartmentTypes(admin, property.id)]);
    return publicJson({
      data: {
        property,
        apartment_types: types,
        policy: {
          online_enabled: settings.online_enabled,
          deposit_percent: settings.deposit_percent,
          hold_minutes: settings.hold_minutes,
          min_lead_days: settings.min_lead_days,
          max_advance_days: settings.max_advance_days,
          max_nights: settings.max_nights,
          max_guests_per_booking: settings.max_guests_per_booking,
          currencies: settings.currencies,
          terms_url: settings.terms_url,
          card_payments: stripeConfigured(),
        },
      },
    });
  } catch (err) {
    logger.error({ err: String(err) }, "[book/property] failed");
    return publicError("INTERNAL_ERROR", "Internal server error", 500);
  }
}
