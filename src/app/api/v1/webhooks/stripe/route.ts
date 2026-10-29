import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripeWebhookConfigured, constructWebhookEvent, depositFromIntent, type Stripe } from "@/lib/stripe";
import { confirmOnlineBooking, notifyFrontDesk } from "@/lib/online-booking";
import { emitEvent } from "@/lib/event-bus";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/webhooks/stripe
 *
 * Stripe calls this with a signed payload; the signature is the only
 * authentication (no session, no CSRF). On `payment_intent.succeeded` for a
 * deposit the folio payment is recorded and the booking confirmed, both
 * idempotent on the PaymentIntent id, so Stripe's retries are harmless.
 * Failures are reported to the front desk. Refunds initiated in Stripe are
 * logged for finance to reconcile; the ledger entry is made from the folio.
 */
export async function POST(request: NextRequest) {
  if (!stripeWebhookConfigured()) return NextResponse.json({ error: { code: "PAYMENTS_UNAVAILABLE", message: "Stripe is not configured" } }, { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Missing signature" } }, { status: 400 });
  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(rawBody, signature);
  } catch (err) {
    logger.warn({ err: String(err) }, "[webhooks/stripe] bad signature");
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid signature" } }, { status: 400 });
  }

  const admin = createAdminClient();
  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const intent = event.data.object as Stripe.PaymentIntent;
        if (intent.metadata?.purpose !== "deposit") break;
        const d = depositFromIntent(intent);
        if (!d.bookingId) break;
        const { result, error } = await confirmOnlineBooking(admin, {
          bookingId: d.bookingId,
          amountGbp: d.amountGbp,
          method: "stripe",
          reference: d.reference!,
          currency: d.currency,
          amountOriginal: d.amountOriginal,
          fxRate: d.fxRate,
        });
        if (error) {
          logger.error({ err: error.message, booking: d.bookingId }, "[webhooks/stripe] confirm failed");
          // 500 makes Stripe retry; a booking that was cancelled meanwhile must not retry forever.
          if (/INVALID_STATUS|BOOKING_NOT_FOUND/.test(error.message)) {
            const { data: closed } = await admin.from("bookings").select("property_id").eq("id", d.bookingId).maybeSingle();
            await notifyFrontDesk(admin, { id: d.bookingId, property_id: closed?.property_id ?? null, reference: intent.metadata?.reference || d.bookingId, check_in: "", check_out: "", adults: 0, children: 0 }, "Payment received for a closed booking", `${d.amountOriginal} ${d.currency}, intent ${intent.id}: refund or re-open`);
            break;
          }
          return NextResponse.json({ error: "confirm failed" }, { status: 500 });
        }
        if (result && !result.duplicate) {
          const { data: booking } = await admin.from("bookings").select("id, property_id, reference, check_in, check_out, adults, children").eq("id", d.bookingId).maybeSingle();
          await logAudit(admin, { action: "booking.confirm", category: "booking", resource_type: "booking", resource_id: d.bookingId, description: `Deposit ${d.amountGbp.toFixed(2)} GBP received via Stripe (${intent.id}); booking confirmed` });
          if (booking) await notifyFrontDesk(admin, booking as never, "Online booking confirmed", `deposit ${d.amountGbp.toFixed(2)} GBP`);
          await emitEvent("booking.confirmed", "online-booking", { booking_id: d.bookingId, reference: booking?.reference ?? null, deposit_gbp: d.amountGbp, payment_intent: intent.id }, admin, { idempotencyKey: `stripe:${intent.id}` }).catch(() => undefined);
        }
        break;
      }
      case "payment_intent.payment_failed": {
        const intent = event.data.object as Stripe.PaymentIntent;
        const bookingId = intent.metadata?.booking_id;
        if (bookingId) {
          await logAudit(admin, { action: "booking.payment_failed", category: "booking", resource_type: "booking", resource_id: bookingId, description: `Card payment failed (${intent.id}): ${intent.last_payment_error?.message ?? "declined"}` });
        }
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const bookingId = charge.metadata?.booking_id;
        await logAudit(admin, { action: "payment.refund_external", category: "finance", resource_type: "booking", resource_id: bookingId || undefined, description: `Refund made in Stripe for charge ${charge.id} (${charge.amount_refunded} ${charge.currency}); record it on the folio` });
        break;
      }
      default:
        break;
    }
    return NextResponse.json({ received: true, type: event.type });
  } catch (err) {
    logger.error({ err: String(err), type: event.type }, "[webhooks/stripe] handler failed");
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }
}
