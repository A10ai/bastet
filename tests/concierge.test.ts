// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { createFakeSupabase } from "./__mocks__/supabase-fake";
import {
  scrubText, generateSessionToken, hashToken, isPlausibleSessionToken, buildSystemPrompt, formatOffers, extractReply, buildTools,
  createWebSession, sessionByToken, sessionForWhatsApp, type ConciergeContext, type ToolDeps,
} from "@/lib/concierge";
import { verifyMetaSignature } from "@/lib/whatsapp";
import { createHmac } from "node:crypto";

vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn(async () => 1) }));
vi.mock("@/lib/event-bus", () => ({ emitEvent: vi.fn(async () => ({ event_id: "e", results: [] })) }));

const ctx: ConciergeContext = {
  property: { id: "p1", slug: "bastet", name: "Bastet Aparthotels", city: "Hurghada", country: "EG", star_rating: 4, opening_date: "2027-09-01", status: "pre_opening", phone: "+20 65 1", email: "info@bastet.test", website: null, timezone: "Africa/Cairo" },
  settings: { property_id: "p1", online_enabled: true, deposit_percent: 20, hold_minutes: 30, request_hold_hours: 48, min_lead_days: 0, max_advance_days: 540, max_nights: 90, max_guests_per_booking: 8, currencies: ["GBP", "EUR"], terms_url: null, concierge_enabled: true, concierge_daily_message_cap: 2000 },
  types: [{ name: "Studio", bedrooms: 0, max_occupancy: 2, size_sqm: 35, description: "Compact" }, { name: "2-Bed", bedrooms: 2, max_occupancy: 5, size_sqm: 90, description: null }],
  defaultCancellation: "Free cancellation until 1 day before arrival",
  today: "2027-06-01",
  appUrl: "https://app.test",
};

describe("session plumbing", () => {
  it("tokens are 43-char base64url and stored hashed", async () => {
    const t = generateSessionToken();
    expect(isPlausibleSessionToken(t)).toBe(true);
    expect(isPlausibleSessionToken("short")).toBe(false);
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    const sb = createFakeSupabase({ concierge_sessions: [] });
    const { session, token } = await createWebSession(sb, "p1", "de");
    expect(session.locale).toBe("de");
    const found = await sessionByToken(sb, token);
    expect(found?.id).toBe(session.id);
    expect(await sessionByToken(sb, generateSessionToken())).toBeNull();
    const { data: rows } = await sb.from("concierge_sessions").select("*");
    expect(rows![0].token_hash).toBe(hashToken(token));
  });
  it("WhatsApp numbers are hashed for lookup and encrypted at rest, one session per number", async () => {
    const sb = createFakeSupabase({ concierge_sessions: [] });
    const a = await sessionForWhatsApp(sb, "p1", "+4917612345678", "de");
    const b = await sessionForWhatsApp(sb, "p1", "+4917612345678", "en");
    expect(b.id).toBe(a.id);
    const { data: rows } = await sb.from("concierge_sessions").select("*");
    expect(rows).toHaveLength(1);
    expect(rows![0].external_hash).toBe(hashToken("wa:+4917612345678"));
    expect(String(rows![0].external_ref_enc)).not.toBe("");
  });
  it("scrubs contact details out of stored text", () => {
    expect(scrubText("mail me at Anna.Nowak@example.com or +48 600 123 456 please")).toBe("mail me at [email] or [phone] please");
    expect(scrubText("2 adults from 2027-07-01 to 2027-07-08, budget 1200 GBP")).toBe("2 adults from 2027-07-01 to 2027-07-08, budget 1200 GBP");
    expect(scrubText("call 01onetwo 0176 1234 5678 now")).toBe("call 01onetwo [phone] now");
  });
});

describe("prompt and tool output", () => {
  it("system prompt carries the facts, the language and the guardrails", () => {
    const p = buildSystemPrompt(ctx, "pl");
    expect(p).toContain("Bastet Aparthotels");
    expect(p).toContain("Today is 2027-06-01");
    expect(p).toContain("Studio: studio, sleeps up to 2, 35 m²");
    expect(p).toContain("Deposit: 20%");
    expect(p).toContain("Holds last 30 minutes");
    expect(p).toContain("page language is Polski");
    expect(p).toMatch(/Never estimate, invent or round/);
    expect(p).toMatch(/Never ask for or accept card numbers/);
  });
  it("formats offers as exact facts the model must repeat", () => {
    const text = formatOffers([
      { apartment_type: { id: "t1", name: "Studio", slug: "studio", description: null, bedrooms: 0, bathrooms: 1, max_occupancy: 2, size_sqm: 35, amenities: [], images: [] }, available_count: 3, quote: { apartment_type_id: "t1", apartment_type: "Studio", check_in: "2027-07-01", check_out: "2027-07-08", nights: 7, currency: "GBP", bar_total_gbp: 280, total_gbp: 280, rate_per_night_gbp: 40, discount_percentage: 0, nightly: [], rate_plan: null }, cancellation: "Free cancellation", deposit_gbp: 56, unavailable_reason: null },
      { apartment_type: { id: "t2", name: "Penthouse", slug: "pent", description: null, bedrooms: 3, bathrooms: 2, max_occupancy: 6, size_sqm: null, amenities: [], images: [] }, available_count: 0, quote: null, cancellation: null, deposit_gbp: null, unavailable_reason: "Sold out for these dates" },
    ], 7);
    expect(text).toContain("Studio (id t1): 3 free; total 280 GBP for 7 night(s) (40 GBP/night); deposit 56 GBP; Free cancellation");
    expect(text).toContain("Penthouse (id t2): not available — Sold out for these dates");
  });
  it("falls back safely on a refusal or an empty answer", () => {
    expect(extractReply({ content: [{ type: "text", text: "Gern!" }], stop_reason: "end_turn" }, "de")).toBe("Gern!");
    expect(extractReply({ content: [], stop_reason: "refusal" }, "en")).toContain("Something went wrong");
    expect(extractReply({ content: [{ type: "text", text: "" }], stop_reason: "end_turn" }, "cs")).toContain("Něco se pokazilo");
  });
});

describe("tools", () => {
  function deps(extra: Record<string, unknown[]> = {}): ToolDeps {
    const sb = createFakeSupabase({ guests: [], bookings: [], booking_access_tokens: [], concierge_sessions: [{ id: "s1" }], apartment_types: [], apartment_images: [], ...extra }, {
      rpc: {
        expire_online_holds: () => 0,
        online_availability: () => [{ apartment_type_id: "t1", available_count: 2 }],
        quote_stay: () => ({ apartment_type_id: "t1", apartment_type: "Studio", check_in: "2027-07-01", check_out: "2027-07-08", nights: 7, currency: "GBP", bar_total_gbp: 280, total_gbp: 280, rate_per_night_gbp: 40, discount_percentage: 0, nightly: [], rate_plan: null }),
        create_online_booking: (a) => ({ booking: { id: "b1", reference: "BAS-7", status: "pending", property_id: "p1", apartment_id: "a1", guest_id: a.p_guest_id, check_in: a.p_check_in, check_out: a.p_check_out, nights: 7, adults: 2, children: 0, total_amount_gbp: 280, rate_per_night_gbp: 40, rate_plan_snapshot: null, hold_expires_at: "2027-06-01T10:30:00Z", guest_currency: "GBP", locale: "de", source: a.p_source }, quote: null, duplicate: false }),
      },
    });
    return { admin: sb, ctx, session: { id: "s1", property_id: "p1", channel: "web", locale: "de", status: "open", booking_id: null, message_count: 0 }, origin: "https://app.test", calls: [], outcome: {} };
  }
  const run = async (d: ToolDeps, name: string, input: unknown) => {
    const tool = buildTools(d).find((t) => t.name === name)!;
    return (await (tool.run as (i: unknown) => Promise<string>)(input)) as string;
  };

  it("check_availability rejects past dates and reports offers", async () => {
    const d = deps({ apartment_types: [{ id: "t1", property_id: "p1", name: "Studio", slug: "studio", bedrooms: 0, bathrooms: 1, max_occupancy: 2, size_sqm: 35, amenities: [], base_weekly_rate_gbp: 280 }] });
    expect(await run(d, "check_availability", { check_in: "2027-05-01", check_out: "2027-05-03", adults: 2, children: 0 })).toContain("in the past");
    const out = await run(d, "check_availability", { check_in: "2027-07-01", check_out: "2027-07-08", adults: 2, children: 0 });
    expect(out).toContain("Studio (id t1): 2 free; total 280 GBP");
    // the past-date refusal never reached the engine, so only one call is recorded
    expect(d.calls).toHaveLength(1);
    expect(d.calls[0]).toMatchObject({ name: "check_availability", ok: true });
  });
  it("create_hold needs accepted terms, then creates a concierge booking and the pay link", async () => {
    const d = deps();
    const refused = await run(d, "create_hold", { apartment_type_id: "11111111-1111-4111-8111-111111111111", check_in: "2027-07-01", check_out: "2027-07-08", adults: 2, children: 0, guest: { first_name: "Hans", last_name: "Müller", email: "hans@example.de" }, terms_accepted: false });
    expect(refused).toContain("not accepted");
    expect(d.outcome.pay_url).toBeUndefined();
    const ok = await run(d, "create_hold", { apartment_type_id: "11111111-1111-4111-8111-111111111111", check_in: "2027-07-01", check_out: "2027-07-08", adults: 2, children: 0, guest: { first_name: "Hans", last_name: "Müller", email: "hans@example.de", country: "de" }, terms_accepted: true });
    expect(ok).toContain("Reference BAS-7");
    expect(ok).toContain("deposit due now 56.00 GBP");
    expect(d.outcome).toMatchObject({ booking_id: "b1", reference: "BAS-7" });
    expect(d.outcome.pay_url).toMatch(/\/book\/[A-Za-z0-9_-]{43}$/);
    const { data: guests } = await d.admin.from("guests").select("*");
    expect(guests![0]).toMatchObject({ email: "hans@example.de", country: "DE", property_id: "p1" });
    // the recorded tool call never keeps the guest's contact details
    const rec = d.calls.find((c) => c.name === "create_hold" && c.ok)!;
    expect(JSON.stringify(rec.input)).not.toContain("hans@example.de");
    expect(JSON.stringify(rec.input)).not.toContain("Müller");
  });
  it("handoff notifies staff and marks the session", async () => {
    const d = deps();
    const out = await run(d, "handoff_to_staff", { reason: "Group of 30 for a wedding", guest_contact: null });
    expect(out).toContain("notified");
    expect(d.outcome.handoff).toBe(true);
    const { data: rows } = await d.admin.from("concierge_sessions").select("*").eq("id", "s1");
    expect(rows![0].status).toBe("handoff");
  });
});

describe("WhatsApp webhook signature", () => {
  it("verifies Meta's sha256= header against the app secret", () => {
    const body = JSON.stringify({ entry: [] });
    const sig = `sha256=${createHmac("sha256", "app-secret").update(body).digest("hex")}`;
    expect(verifyMetaSignature("app-secret", sig, body)).toBe(true);
    expect(verifyMetaSignature("app-secret", sig, body + " ")).toBe(false);
    expect(verifyMetaSignature("other", sig, body)).toBe(false);
    expect(verifyMetaSignature("app-secret", null, body)).toBe(false);
    expect(verifyMetaSignature("app-secret", "md5=abc", body)).toBe(false);
  });
});
