import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, rateLimitResponse, getClientIp } from "@/lib/rate-limit";
import { resolvePortalToken } from "@/lib/portal";
import { validateBody, formatZodErrors, publicReviewSchema } from "@/lib/validation";
import { createNotification } from "@/lib/notifications";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET  /api/v1/portal/:token/review   can this stay be reviewed? (after check-out, once)
 * POST /api/v1/portal/:token/review   submit the review (public, booking token)
 */
const NOT_FOUND = NextResponse.json({ error: { code: "NOT_FOUND", message: "This link is not valid" } }, { status: 404, headers: { "Cache-Control": "no-store" } });

async function load(admin: ReturnType<typeof createAdminClient>, token: string) {
  const link = await resolvePortalToken(admin, token);
  if (!link) return null;
  const { data: b } = await admin.from("bookings").select("id, property_id, reference, status, check_in, check_out, guest_id, guests(first_name), properties(name)").eq("id", link.booking_id).maybeSingle();
  if (!b) return null;
  const { data: existing } = await admin.from("reviews").select("id, overall_rating, created_at").eq("booking_id", b.id).eq("source", "portal").maybeSingle();
  return { link, booking: b, existing };
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const limit = await rateLimit(`review-get:${getClientIp(request)}`, { windowMs: 15 * 60 * 1000, max: 60 });
  if (!limit.allowed) return rateLimitResponse(limit, "Too many requests");
  const { token } = await ctx.params;
  const admin = createAdminClient();
  const found = await load(admin, token);
  if (!found) return NOT_FOUND;
  const guest = (Array.isArray(found.booking.guests) ? found.booking.guests[0] : found.booking.guests) as { first_name: string | null } | null;
  const prop = (Array.isArray(found.booking.properties) ? found.booking.properties[0] : found.booking.properties) as { name: string } | null;
  return NextResponse.json({ data: { property: prop?.name ?? "Your stay", reference: found.booking.reference, check_in: found.booking.check_in, check_out: found.booking.check_out, first_name: guest?.first_name ?? null, can_review: found.booking.status === "checked_out" && !found.existing, already_reviewed: Boolean(found.existing) } }, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const limit = await rateLimit(`review-post:${getClientIp(request)}`, { windowMs: 60 * 60 * 1000, max: 5 });
  if (!limit.allowed) return rateLimitResponse(limit, "Too many requests");
  const { token } = await ctx.params;
  try {
    const body = await request.json().catch(() => null);
    const validation = validateBody(publicReviewSchema, body);
    if (!validation.success) return NextResponse.json({ error: { code: "VALIDATION", message: formatZodErrors(validation.error) } }, { status: 400 });
    const admin = createAdminClient();
    const found = await load(admin, token);
    if (!found) return NOT_FOUND;
    if (found.booking.status !== "checked_out") return NextResponse.json({ error: { code: "INVALID_STATUS", message: "Reviews can be left after check-out" } }, { status: 409 });
    if (found.existing) return NextResponse.json({ error: { code: "ALREADY_REVIEWED", message: "Thank you, this stay has already been reviewed" } }, { status: 409 });
    const input = validation.data;
    const guest = (Array.isArray(found.booking.guests) ? found.booking.guests[0] : found.booking.guests) as { first_name: string | null } | null;
    const { data, error } = await admin.from("reviews").insert({
      property_id: found.booking.property_id, booking_id: found.booking.id, guest_id: found.booking.guest_id, source: "portal",
      overall_rating: input.overall_rating, cleanliness_rating: input.cleanliness_rating ?? null, location_rating: input.location_rating ?? null, service_rating: input.service_rating ?? null, value_rating: input.value_rating ?? null,
      title: input.title ?? null, body: input.body ?? null, language: input.language?.slice(0, 5) ?? null,
      reviewer_name: input.reviewer_name?.trim() || guest?.first_name || null, is_public: input.consent_public,
    }).select("id").single();
    if (error) {
      logger.error({ err: error.message }, "[portal/review] insert failed");
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
    await createNotification(admin, { title: `New review ${input.overall_rating}/5: ${found.booking.reference}`, message: (input.title || input.body || "No text").slice(0, 160), type: input.overall_rating <= 2 ? "warning" : "success", category: "guest", link: "/dashboard/sales?tab=reviews" }).catch(() => 0);
    return NextResponse.json({ data: { id: data.id, thank_you: true } }, { status: 201 });
  } catch (err) {
    logger.error({ err: String(err) }, "[portal/review] failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
