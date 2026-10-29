// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { createFakeSupabase } from "./__mocks__/supabase-fake";
import {
  signPayload, verifySignature, channelEventSchema, resolveMapping, buildAriPayload, processChannelEvent, pushAri, adapterFor,
  type ChannelConnection, type RoomMapping, type AriRow,
} from "@/lib/channel-manager";

vi.mock("@/lib/event-bus", () => ({ emitEvent: vi.fn(async () => ({ event_id: "e", results: [] })) }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn(async () => 1) }));

const connection: ChannelConnection = {
  id: "c1", property_id: "p1", channel_id: "ch-bcom", channel_code: "booking_com", provider: "generic", name: "Booking.com", status: "active",
  hotel_code: "H-123", webhook_secret: "s3cret-s3cret-s3cret", push_url: null, push_auth_ref: null, push_days: 30, rate_plan_id: null, markup_percent: 10, settings: {},
};
const mappings: RoomMapping[] = [
  { id: "m1", apartment_type_id: "t-studio", external_room_id: "STD", external_rate_plan_id: "default", rate_plan_id: null, is_active: true },
  { id: "m2", apartment_type_id: "t-studio", external_room_id: "STD", external_rate_plan_id: "NRF", rate_plan_id: "rp-nrf", is_active: true },
  { id: "m3", apartment_type_id: "t-2bed", external_room_id: "APT2", external_rate_plan_id: "default", rate_plan_id: null, is_active: true },
];
const baseEvent = {
  event_id: "evt-1", type: "reservation.created" as const,
  reservation: { external_ref: "BCOM-777", room_id: "STD", rate_plan_id: "NRF", check_in: "2027-07-01", check_out: "2027-07-05", adults: 2, children: 0, guest: { first_name: "Hans", last_name: "Müller", email: "Hans@Example.de", country: "de", language: "de-DE" }, total: { amount: 480, currency: "EUR" }, special_requests: "high floor" },
};

describe("webhook signatures", () => {
  it("round-trips and rejects tampering, wrong secrets and stale timestamps", () => {
    const body = JSON.stringify({ hello: "world" });
    const now = 1_800_000_000;
    const header = signPayload("secret-a", body, now);
    expect(header).toMatch(/^t=1800000000,v1=[0-9a-f]{64}$/);
    expect(verifySignature("secret-a", header, body, now + 10).ok).toBe(true);
    expect(verifySignature("secret-a", header, body + " ", now).ok).toBe(false);
    expect(verifySignature("secret-b", header, body, now).ok).toBe(false);
    expect(verifySignature("secret-a", header, body, now + 301)).toMatchObject({ ok: false, reason: "timestamp outside tolerance" });
    expect(verifySignature("secret-a", null, body, now).reason).toBe("missing signature");
    expect(verifySignature("secret-a", "garbage", body, now).reason).toBe("malformed signature");
  });
});

describe("generic event format", () => {
  it("accepts a single event, a list, or an {events} envelope and normalises country", () => {
    const a = adapterFor("generic").parseInbound(baseEvent);
    expect(a).toHaveLength(1);
    expect(a[0].reservation.guest.country).toBe("DE");
    expect(adapterFor("siteminder").parseInbound([baseEvent, { ...baseEvent, event_id: "evt-2" }])).toHaveLength(2);
    expect(adapterFor("booking_com").parseInbound({ events: [baseEvent] })).toHaveLength(1);
  });
  it("refuses malformed events", () => {
    expect(channelEventSchema.safeParse({ ...baseEvent, type: "reservation.exploded" }).success).toBe(false);
    expect(channelEventSchema.safeParse({ ...baseEvent, reservation: { ...baseEvent.reservation, check_out: "2027-07-0" } }).success).toBe(false);
    expect(() => adapterFor("generic").parseInbound({ nope: true })).toThrow();
  });
  it("resolves room + rate plan mappings with a default fallback", () => {
    expect(resolveMapping(mappings, "STD", "NRF")?.id).toBe("m2");
    expect(resolveMapping(mappings, "STD", "UNKNOWN")?.id).toBe("m1");
    expect(resolveMapping(mappings, "STD", null)?.id).toBe("m1");
    expect(resolveMapping(mappings, "APT2", "NRF")?.id).toBe("m3");
    expect(resolveMapping(mappings, "PENT", null)).toBeNull();
  });
});

describe("inbound processing", () => {
  function fake(extra: Record<string, unknown[]> = {}, rpc: Record<string, (a: Record<string, unknown>) => unknown> = {}) {
    return createFakeSupabase(
      { channel_messages: [], channel_connections: [{ id: "c1" }], channel_room_mappings: [], bookings: [], guests: [], currency_rates: [{ base_currency: "GBP", target_currency: "EUR", rate: 1.2, fetched_at: "2027-01-01" }], ...extra },
      {
        rpc: {
          create_online_booking: (args) => ({ booking: { id: "b-new", reference: "BAS-1", status: "confirmed", property_id: "p1", apartment_id: "a1", check_in: args.p_check_in, check_out: args.p_check_out, adults: args.p_adults, children: args.p_children, nights: 4, total_amount_gbp: args.p_total_gbp, rate_per_night_gbp: 100, rate_plan_snapshot: null, hold_expires_at: null, guest_currency: "EUR", locale: "de", source: "channel" }, duplicate: false }),
          modify_booking_stay: () => ({ booking: { id: "b-1" }, moved: true }),
          ...rpc,
        },
      }
    );
  }

  it("creates a confirmed channel booking at the OTA's price in GBP and logs the message", async () => {
    const sb = fake();
    const calls: Record<string, unknown>[] = [];
    const sb2 = fake({}, { create_online_booking: (a) => { calls.push(a); return (sb as unknown as { rpcStub?: unknown }).rpcStub ?? { booking: { id: "b-new", reference: "BAS-1", status: "confirmed", property_id: "p1", apartment_id: "a1", check_in: a.p_check_in, check_out: a.p_check_out, adults: 2, children: 0, nights: 4, total_amount_gbp: a.p_total_gbp, rate_per_night_gbp: 100, rate_plan_snapshot: null, hold_expires_at: null, guest_currency: "EUR", locale: "de", source: "channel" }, duplicate: false }; } });
    const res = await processChannelEvent(sb2, connection, channelEventSchema.parse(baseEvent), mappings);
    expect(res).toMatchObject({ status: "processed", action: "created", booking_id: "b-new", reference: "BAS-1" });
    expect(calls[0]).toMatchObject({ p_source: "channel", p_channel_code: "booking_com", p_external_ref: "BCOM-777", p_confirmed: true, p_total_gbp: 400, p_rate_plan_id: "rp-nrf", p_apartment_type_id: "t-studio", p_hold_minutes: null });
    const { data: guests } = await sb2.from("guests").select("*");
    expect(guests![0]).toMatchObject({ email: "hans@example.de", country: "DE", language: "de", property_id: "p1" });
    const { data: msgs } = await sb2.from("channel_messages").select("*");
    expect(msgs).toHaveLength(1);
    expect(msgs![0]).toMatchObject({ direction: "in", kind: "reservation", idempotency_key: "evt-1", status: "processed", booking_id: "b-new" });
  });

  it("is idempotent on event_id and dedupes on external_ref", async () => {
    const sb = fake();
    const ev = channelEventSchema.parse(baseEvent);
    const first = await processChannelEvent(sb, connection, ev, mappings);
    expect(first.status).toBe("processed");
    const again = await processChannelEvent(sb, connection, ev, mappings);
    expect(again).toMatchObject({ status: "duplicate", action: "created", booking_id: "b-new" });
    // A different event id for a reservation we already hold creates nothing new.
    const sb3 = fake({ bookings: [{ id: "b-old", reference: "BAS-9", status: "confirmed", channel_id: "ch-bcom", external_ref: "BCOM-777", apartment_id: "a1" }] });
    const dup = await processChannelEvent(sb3, connection, { ...ev, event_id: "evt-9" }, mappings);
    expect(dup).toMatchObject({ status: "processed", action: "none", booking_id: "b-old" });
  });

  it("fails cleanly on unmapped rooms and unknown cancellations", async () => {
    const sb = fake();
    const bad = await processChannelEvent(sb, connection, channelEventSchema.parse({ ...baseEvent, event_id: "evt-x", reservation: { ...baseEvent.reservation, room_id: "PENT" } }), mappings);
    expect(bad.status).toBe("failed");
    expect(bad.error).toMatch(/MAPPING_NOT_FOUND/);
    const cancelUnknown = await processChannelEvent(sb, connection, channelEventSchema.parse({ ...baseEvent, event_id: "evt-c", type: "reservation.cancelled" }), mappings);
    expect(cancelUnknown.error).toMatch(/UNKNOWN_RESERVATION/);
    const { data: msgs } = await sb.from("channel_messages").select("*");
    expect(msgs!.every((m) => m.status === "failed")).toBe(true);
  });

  it("modifies and cancels existing reservations", async () => {
    const sb = fake({ bookings: [{ id: "b-1", reference: "BAS-5", status: "confirmed", channel_id: "ch-bcom", external_ref: "BCOM-777", apartment_id: "a1" }] });
    const mod = await processChannelEvent(sb, connection, channelEventSchema.parse({ ...baseEvent, event_id: "evt-m", type: "reservation.modified", reservation: { ...baseEvent.reservation, check_out: "2027-07-08", total_gbp: 700 } }), mappings);
    expect(mod).toMatchObject({ status: "processed", action: "modified", booking_id: "b-1" });
    const can = await processChannelEvent(sb, connection, channelEventSchema.parse({ ...baseEvent, event_id: "evt-k", type: "reservation.cancelled" }), mappings);
    expect(can).toMatchObject({ status: "processed", action: "cancelled", booking_id: "b-1" });
    const { data: rows } = await sb.from("bookings").select("*").eq("id", "b-1");
    expect(rows![0]).toMatchObject({ status: "cancelled" });
    expect(String(rows![0].cancellation_reason)).toContain("Booking.com");
    // cancelling again is refused (already cancelled), not applied twice
    const twice = await processChannelEvent(sb, connection, channelEventSchema.parse({ ...baseEvent, event_id: "evt-k2", type: "reservation.cancelled" }), mappings);
    expect(twice.status).toBe("failed");
  });
});

describe("outbound ARI", () => {
  const rows: AriRow[] = [
    { apartment_type_id: "t-studio", day: "2027-07-01", total: 10, available: 3, bar_gbp: 40, rate_gbp: 40, min_stay: 1, closed: false },
    { apartment_type_id: "t-studio", day: "2027-07-02", total: 10, available: 0, bar_gbp: 40, rate_gbp: 40, min_stay: 1, closed: true },
    { apartment_type_id: "t-pent", day: "2027-07-01", total: 2, available: 2, bar_gbp: 200, rate_gbp: 180, min_stay: 3, closed: false },
  ];
  it("groups by mapped room, applies the markup and reports unmapped types", () => {
    const p = buildAriPayload(rows, mappings, connection, "2027-07-01", "2027-07-03", new Date("2027-06-01T00:00:00Z"));
    expect(p.hotel_code).toBe("H-123");
    expect(p.rooms.map((r) => `${r.room_id}/${r.rate_plan_id}`)).toEqual(["STD/default", "STD/NRF"]);
    expect(p.rooms[0].days[0]).toEqual({ date: "2027-07-01", available: 3, rate: 44, min_stay: 1, closed: false });
    expect(p.rooms[0].days[1].closed).toBe(true);
    expect(p.unmapped_types).toEqual(["t-pent"]);
  });
  it("dry-runs without a push_url, signs and sends with one, and records failures", async () => {
    const sb = createFakeSupabase({ channel_messages: [], channel_connections: [{ id: "c1", status: "active" }], channel_room_mappings: mappings.map((m) => ({ ...m, connection_id: "c1" })) }, { rpc: { channel_ari: () => rows } });
    const dry = await pushAri(sb, connection, { from: "2027-07-01", to: "2027-07-03" });
    expect(dry).toMatchObject({ status: "skipped", rooms: 2, http_status: null });

    const seen: { url: string; headers: Record<string, string>; body: string }[] = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => { seen.push({ url: String(url), headers: init!.headers as Record<string, string>, body: String(init!.body) }); return new Response("{}", { status: 200 }); }) as typeof fetch;
    process.env.BCOM_TOKEN = "tok-123";
    const sent = await pushAri(sb, { ...connection, push_url: "https://cm.example/ari", push_auth_ref: "BCOM_TOKEN" }, { from: "2027-07-01", to: "2027-07-03", fetchImpl });
    expect(sent.status).toBe("processed");
    expect(seen[0].headers.Authorization).toBe("Bearer tok-123");
    expect(verifySignature("s3cret-s3cret-s3cret", seen[0].headers["x-hospitai-signature"], seen[0].body).ok).toBe(true);
    expect(JSON.parse(seen[0].body).rooms).toHaveLength(2);

    const failing = (async () => new Response("nope", { status: 500 })) as typeof fetch;
    const failed = await pushAri(sb, { ...connection, push_url: "https://cm.example/ari" }, { from: "2027-07-01", to: "2027-07-03", fetchImpl: failing });
    expect(failed).toMatchObject({ status: "failed", http_status: 500 });
    const { data: conn } = await sb.from("channel_connections").select("*").eq("id", "c1");
    expect(conn![0]).toMatchObject({ status: "error", last_push_status: "failed" });
    const { data: msgs } = await sb.from("channel_messages").select("*");
    expect(msgs!.map((m) => m.status)).toEqual(["skipped", "processed", "failed"]);
  });
});
