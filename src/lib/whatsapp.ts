import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { logger } from "@/lib/logger";

/** WhatsApp Business (Meta Cloud API) helpers for the concierge webhook (docs/CONCIERGE.md). */

export function verifyMetaSignature(secret: string, header: string | null, rawBody: string): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const given = header.slice(7);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(given, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}


/** Send a text through the Graph API; a no-op (logged) until the send credentials exist. */
export async function sendWhatsAppText(to: string, text: string): Promise<boolean> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) {
    logger.info({ to: to.slice(-4) }, "[webhooks/whatsapp] send skipped: no credentials");
    return false;
  }
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text.slice(0, 4000) } }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) logger.warn({ status: res.status }, "[webhooks/whatsapp] send failed");
  return res.ok;
}
