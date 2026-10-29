import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, rateLimitResponse, getClientIp } from "@/lib/rate-limit";
import { adapterFor, connectionByCode, decryptSecret, processChannelEvent, SIGNATURE_HEADER, verifySignature } from "@/lib/channel-manager";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/channels/:code/reservations
 *
 * Inbound reservations from a channel manager or OTA. The connection's HMAC
 * secret signs the raw body (`x-hospitai-signature: t=<unix>,v1=<hex>`),
 * which is the only authentication; unsigned or stale (>5 min) requests are
 * refused. One request may carry one event or a list. Each event is applied
 * idempotently and the per-event outcome is returned, so the provider can
 * retry a 207 and only the failed events are re-attempted.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const limit = await rateLimit(`channel-inbound:${getClientIp(request)}`, { windowMs: 60 * 1000, max: 300 });
  if (!limit.allowed) return rateLimitResponse(limit, "Too many requests");
  const { code } = await ctx.params;
  const rawBody = await request.text();
  try {
    const admin = createAdminClient();
    const connection = await connectionByCode(admin, code, request.nextUrl.searchParams.get("property"));
    if (!connection || connection.status === "inactive") {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "No active connection for this channel" } }, { status: 404 });
    }
    const secret = decryptSecret(connection.webhook_secret);
    if (!secret) return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "Connection has no webhook secret" } }, { status: 503 });
    const sig = verifySignature(secret, request.headers.get(SIGNATURE_HEADER), rawBody);
    if (!sig.ok) {
      logger.warn({ code, reason: sig.reason }, "[channels/reservations] rejected");
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid signature" } }, { status: 401 });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: { code: "VALIDATION", message: "Body must be JSON" } }, { status: 400 });
    }
    let events;
    try {
      events = adapterFor(connection.provider).parseInbound(parsed);
    } catch (err) {
      return NextResponse.json({ error: { code: "VALIDATION", message: err instanceof Error ? err.message.slice(0, 500) : "Malformed event" } }, { status: 400 });
    }
    if (!events.length) return NextResponse.json({ data: { results: [] } });
    if (events.length > 100) return NextResponse.json({ error: { code: "VALIDATION", message: "At most 100 events per request" } }, { status: 400 });

    const results = [];
    for (const event of events) results.push(await processChannelEvent(admin, connection, event));
    const failed = results.filter((r) => r.status === "failed").length;
    return NextResponse.json({ data: { results, processed: results.length - failed, failed } }, { status: failed && failed < results.length ? 207 : failed ? 422 : 200 });
  } catch (err) {
    logger.error({ err: String(err), code }, "[channels/reservations] failed");
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } }, { status: 500 });
  }
}
