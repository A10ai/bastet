import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, rateLimitResponse, getClientIp } from "@/lib/rate-limit";
import { resolvePortalToken } from "@/lib/portal";
import { validateBody, formatZodErrors, precheckinSchema } from "@/lib/validation";
import { createNotification } from "@/lib/notifications";
import { emitEvent } from "@/lib/event-bus";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/portal/:token/precheckin
 *
 * Public pre-arrival check-in. Stores the answers on the booking
 * (`precheckin`, `precheckin_completed_at`), appends special requests, and
 * tells the front desk. Contact details the guest types are kept in the
 * form answers for staff to confirm; they do not overwrite the guest record.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const limit = await rateLimit(`portal-precheckin:${getClientIp(request)}`, { windowMs: 15 * 60 * 1000, max: 20 });
  if (!limit.allowed) return rateLimitResponse(limit, "Too many requests");
  const { token } = await ctx.params;
  try {
    const admin = createAdminClient();
    const link = await resolvePortalToken(admin, token);
    if (!link) return NextResponse.json({ error: { code: "NOT_FOUND", message: "This link is not valid" } }, { status: 404 });

    const body = await request.json().catch(() => null);
    const validation = validateBody(precheckinSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: "Validation failed", details: formatZodErrors(validation.error) }, { status: 400 });
    }
    const input = validation.data;
    const { data: booking } = await admin.from("bookings").select("id, reference, status, special_requests, adults, children, property_id, apartment:apartments(number)").eq("id", link.booking_id).maybeSingle();
    if (!booking) return NextResponse.json({ error: { code: "NOT_FOUND", message: "This link is not valid" } }, { status: 404 });
    if (!["pending", "confirmed"].includes(booking.status)) {
      return NextResponse.json({ error: { code: "INVALID_STATUS", message: "Online check-in is only available before arrival" } }, { status: 409 });
    }

    const now = new Date().toISOString();
    const requests = [booking.special_requests, input.special_requests ? `Guest (online check-in): ${input.special_requests}` : null].filter(Boolean).join("\n");
    const { error } = await admin
      .from("bookings")
      .update({
        precheckin: { ...input, submitted_at: now },
        precheckin_completed_at: now,
        adults: input.adults ?? booking.adults,
        children: input.children ?? booking.children,
        special_requests: requests || null,
      })
      .eq("id", booking.id);
    if (error) {
      logger.error({ err: error.message }, "[portal/precheckin] update failed");
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    const apt = booking.apartment as unknown as { number: string } | null;
    await createNotification(admin, {
      title: `Online check-in: ${booking.reference}`,
      message: `${apt?.number ? `Room ${apt.number}, ` : ""}arriving ${input.arrival_time || "time not given"}${input.special_requests ? ` · ${input.special_requests.slice(0, 80)}` : ""}`,
      type: "info",
      category: "booking",
      link: `/dashboard/bookings/${booking.id}`,
    });
    await emitEvent("booking.precheckin_completed", "portal", { booking_id: booking.id, reference: booking.reference, arrival_time: input.arrival_time ?? null }, admin, { idempotencyKey: `precheckin:${booking.id}:${now.slice(0, 16)}` }).catch(() => undefined);

    return NextResponse.json({ data: { completed_at: now } }, { status: 201 });
  } catch (err) {
    logger.error({ err: String(err) }, "[portal/precheckin] failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
