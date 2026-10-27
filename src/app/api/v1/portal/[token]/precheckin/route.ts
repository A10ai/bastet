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

const GUEST_REQUEST_PREFIX = "Guest (online check-in): ";

/**
 * POST /api/v1/portal/:token/precheckin
 *
 * Public pre-arrival check-in. Stores the answers on the booking
 * (`precheckin`, `precheckin_completed_at`), appends special requests, and
 * tells the front desk. Contact details the guest types are kept in the
 * form answers for staff to confirm; they do not overwrite the guest record.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const ip = getClientIp(request);
  const limit = await rateLimit(ip !== "unknown" ? `portal-precheckin:${ip}` : `portal-precheckin-link:${token.slice(0, 64)}`, { windowMs: 15 * 60 * 1000, max: 20 });
  if (!limit.allowed) return rateLimitResponse(limit, "Too many requests");
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
    // Resubmitting replaces the guest's earlier line instead of appending
    // another one, so the field cannot be grown without limit.
    const staffLines = String(booking.special_requests || "")
      .split("\n")
      .filter((line) => line && !line.startsWith(GUEST_REQUEST_PREFIX));
    const requests = [...staffLines, input.special_requests ? `${GUEST_REQUEST_PREFIX}${input.special_requests}` : null].filter(Boolean).join("\n");
    // The guest may correct the party size downwards; a larger party changes
    // the price and the room's occupancy, so it is kept in the answers for
    // the front desk to confirm instead of being written to the booking.
    const bookedTotal = (booking.adults ?? 1) + (booking.children ?? 0);
    const adults = input.adults ?? booking.adults;
    const children = input.children ?? booking.children ?? 0;
    const partyChangeRequested = adults + children > bookedTotal;
    const { error } = await admin
      .from("bookings")
      .update({
        precheckin: { ...input, submitted_at: now, party_change_requested: partyChangeRequested },
        precheckin_completed_at: now,
        adults: partyChangeRequested ? booking.adults : adults,
        children: partyChangeRequested ? booking.children : children,
        special_requests: requests || null,
      })
      .eq("id", booking.id);
    if (error) {
      logger.error({ err: error.message }, "[portal/precheckin] update failed");
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    const apt = booking.apartment as unknown as { number: string } | null;
    // Service-role client: scope the broadcast to this booking's property.
    await createNotification(admin, {
      property_id: booking.property_id,
      title: `Online check-in: ${booking.reference}`,
      message: `${apt?.number ? `Room ${apt.number}, ` : ""}arriving ${input.arrival_time || "time not given"}${partyChangeRequested ? ` · party change requested (${adults} adults, ${children} children)` : ""}${input.special_requests ? ` · ${input.special_requests.slice(0, 80)}` : ""}`,
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
