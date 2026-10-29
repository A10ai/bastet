import "server-only";
import { createHash, randomBytes } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { BOOK_STRINGS, isBookLocale, type BookLocale } from "@/lib/book-i18n";
import {
  resolvePublicProperty, getSalesSettings, searchAvailability, upsertOnlineGuest, createOnlineBooking, issueBookingToken,
  computeDeposit, expireOnlineHolds, notifyFrontDesk, type PublicProperty, type SalesSettings, type AvailabilityOffer,
} from "@/lib/online-booking";
import { describeCancellation } from "@/lib/rate-plans";
import { createNotification } from "@/lib/notifications";
import { encryptPii } from "@/lib/pii-crypto";
import { scrubDeep } from "@/lib/pii-anonymizer";
import { logger } from "@/lib/logger";

/**
 * Booking concierge — Sales module, slice 5 (migration 00040).
 *
 * A guest-facing assistant for the website and WhatsApp. It answers in the
 * guest's language, quotes only what the booking engine returns, and
 * creates the same pending hold the /book pages create, handing back the
 * payment link. It never sees card details and never invents prices,
 * availability or discounts (the system prompt says so and the tools make
 * it impossible: every number comes from `searchAvailability`).
 *
 * Claude is called through the official SDK's tool runner. Model and
 * effort are configurable; the server-side refusal fallback is on so a
 * safety decline is answered by the fallback model rather than silence.
 */

export const CONCIERGE_MODEL = process.env.CONCIERGE_MODEL || process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
export const CONCIERGE_MAX_HISTORY = 24;
export const CONCIERGE_SESSION_MESSAGE_CAP = 60;

export function conciergeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 2 });
  return client;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
export function isPlausibleSessionToken(t: string | null | undefined): t is string {
  return typeof t === "string" && /^[A-Za-z0-9_-]{43}$/.test(t);
}

/** Contact details never go into the transcript: emails, phone numbers and long digit runs are masked. */
export function scrubText(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    // A phone number is a run with at least nine digits; dates (2027-07-01) and prices stay readable.
    .replace(/\+?\d[\d\s().-]{7,}\d/g, (m) => ((m.match(/\d/g) || []).length >= 9 && !/^\d{4}-\d{2}-\d{2}$/.test(m) ? "[phone]" : m));
}

export interface ConciergeSession {
  id: string;
  property_id: string;
  channel: "web" | "whatsapp";
  locale: BookLocale;
  status: "open" | "closed" | "handoff";
  booking_id: string | null;
  message_count: number;
}

const SESSION_COLUMNS = "id, property_id, channel, locale, status, booking_id, message_count";

function toSession(row: Record<string, unknown>): ConciergeSession {
  return {
    id: row.id as string,
    property_id: row.property_id as string,
    channel: row.channel as "web" | "whatsapp",
    locale: isBookLocale(row.locale as string) ? (row.locale as BookLocale) : "en",
    status: row.status as ConciergeSession["status"],
    booking_id: (row.booking_id as string | null) ?? null,
    message_count: Number(row.message_count ?? 0),
  };
}

export async function sessionByToken(admin: SupabaseClient, token: string): Promise<ConciergeSession | null> {
  if (!isPlausibleSessionToken(token)) return null;
  const { data } = await admin.from("concierge_sessions").select(SESSION_COLUMNS).eq("token_hash", hashToken(token)).maybeSingle();
  return data ? toSession(data as Record<string, unknown>) : null;
}

export async function createWebSession(admin: SupabaseClient, propertyId: string, locale: BookLocale): Promise<{ session: ConciergeSession; token: string }> {
  const token = generateSessionToken();
  const { data, error } = await admin.from("concierge_sessions").insert({ property_id: propertyId, channel: "web", token_hash: hashToken(token), locale }).select(SESSION_COLUMNS).single();
  if (error || !data) throw new Error(`concierge_sessions.insert: ${error?.message}`);
  return { session: toSession(data as Record<string, unknown>), token };
}

/** WhatsApp: one session per number per property; the number is stored encrypted, looked up by hash. */
export async function sessionForWhatsApp(admin: SupabaseClient, propertyId: string, phoneE164: string, locale: BookLocale): Promise<ConciergeSession> {
  const h = hashToken(`wa:${phoneE164}`);
  const { data: existing } = await admin.from("concierge_sessions").select(SESSION_COLUMNS).eq("property_id", propertyId).eq("channel", "whatsapp").eq("external_hash", h).maybeSingle();
  if (existing) return toSession(existing as Record<string, unknown>);
  const { data, error } = await admin.from("concierge_sessions").insert({ property_id: propertyId, channel: "whatsapp", external_hash: h, external_ref_enc: encryptPii(phoneE164), locale }).select(SESSION_COLUMNS).single();
  if (error || !data) throw new Error(`concierge_sessions.insert: ${error?.message}`);
  return toSession(data as Record<string, unknown>);
}

export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  tool_calls: unknown;
  created_at: string;
}

export async function loadHistory(admin: SupabaseClient, sessionId: string, limit = CONCIERGE_MAX_HISTORY): Promise<StoredMessage[]> {
  const { data } = await admin.from("concierge_messages").select("role, content, tool_calls, created_at").eq("session_id", sessionId).order("created_at", { ascending: false }).limit(limit);
  return ((data || []) as StoredMessage[]).reverse();
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

export interface ConciergeContext {
  property: PublicProperty;
  settings: SalesSettings;
  types: { name: string; bedrooms: number; max_occupancy: number; size_sqm: number | null; description: string | null }[];
  defaultCancellation: string | null;
  today: string;
  appUrl: string;
}

export function buildSystemPrompt(ctx: ConciergeContext, locale: BookLocale): string {
  const lang = BOOK_STRINGS[locale].langName;
  const types = ctx.types.map((t) => `- ${t.name}: ${t.bedrooms === 0 ? "studio" : `${t.bedrooms} bedroom`}, sleeps up to ${t.max_occupancy}${t.size_sqm ? `, ${t.size_sqm} m²` : ""}${t.description ? ` — ${t.description}` : ""}`).join("\n");
  return [
    `You are the booking concierge for ${ctx.property.name}, a ${ctx.property.star_rating ?? 4}-star serviced-apartment resort in ${ctx.property.city}, ${ctx.property.country}.`,
    `Today is ${ctx.today} (${ctx.property.timezone}).${ctx.property.opening_date ? ` The property opens on ${ctx.property.opening_date}.` : ""}`,
    "",
    "Apartment types:",
    types || "- (none listed yet)",
    "",
    "How booking works: the guest chooses dates and an apartment type, gives name and email, accepts the terms, and you create a hold. A deposit paid online confirms the booking; the balance is paid at the property.",
    `Deposit: ${ctx.settings.deposit_percent}% of the stay (never less than one night; non-refundable rates are paid in full). Holds last ${ctx.settings.hold_minutes} minutes.${ctx.defaultCancellation ? ` Standard cancellation: ${ctx.defaultCancellation}.` : ""} Online bookings: up to ${ctx.settings.max_nights} nights and ${ctx.settings.max_guests_per_booking} guests; arrivals up to ${ctx.settings.max_advance_days} days ahead. Currencies at payment: ${ctx.settings.currencies.join(", ")}.`,
    ctx.property.email || ctx.property.phone ? `Human contact: ${[ctx.property.email, ctx.property.phone].filter(Boolean).join(" / ")}.` : "",
    "",
    "Rules:",
    `- Reply in the guest's language. The guest's page language is ${lang}; follow the language they write in if it differs. Keep replies short and warm, like a good front-desk agent: a few sentences, no headings, no markdown tables.`,
    "- Prices, availability, deposits and cancellation terms come only from the check_availability tool. Never estimate, invent or round them, and never promise discounts, upgrades, late check-out or anything the tools do not return.",
    "- Before create_hold you must have: dates, apartment type (from a check_availability result), number of adults and children, first name, last name, email, and the guest's explicit agreement to the booking terms and the cancellation policy you quoted. Ask for what is missing in one message.",
    "- Never ask for or accept card numbers, passwords or passport numbers. Payment happens only on the secure payment link you give after create_hold.",
    "- For complaints, groups larger than the online limit, corporate or tour-operator requests, accessibility needs you cannot confirm, or anything you are unsure about, use handoff_to_staff and tell the guest a person will follow up.",
    "- Do not discuss other properties, politics, or anything unrelated to a stay. If asked who you are, say you are the property's AI booking assistant.",
    "- Dates must be in the future and in YYYY-MM-DD form when calling tools; confirm ambiguous dates (e.g. 03/04) with the guest first.",
  ].filter((l) => l !== "").join("\n");
}

export async function loadContext(admin: SupabaseClient, propertyId: string, origin: string): Promise<ConciergeContext> {
  const [{ data: property }, settings, { data: types }, { data: plan }] = await Promise.all([
    admin.from("properties").select("id, slug, name, city, country, star_rating, opening_date, status, phone, email, website, timezone").eq("id", propertyId).single(),
    getSalesSettings(admin, propertyId),
    admin.from("apartment_types").select("name, bedrooms, max_occupancy, size_sqm, description").eq("property_id", propertyId).order("base_weekly_rate_gbp"),
    admin.from("rate_plans").select("cancellation_policy, free_cancellation_days").eq("property_id", propertyId).eq("is_active", true).order("is_default", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const tz = (property as { timezone?: string } | null)?.timezone || "Africa/Cairo";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return {
    property: property as PublicProperty,
    settings,
    types: ((types || []) as ConciergeContext["types"]).map((t) => ({ ...t, size_sqm: t.size_sqm === null ? null : Number(t.size_sqm) })),
    defaultCancellation: plan ? describeCancellation(plan as { cancellation_policy: "flexible" | "moderate" | "strict" | "non_refundable"; free_cancellation_days: number }) : null,
    today,
    appUrl: (process.env.NEXT_PUBLIC_APP_URL || origin).replace(/\/$/, ""),
  };
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD");

export interface ToolCallRecord {
  name: string;
  input: unknown;
  ok: boolean;
  summary: string;
}

export interface ToolDeps {
  admin: SupabaseClient;
  ctx: ConciergeContext;
  session: ConciergeSession;
  origin: string;
  calls: ToolCallRecord[];
  /** Set when a hold is created, so the route can return the pay link as a button. */
  outcome: { booking_id?: string; pay_url?: string; reference?: string; handoff?: boolean };
}

export function formatOffers(offers: AvailabilityOffer[], nights: number): string {
  const lines = offers.map((o) => {
    const t = o.apartment_type;
    if (!o.quote || o.unavailable_reason) return `${t.name} (id ${t.id}): not available — ${o.unavailable_reason}`;
    return `${t.name} (id ${t.id}): ${o.available_count} free; total ${o.quote.total_gbp} GBP for ${nights} night(s) (${o.quote.rate_per_night_gbp} GBP/night); deposit ${o.deposit_gbp} GBP; ${o.cancellation ?? "cancellation per booking terms"}${o.quote.rate_plan?.includes_breakfast ? "; breakfast included" : ""}; sleeps up to ${t.max_occupancy}`;
  });
  return lines.length ? lines.join("\n") : "No apartment types configured.";
}

export function buildTools(deps: ToolDeps) {
  const { admin, ctx, session, calls } = deps;
  const record = (name: string, input: unknown, ok: boolean, summary: string) => calls.push({ name, input: scrubDeep(input), ok, summary });

  const checkAvailability = betaZodTool({
    name: "check_availability",
    description: "Check which apartment types are free for a stay and get the exact prices, deposit and cancellation terms. The only source of prices and availability.",
    inputSchema: z.object({
      check_in: isoDate,
      check_out: isoDate,
      adults: z.number().int().min(1).max(20),
      children: z.number().int().min(0).max(20).default(0),
    }),
    run: async (input) => {
      try {
        if (input.check_out <= input.check_in) return "check_out must be after check_in.";
        if (input.check_in < ctx.today) return `Arrival ${input.check_in} is in the past (today is ${ctx.today}).`;
        await expireOnlineHolds(admin).catch(() => 0);
        const offers = await searchAvailability(admin, { propertyId: ctx.property.id, checkIn: input.check_in, checkOut: input.check_out, adults: input.adults, children: input.children }, ctx.settings);
        const nights = Math.round((Date.parse(`${input.check_out}T00:00:00Z`) - Date.parse(`${input.check_in}T00:00:00Z`)) / 86_400_000);
        const text = formatOffers(offers, nights);
        record("check_availability", input, true, `${offers.filter((o) => o.quote && !o.unavailable_reason).length} type(s) available`);
        return text;
      } catch (err) {
        record("check_availability", input, false, String(err));
        return "Availability could not be checked right now. Apologise and suggest trying again in a minute or contacting the property.";
      }
    },
  });

  const createHold = betaZodTool({
    name: "create_hold",
    description: "Reserve an apartment of a type returned by check_availability and get the secure payment link. Only after the guest has given name, email and agreed to the terms.",
    inputSchema: z.object({
      apartment_type_id: z.string().uuid(),
      check_in: isoDate,
      check_out: isoDate,
      adults: z.number().int().min(1).max(20),
      children: z.number().int().min(0).max(20).default(0),
      guest: z.object({
        first_name: z.string().min(1).max(50),
        last_name: z.string().min(1).max(50),
        email: z.string().email().max(100),
        phone: z.string().max(20).optional().nullable(),
        country: z.string().length(2).optional().nullable(),
      }),
      special_requests: z.string().max(500).optional().nullable(),
      terms_accepted: z.boolean().describe("true only if the guest explicitly agreed to the booking terms and cancellation policy in this conversation"),
    }),
    run: async (input) => {
      if (!input.terms_accepted) {
        record("create_hold", input, false, "terms not accepted");
        return "The guest has not accepted the booking terms yet. Ask them to confirm the terms and the cancellation policy before reserving.";
      }
      try {
        const guest = await upsertOnlineGuest(admin, { ...input.guest, country: input.guest.country?.toUpperCase() ?? null, language: session.locale, marketing_consent: false }, ctx.property.id);
        const { booking, error } = await createOnlineBooking(admin, {
          propertyId: ctx.property.id, apartmentTypeId: input.apartment_type_id, checkIn: input.check_in, checkOut: input.check_out, adults: input.adults, children: input.children,
          guestId: guest.id, locale: session.locale, guestCurrency: "GBP", specialRequests: input.special_requests ?? null, source: "concierge",
        }, ctx.settings);
        if (error || !booking) {
          const code = String(error?.message || "").split(":")[0];
          record("create_hold", input, false, code || "failed");
          return `The hold could not be created (${error?.message || "unknown error"}). Explain this to the guest in plain words and offer to check other dates or types.`;
        }
        const link = await issueBookingToken(admin, booking, deps.origin);
        const deposit = computeDeposit(Number(booking.total_amount_gbp), Number(booking.nights), ctx.settings, booking.rate_plan_snapshot);
        await admin.from("concierge_sessions").update({ booking_id: booking.id }).eq("id", session.id);
        await notifyFrontDesk(admin, booking, "Concierge booking (awaiting deposit)", `${session.channel} chat`);
        deps.outcome.booking_id = booking.id;
        deps.outcome.pay_url = link.pay_url;
        deps.outcome.reference = booking.reference;
        record("create_hold", input, true, `booking ${booking.reference}`);
        return `Hold created. Reference ${booking.reference}. Total ${Number(booking.total_amount_gbp).toFixed(2)} GBP; deposit due now ${deposit.toFixed(2)} GBP; the hold expires at ${booking.hold_expires_at}. Payment link: ${link.pay_url} — give the guest this exact link and tell them the booking is confirmed once the deposit is paid.`;
      } catch (err) {
        record("create_hold", input, false, String(err));
        return "The hold could not be created right now. Apologise and offer the property's contact details.";
      }
    },
  });

  const handoff = betaZodTool({
    name: "handoff_to_staff",
    description: "Pass the conversation to a human at the property (complaints, groups, corporate or tour-operator requests, anything you cannot answer). Tell the guest someone will follow up.",
    inputSchema: z.object({
      reason: z.string().min(3).max(300),
      guest_contact: z.string().max(120).optional().nullable().describe("How to reach the guest, if they gave it"),
    }),
    run: async (input) => {
      try {
        await createNotification(admin, {
          title: `Concierge handoff (${session.channel})`,
          message: `${input.reason}${input.guest_contact ? ` · contact: ${input.guest_contact}` : ""}`,
          type: "warning",
          category: "guest",
          link: `/dashboard/sales?session=${session.id}`,
        });
        await admin.from("concierge_sessions").update({ status: "handoff" }).eq("id", session.id);
        deps.outcome.handoff = true;
        record("handoff_to_staff", input, true, "notified");
        return "Staff have been notified and will follow up. Tell the guest, and share the property's contact details.";
      } catch (err) {
        record("handoff_to_staff", input, false, String(err));
        return "Could not notify staff automatically; give the guest the property's email and phone.";
      }
    },
  });

  return [checkAvailability, createHold, handoff];
}

// ---------------------------------------------------------------------------
// Turn
// ---------------------------------------------------------------------------

export interface ConciergeReply {
  text: string;
  stop_reason: string | null;
  tool_calls: ToolCallRecord[];
  outcome: ToolDeps["outcome"];
  usage: { input_tokens: number; output_tokens: number } | null;
  model: string;
}

/** Text of the final message; a refusal or an empty answer gets a safe fallback in the guest's language. */
export function extractReply(message: { content: { type: string; text?: string }[]; stop_reason: string | null }, locale: BookLocale): string {
  const text = message.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n").trim();
  if (message.stop_reason === "refusal" || !text) {
    const s = BOOK_STRINGS[locale];
    return `${s.errorGeneric} ${s.questions}`;
  }
  return text;
}

/**
 * One guest message in, one reply out. History and the new message go to
 * Claude with the property prompt (cached) and the three tools; the turn,
 * the tool calls and token usage are stored on the session (scrubbed).
 */
export async function runConciergeTurn(admin: SupabaseClient, session: ConciergeSession, userText: string, origin: string): Promise<ConciergeReply> {
  const ctx = await loadContext(admin, session.property_id, origin);
  const history = await loadHistory(admin, session.id);
  const deps: ToolDeps = { admin, ctx, session, origin, calls: [], outcome: {} };
  const tools = buildTools(deps);
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content }) as Anthropic.Beta.BetaMessageParam),
    { role: "user", content: userText },
  ];

  const scrubbedUser = scrubText(userText);
  await admin.from("concierge_messages").insert({ session_id: session.id, property_id: session.property_id, role: "user", content: scrubbedUser });

  let text: string;
  let stopReason: string | null = null;
  let usage: ConciergeReply["usage"] = null;
  try {
    const runner = anthropic().beta.messages.toolRunner({
      model: CONCIERGE_MODEL,
      max_tokens: 4096,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: [{ type: "text", text: buildSystemPrompt(ctx, session.locale), cache_control: { type: "ephemeral" } }],
      tools,
      messages,
      max_iterations: 6,
    });
    const final = await runner.runUntilDone();
    stopReason = final.stop_reason;
    usage = { input_tokens: final.usage.input_tokens, output_tokens: final.usage.output_tokens };
    text = extractReply(final, session.locale);
  } catch (err) {
    logger.error({ err: String(err), session: session.id }, "[concierge] Claude call failed");
    const s = BOOK_STRINGS[session.locale];
    text = `${s.errorGeneric} ${s.questions} ${[ctx.property.email, ctx.property.phone].filter(Boolean).join(" · ")}`;
    stopReason = "error";
  }

  await admin.from("concierge_messages").insert({
    session_id: session.id, property_id: session.property_id, role: "assistant", content: scrubText(text),
    tool_calls: deps.calls.length ? deps.calls : null, model: CONCIERGE_MODEL, input_tokens: usage?.input_tokens ?? null, output_tokens: usage?.output_tokens ?? null, stop_reason: stopReason,
  });
  await admin.from("concierge_sessions").update({ message_count: session.message_count + 2, last_message_at: new Date().toISOString() }).eq("id", session.id);
  return { text, stop_reason: stopReason, tool_calls: deps.calls, outcome: deps.outcome, usage, model: CONCIERGE_MODEL };
}

/** Messages this property has used today across all sessions (spend guard). */
export async function messagesToday(admin: SupabaseClient, propertyId: string): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const { count } = await admin.from("concierge_messages").select("id", { count: "exact", head: true }).eq("property_id", propertyId).eq("role", "assistant").gte("created_at", start.toISOString());
  return count ?? 0;
}

export { resolvePublicProperty };
