import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { rpcErrorResponse } from "@/lib/rpc-error";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { buildPortalUrl, generatePortalToken, hashPortalToken, portalExpiry } from "@/lib/portal";

/**
 * Guest portal link for a booking (migration 00029). Front desk and above.
 *
 * GET    /api/v1/bookings/:id/portal-link   active links (id, expiry, usage), never the token itself
 * POST   /api/v1/bookings/:id/portal-link   create a link; the token is returned once, in this response only
 * DELETE /api/v1/bookings/:id/portal-link   revoke every active link for the booking
 */
type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  const auth = await requireRole(request, ROLES.FRONT_DESK);
  if (!auth.authenticated) return auth.error!;
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("booking_access_tokens")
    .select("id, expires_at, revoked_at, created_at, last_used_at, use_count")
    .eq("booking_id", id)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) return rpcErrorResponse(error, "booking_access_tokens.select");
  return NextResponse.json({ data: data || [] });
}

export async function POST(request: NextRequest, ctx: Ctx) {
  const auth = await requireRole(request, ROLES.FRONT_DESK);
  if (!auth.authenticated) return auth.error!;
  const { id } = await ctx.params;
  try {
    const supabase = await createServerSupabaseClient();
    const { data: booking } = await supabase.from("bookings").select("id, property_id, reference, status, check_out").eq("id", id).maybeSingle();
    if (!booking) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Booking not found" } }, { status: 404 });
    if (["cancelled", "no_show"].includes(booking.status)) {
      return NextResponse.json({ error: { code: "INVALID_STATUS", message: "A cancelled booking has no guest portal" } }, { status: 409 });
    }
    const token = generatePortalToken();
    const expiresAt = portalExpiry(booking.check_out);
    if (expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: { code: "EXPIRED", message: "This stay ended more than a week ago" } }, { status: 409 });
    }
    const { data: row, error } = await supabase
      .from("booking_access_tokens")
      .insert({ booking_id: id, property_id: booking.property_id, token_hash: hashPortalToken(token), expires_at: expiresAt.toISOString(), created_by: auth.staffId ?? null })
      .select("id, expires_at")
      .single();
    if (error) return rpcErrorResponse(error, "booking_access_tokens.insert");

    await logAudit(supabase, {
      user_id: auth.userId,
      user_email: auth.email,
      action: "booking.portal_link",
      category: "booking",
      resource_type: "booking",
      resource_id: id,
      description: `Created guest portal link for ${booking.reference} (expires ${row.expires_at})`,
      metadata: { token_id: row.id },
    });
    return NextResponse.json({ data: { id: row.id, url: buildPortalUrl(token, request.nextUrl.origin), expires_at: row.expires_at } }, { status: 201 });
  } catch (err) {
    logger.error({ err: String(err) }, "[portal-link] POST failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const auth = await requireRole(request, ROLES.FRONT_DESK);
  if (!auth.authenticated) return auth.error!;
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("booking_access_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("booking_id", id)
    .is("revoked_at", null)
    .select("id");
  if (error) return rpcErrorResponse(error, "booking_access_tokens.revoke");
  await logAudit(supabase, {
    user_id: auth.userId,
    user_email: auth.email,
    action: "booking.portal_link_revoke",
    category: "booking",
    resource_type: "booking",
    resource_id: id,
    description: `Revoked ${data?.length ?? 0} guest portal link(s)`,
  });
  return NextResponse.json({ data: { revoked: data?.length ?? 0 } });
}
