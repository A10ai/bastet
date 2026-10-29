import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, rateLimitResponse, getClientIp } from "@/lib/rate-limit";
import { validateBody, formatZodErrors, onlineBookingSchema } from "@/lib/validation";
import {
  resolvePublicProperty, getSalesSettings, upsertOnlineGuest, createOnlineBooking, issueBookingToken,
  publicBookingView, notifyFrontDesk, computeDeposit,
} from "@/lib/online-booking";
import { publicJson, publicError, requestOrigin } from "@/lib/online-booking-http";
import { rpcErrorResponse } from "@/lib/rpc-error";
import { stripeConfigured } from "@/lib/stripe";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/book
 *
 * Public: create the booking. The guest record is found or created by
 * email, `create_online_booking` picks a free apartment of the chosen type
 * and inserts a *pending* booking with a hold, and a booking token is
 * issued (returned once). The response says what to do next: pay the
 * deposit (card) or, when card payments are not configured, send a request
 * the property confirms by hand.
 *
 * If the price moved since the guest saw it (`expected_total_gbp`), the
 * booking is not made and the new total is returned (409 PRICE_CHANGED).
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = await rateLimit(`book-create:${ip}`, { windowMs: 60 * 60 * 1000, max: 10 });
  if (!limit.allowed) return rateLimitResponse(limit, "Too many booking attempts. Please try again later.");
  try {
    const body = await request.json().catch(() => null);
    const validation = validateBody(onlineBookingSchema, body);
    if (!validation.success) return publicError("VALIDATION", formatZodErrors(validation.error), 400);
    const input = validation.data;

    const admin = createAdminClient();
    const property = await resolvePublicProperty(admin, input.property ?? null);
    if (!property) return publicError("NOT_FOUND", "This property is not taking online bookings", 404);
    const settings = await getSalesSettings(admin, property.id);
    if (!settings.online_enabled) return publicError("ONLINE_SALES_CLOSED", "Online booking is not open yet", 503);
    if (!settings.currencies.includes(input.currency)) return publicError("VALIDATION", `currency must be one of ${settings.currencies.join(", ")}`, 400);

    const guest = await upsertOnlineGuest(admin, { ...input.guest, language: input.locale });

    const { booking, quote, error } = await createOnlineBooking(admin, {
      propertyId: property.id,
      apartmentTypeId: input.apartment_type_id,
      checkIn: input.check_in,
      checkOut: input.check_out,
      adults: input.adults,
      children: input.children,
      guestId: guest.id,
      ratePlanId: input.rate_plan_id ?? null,
      locale: input.locale,
      guestCurrency: input.currency,
      specialRequests: input.special_requests ?? null,
      source: input.source,
    }, settings);
    if (error || !booking) return rpcErrorResponse(error, "create_online_booking");

    // Price drift: the guest saw a different total. Release the hold straight away.
    if (input.expected_total_gbp !== undefined && Math.abs(Number(booking.total_amount_gbp) - input.expected_total_gbp) > 0.005) {
      await admin.from("bookings").update({ status: "cancelled", cancelled_at: new Date().toISOString(), hold_expires_at: null, cancellation_reason: "Price changed before confirmation" }).eq("id", booking.id);
      return publicJson({ error: { code: "PRICE_CHANGED", message: "The price has changed since you searched", new_total_gbp: Number(booking.total_amount_gbp) } }, { status: 409 });
    }

    const link = await issueBookingToken(admin, booking, requestOrigin(request));
    const view = publicBookingView(booking, 0, settings);
    const deposit = computeDeposit(Number(booking.total_amount_gbp), Number(booking.nights), settings, booking.rate_plan_snapshot);

    await logAudit(admin, {
      action: "booking.create",
      category: "booking",
      resource_type: "booking",
      resource_id: booking.id,
      description: `Online booking ${booking.reference} (${input.source}) for ${quote?.apartment_type ?? input.apartment_type_id}, ${booking.check_in} to ${booking.check_out}`,
      new_data: { source: input.source, locale: input.locale, currency: input.currency, ip },
    });
    await notifyFrontDesk(admin, booking, "Online booking (awaiting deposit)", `hold until ${booking.hold_expires_at ? new Date(booking.hold_expires_at).toISOString().slice(11, 16) : "?"} UTC`);

    return publicJson(
      {
        data: {
          token: link.token,
          manage_url: link.manage_url,
          pay_url: link.pay_url,
          booking: view,
          quote,
          deposit_gbp: deposit,
          next: stripeConfigured() ? "pay" : "request",
          card_payments: stripeConfigured(),
        },
      },
      { status: 201 }
    );
  } catch (err) {
    logger.error({ err: String(err) }, "[book] POST failed");
    return publicError("INTERNAL_ERROR", "Internal server error", 500);
  }
}
