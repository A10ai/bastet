import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSalesSettings, resolvePublicProperty } from "@/lib/online-booking";
import { conciergeConfigured, runConciergeTurn, sessionForWhatsApp, CONCIERGE_SESSION_MESSAGE_CAP } from "@/lib/concierge";
import { detectBookLocale } from "@/lib/book-i18n";
import { logger } from "@/lib/logger";
import { verifyMetaSignature, sendWhatsAppText } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

/**
 * WhatsApp Business (Meta Cloud API) seam for the concierge.
 *
 * GET  verifies the webhook (hub.verify_token = WHATSAPP_VERIFY_TOKEN).
 * POST receives messages, verified with X-Hub-Signature-256 against
 *      WHATSAPP_APP_SECRET; each text message runs one concierge turn for
 *      the sender's session and the reply is sent back through the Graph
 *      API (WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID). Without the
 *      send credentials the reply is stored and logged only.
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (token && q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === token) {
    return new NextResponse(q.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Verification failed" } }, { status: 403 });
}

interface MetaMessage { from: string; id: string; type: string; text?: { body: string } }

export async function POST(request: NextRequest) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !conciergeConfigured()) return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "WhatsApp is not configured" } }, { status: 503 });
  const raw = await request.text();
  if (!verifyMetaSignature(secret, request.headers.get("x-hub-signature-256"), raw)) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid signature" } }, { status: 401 });
  }
  let payload: { entry?: { changes?: { value?: { messages?: MetaMessage[]; metadata?: { phone_number_id?: string } } }[] }[] };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Body must be JSON" } }, { status: 400 });
  }
  const admin = createAdminClient();
  const property = await resolvePublicProperty(admin, request.nextUrl.searchParams.get("property"));
  if (!property) return NextResponse.json({ received: true, skipped: "no public property" });
  const settings = await getSalesSettings(admin, property.id);
  const origin = request.nextUrl.origin;
  let handled = 0;
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const msg of change.value?.messages ?? []) {
        if (msg.type !== "text" || !msg.text?.body) continue;
        try {
          const session = await sessionForWhatsApp(admin, property.id, msg.from, detectBookLocale(null, []));
          if (!settings.concierge_enabled || session.status === "closed" || session.message_count >= CONCIERGE_SESSION_MESSAGE_CAP) continue;
          const reply = await runConciergeTurn(admin, session, msg.text.body.slice(0, 2000), origin);
          await sendWhatsAppText(msg.from, reply.text);
          handled += 1;
        } catch (err) {
          logger.error({ err: String(err) }, "[webhooks/whatsapp] message failed");
        }
      }
    }
  }
  // Meta expects 200 quickly; failures are logged, not retried by us.
  return NextResponse.json({ received: true, handled });
}

