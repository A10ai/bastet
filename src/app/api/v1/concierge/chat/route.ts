import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, rateLimitResponse, getClientIp } from "@/lib/rate-limit";
import { validateBody, formatZodErrors, conciergeChatSchema } from "@/lib/validation";
import { publicJson, publicError, requestOrigin } from "@/lib/online-booking-http";
import { getSalesSettings, resolvePublicProperty } from "@/lib/online-booking";
import { conciergeConfigured, createWebSession, loadHistory, messagesToday, runConciergeTurn, sessionByToken, CONCIERGE_SESSION_MESSAGE_CAP } from "@/lib/concierge";
import { detectBookLocale } from "@/lib/book-i18n";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

/**
 * POST /api/v1/concierge/chat { session_token?, message, locale?, property? }
 * GET  /api/v1/concierge/chat?session_token=   transcript for a reload
 *
 * Public. A session token (returned on the first message) is the only
 * credential; per-address rate limits, a per-session message cap and a
 * per-property daily cap bound the Anthropic spend.
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = await rateLimit(`concierge:${ip}`, { windowMs: 15 * 60 * 1000, max: 40 });
  if (!limit.allowed) return rateLimitResponse(limit, "Too many messages. Please wait a few minutes.");
  try {
    if (!conciergeConfigured()) return publicError("CONCIERGE_UNAVAILABLE", "The assistant is not available right now", 503);
    const body = await request.json().catch(() => null);
    const validation = validateBody(conciergeChatSchema, body);
    if (!validation.success) return publicError("VALIDATION", formatZodErrors(validation.error), 400);
    const input = validation.data;
    const admin = createAdminClient();

    let session = input.session_token ? await sessionByToken(admin, input.session_token) : null;
    let token = session ? input.session_token! : null;
    if (!session) {
      const property = await resolvePublicProperty(admin, input.property ?? null);
      if (!property) return publicError("NOT_FOUND", "This property is not taking online bookings", 404);
      const settings = await getSalesSettings(admin, property.id);
      if (!settings.concierge_enabled) return publicError("CONCIERGE_UNAVAILABLE", "The assistant is switched off", 503);
      const locale = detectBookLocale(input.locale ?? null, request.headers.get("accept-language")?.split(",") ?? []);
      const created = await createWebSession(admin, property.id, locale);
      session = created.session;
      token = created.token;
    }
    if (session.status === "closed") return publicError("SESSION_CLOSED", "This conversation has ended", 409);
    if (session.message_count >= CONCIERGE_SESSION_MESSAGE_CAP) return publicError("SESSION_LIMIT", "This conversation has reached its limit. Please contact the property directly.", 429);
    const settings = await getSalesSettings(admin, session.property_id);
    if (!settings.concierge_enabled) return publicError("CONCIERGE_UNAVAILABLE", "The assistant is switched off", 503);
    if ((await messagesToday(admin, session.property_id)) >= settings.concierge_daily_message_cap) {
      return publicError("DAILY_LIMIT", "The assistant is busy today. Please book online or contact the property.", 503);
    }

    const reply = await runConciergeTurn(admin, session, input.message, requestOrigin(request));
    return publicJson({ data: { session_token: token, reply: reply.text, outcome: reply.outcome, locale: session.locale } });
  } catch (err) {
    logger.error({ err: String(err) }, "[concierge/chat] failed");
    return publicError("INTERNAL_ERROR", "Internal server error", 500);
  }
}

export async function GET(request: NextRequest) {
  const limit = await rateLimit(`concierge-history:${getClientIp(request)}`, { windowMs: 15 * 60 * 1000, max: 60 });
  if (!limit.allowed) return rateLimitResponse(limit, "Too many requests");
  const token = request.nextUrl.searchParams.get("session_token");
  if (!token) return publicError("VALIDATION", "session_token is required", 400);
  const admin = createAdminClient();
  const session = await sessionByToken(admin, token);
  if (!session) return publicError("NOT_FOUND", "Unknown session", 404);
  const history = await loadHistory(admin, session.id, 50);
  return publicJson({ data: { locale: session.locale, status: session.status, messages: history.map((m) => ({ role: m.role, content: m.content, at: m.created_at })) } });
}
