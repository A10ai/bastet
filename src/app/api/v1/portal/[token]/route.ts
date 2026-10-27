import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, rateLimitResponse, getClientIp } from "@/lib/rate-limit";
import { loadPortalStay, resolvePortalToken } from "@/lib/portal";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/portal/:token
 *
 * Public: the stay behind a guest portal link. The token is the only
 * credential; unknown, revoked and expired tokens all answer 404. Rate
 * limited per address so links cannot be guessed. Never returns identity
 * documents, internal notes or other guests.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  // Per address when the address is trustworthy; otherwise per link, so all
  // guests do not share one bucket (tokens are 256-bit, guessing is moot).
  const ip = getClientIp(request);
  const limit = await rateLimit(ip !== "unknown" ? `portal:${ip}` : `portal-link:${token.slice(0, 64)}`, { windowMs: 15 * 60 * 1000, max: 60 });
  if (!limit.allowed) return rateLimitResponse(limit, "Too many requests");
  try {
    const admin = createAdminClient();
    const link = await resolvePortalToken(admin, token);
    if (!link) return NextResponse.json({ error: { code: "NOT_FOUND", message: "This link is not valid" } }, { status: 404, headers: { "Cache-Control": "no-store" } });
    const stay = await loadPortalStay(admin, link.booking_id, link.expires_at);
    if (!stay) return NextResponse.json({ error: { code: "NOT_FOUND", message: "This link is not valid" } }, { status: 404, headers: { "Cache-Control": "no-store" } });
    await admin.from("booking_access_tokens").update({ last_used_at: new Date().toISOString(), use_count: (link.use_count ?? 0) + 1 }).eq("id", link.id);
    return NextResponse.json({ data: stay }, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
  } catch (err) {
    logger.error({ err: String(err) }, "[portal] GET failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
