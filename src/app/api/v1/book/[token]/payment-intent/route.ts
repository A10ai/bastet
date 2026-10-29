import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, rateLimitResponse, getClientIp } from "@/lib/rate-limit";
import { validateBody, formatZodErrors, onlinePaymentIntentSchema } from "@/lib/validation";
import { getSalesSettings, paidOnBooking, computeDeposit, round2 } from "@/lib/online-booking";
import { bookingFromToken, publicJson, notFound, publicError } from "@/lib/online-booking-http";
import { stripeConfigured, createDepositIntent } from "@/lib/stripe";
import { convertCurrency } from "@/lib/booking-engine";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/book/:token/payment-intent  { currency? }
 *
 * Public: a Stripe PaymentIntent for the deposit still due on a pending
 * booking, in the guest's currency at the latest stored FX rate (GBP when
 * no rate is known). Idempotent per booking and amount, so reloading the
 * page reuses the intent. Returns the client secret for the Payment Element.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const limit = await rateLimit(`book-pay:${getClientIp(request)}`, { windowMs: 15 * 60 * 1000, max: 30 });
  if (!limit.allowed) return rateLimitResponse(limit, "Too many requests");
  const { token } = await ctx.params;
  try {
    if (!stripeConfigured()) return publicError("PAYMENTS_UNAVAILABLE", "Card payments are not available right now", 503);
    const body = await request.json().catch(() => ({}));
    const validation = validateBody(onlinePaymentIntentSchema, body ?? {});
    if (!validation.success) return publicError("VALIDATION", formatZodErrors(validation.error), 400);

    const admin = createAdminClient();
    const found = await bookingFromToken(admin, token);
    if (!found) return notFound();
    const { booking } = found;
    if (booking.status !== "pending") return publicError("INVALID_STATUS", `This booking is already ${booking.status}`, 409);
    if (booking.hold_expires_at && new Date(booking.hold_expires_at).getTime() < Date.now()) {
      return publicError("HOLD_EXPIRED", "The hold on this booking has expired. Please search again.", 409);
    }

    const [settings, paid] = await Promise.all([getSalesSettings(admin, booking.property_id), paidOnBooking(admin, booking.id)]);
    const deposit = computeDeposit(Number(booking.total_amount_gbp), Number(booking.nights), settings, booking.rate_plan_snapshot);
    const dueGbp = round2(Math.max(0, deposit - paid));
    if (dueGbp <= 0) return publicError("NOTHING_DUE", "The deposit has already been paid", 409);

    let currency = validation.data.currency;
    if (!settings.currencies.includes(currency)) currency = "GBP";
    let amount = dueGbp;
    let fxRate = 1;
    if (currency !== "GBP") {
      const converted = await convertCurrency(dueGbp, currency, admin);
      if (converted) {
        amount = converted.amount;
        fxRate = converted.rate;
      } else {
        currency = "GBP";
      }
    }

    const { data: guest } = booking.guest_id ? await admin.from("guests").select("email").eq("id", booking.guest_id).maybeSingle() : { data: null };
    const intent = await createDepositIntent({
      bookingId: booking.id,
      reference: booking.reference,
      amount,
      currency,
      amountGbp: dueGbp,
      fxRate,
      email: guest?.email ?? null,
    });
    return publicJson({ data: { client_secret: intent.client_secret, payment_intent_id: intent.id, amount: intent.amount, currency: intent.currency.toUpperCase(), amount_gbp: dueGbp, fx_rate: fxRate, publishable_key: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null } });
  } catch (err) {
    logger.error({ err: String(err) }, "[book/:token/payment-intent] failed");
    return publicError("INTERNAL_ERROR", "Internal server error", 500);
  }
}
