import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { encryptPii, decryptPii } from "@/lib/pii-crypto";
import { upsertOnlineGuest, notifyFrontDesk, round2, type OnlineBookingRow } from "@/lib/online-booking";
import { emitEvent } from "@/lib/event-bus";
import { logger } from "@/lib/logger";

/**
 * Channel manager connector — Sales module, slice 3 (migration 00038).
 *
 * Inbound: a channel manager (or OTA connectivity API) posts reservation
 * events to /api/v1/channels/:code/reservations, signed with the
 * connection's HMAC secret. Events are normalised to one shape, logged with
 * an idempotency key and turned into bookings through the same database
 * functions the website uses. Outbound: availability, rates and
 * restrictions (ARI) are computed by `channel_ari()` and pushed to the
 * connection's endpoint, signed the same way.
 *
 * The "generic" provider is HospitAI's own documented JSON format (see
 * docs/CHANNEL-MANAGER.md); provider-specific adapters translate to and
 * from it and plug into PROVIDERS below.
 */

export const SIGNATURE_HEADER = "x-hospitai-signature";
export const SIGNATURE_TOLERANCE_S = 300;

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

export function signPayload(secret: string, rawBody: string, timestamp: number = Math.floor(Date.now() / 1000)): string {
  const mac = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return `t=${timestamp},v1=${mac}`;
}

export function verifySignature(secret: string, header: string | null, rawBody: string, nowS: number = Math.floor(Date.now() / 1000)): { ok: boolean; reason?: string } {
  if (!header) return { ok: false, reason: "missing signature" };
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=") as [string, string]));
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isFinite(t) || !v1) return { ok: false, reason: "malformed signature" };
  if (Math.abs(nowS - t) > SIGNATURE_TOLERANCE_S) return { ok: false, reason: "timestamp outside tolerance" };
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(v1, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "signature mismatch" };
  return { ok: true };
}

export const encryptSecret = (s: string) => encryptPii(s) ?? s;
export const decryptSecret = (s: string | null | undefined) => (s ? decryptPii(s) : null);

// ---------------------------------------------------------------------------
// Generic event format
// ---------------------------------------------------------------------------

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const channelReservationSchema = z.object({
  external_ref: z.string().min(1).max(80),
  room_id: z.string().min(1).max(80),
  rate_plan_id: z.string().max(80).optional().nullable(),
  check_in: isoDate,
  check_out: isoDate,
  adults: z.number().int().min(1).max(20),
  children: z.number().int().min(0).max(20).default(0),
  guest: z.object({
    first_name: z.string().trim().min(1).max(50),
    last_name: z.string().trim().min(1).max(50),
    email: z.string().trim().email().max(100).optional().nullable(),
    phone: z.string().trim().max(20).optional().nullable(),
    country: z.string().trim().length(2).toUpperCase().optional().nullable(),
    language: z.string().trim().max(5).optional().nullable(),
  }),
  total: z.object({ amount: z.number().nonnegative(), currency: z.string().length(3).toUpperCase() }).optional().nullable(),
  /** Total in GBP when the channel can convert; otherwise we convert at the stored rate or price ourselves. */
  total_gbp: z.number().nonnegative().optional().nullable(),
  special_requests: z.string().max(1000).optional().nullable(),
});

export const channelEventSchema = z.object({
  event_id: z.string().min(1).max(120),
  type: z.enum(["reservation.created", "reservation.modified", "reservation.cancelled"]),
  sent_at: z.string().optional(),
  reservation: channelReservationSchema,
});
export type ChannelEvent = z.infer<typeof channelEventSchema>;

export interface ChannelConnection {
  id: string;
  property_id: string;
  channel_id: string;
  channel_code: string;
  provider: string;
  name: string;
  status: "inactive" | "active" | "error";
  hotel_code: string | null;
  webhook_secret: string | null;
  push_url: string | null;
  push_auth_ref: string | null;
  push_days: number;
  rate_plan_id: string | null;
  markup_percent: number;
  settings: Record<string, unknown>;
}

export interface RoomMapping {
  id: string;
  apartment_type_id: string;
  external_room_id: string;
  external_rate_plan_id: string;
  rate_plan_id: string | null;
  is_active: boolean;
}

/** Provider adapters: translate the provider's wire format to/from the generic one. */
export interface ProviderAdapter {
  /** Parse the raw inbound body into generic events (throws on malformed input). */
  parseInbound(raw: unknown): ChannelEvent[];
  /** Shape the ARI rows into the provider's push payload. */
  formatAri(payload: AriPayload): unknown;
}

const genericAdapter: ProviderAdapter = {
  parseInbound(raw) {
    const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as { events?: unknown }).events) ? (raw as { events: unknown[] }).events : [raw];
    return list.map((e) => channelEventSchema.parse(e));
  },
  formatAri(payload) {
    return payload;
  },
};

export const PROVIDERS: Record<string, ProviderAdapter> = {
  generic: genericAdapter,
  // Named providers use the generic format until their own adapter lands;
  // the connection's provider is recorded so the switch is a config change.
  siteminder: genericAdapter,
  cloudbeds: genericAdapter,
  booking_com: genericAdapter,
  expedia: genericAdapter,
  airbnb: genericAdapter,
  agoda: genericAdapter,
  ostrovok: genericAdapter,
};

export function adapterFor(provider: string): ProviderAdapter {
  return PROVIDERS[provider] ?? genericAdapter;
}

// ---------------------------------------------------------------------------
// Connections and mappings
// ---------------------------------------------------------------------------

const CONNECTION_COLUMNS = "id, property_id, channel_id, provider, name, status, hotel_code, webhook_secret, push_url, push_auth_ref, push_days, rate_plan_id, markup_percent, settings, channel:booking_channels(code)";

function toConnection(row: Record<string, unknown>): ChannelConnection {
  const ch = row.channel as { code: string } | null;
  return {
    id: row.id as string,
    property_id: row.property_id as string,
    channel_id: row.channel_id as string,
    channel_code: ch?.code ?? "",
    provider: row.provider as string,
    name: row.name as string,
    status: row.status as ChannelConnection["status"],
    hotel_code: (row.hotel_code as string | null) ?? null,
    webhook_secret: (row.webhook_secret as string | null) ?? null,
    push_url: (row.push_url as string | null) ?? null,
    push_auth_ref: (row.push_auth_ref as string | null) ?? null,
    push_days: Number(row.push_days ?? 365),
    rate_plan_id: (row.rate_plan_id as string | null) ?? null,
    markup_percent: Number(row.markup_percent ?? 0),
    settings: (row.settings as Record<string, unknown>) ?? {},
  };
}

/** Connection for a channel code, optionally scoped to a property (service role). */
export async function connectionByCode(admin: SupabaseClient, code: string, propertyId?: string | null): Promise<ChannelConnection | null> {
  const { data: channel } = await admin.from("booking_channels").select("id").eq("code", code).maybeSingle();
  if (!channel) return null;
  let q = admin.from("channel_connections").select(CONNECTION_COLUMNS).eq("channel_id", channel.id);
  if (propertyId) q = q.eq("property_id", propertyId);
  const { data } = await q.order("created_at", { ascending: true }).limit(1).maybeSingle();
  return data ? toConnection(data as Record<string, unknown>) : null;
}

export async function listActiveConnections(admin: SupabaseClient): Promise<ChannelConnection[]> {
  const { data } = await admin.from("channel_connections").select(CONNECTION_COLUMNS).eq("status", "active");
  return ((data || []) as Record<string, unknown>[]).map(toConnection);
}

export async function listMappings(admin: SupabaseClient, connectionId: string): Promise<RoomMapping[]> {
  const { data } = await admin.from("channel_room_mappings").select("id, apartment_type_id, external_room_id, external_rate_plan_id, rate_plan_id, is_active").eq("connection_id", connectionId);
  return ((data || []) as RoomMapping[]).filter((m) => m.is_active);
}

/** Room id (+ optional rate plan id) -> mapping; falls back to the room's 'default' plan. */
export function resolveMapping(mappings: RoomMapping[], roomId: string, ratePlanId?: string | null): RoomMapping | null {
  const exact = ratePlanId ? mappings.find((m) => m.external_room_id === roomId && m.external_rate_plan_id === ratePlanId) : null;
  return exact ?? mappings.find((m) => m.external_room_id === roomId && m.external_rate_plan_id === "default") ?? mappings.find((m) => m.external_room_id === roomId) ?? null;
}

// ---------------------------------------------------------------------------
// Inbound processing
// ---------------------------------------------------------------------------

export interface ProcessResult {
  event_id: string;
  status: "processed" | "duplicate" | "failed";
  action: "created" | "modified" | "cancelled" | "none";
  booking_id: string | null;
  reference: string | null;
  error: string | null;
}

async function convertToGbp(admin: SupabaseClient, amount: number, currency: string): Promise<number | null> {
  if (currency === "GBP") return round2(amount);
  const { data } = await admin.from("currency_rates").select("rate").eq("base_currency", "GBP").eq("target_currency", currency).order("fetched_at", { ascending: false }).limit(1).maybeSingle();
  if (!data?.rate) return null;
  return round2(amount / Number(data.rate));
}

/**
 * Apply one normalised event. Idempotent on (connection, event_id): a retry
 * of a processed event returns the original outcome without touching the
 * booking. Every event is logged in channel_messages.
 */
export async function processChannelEvent(admin: SupabaseClient, connection: ChannelConnection, event: ChannelEvent, mappings?: RoomMapping[]): Promise<ProcessResult> {
  const kind = event.type === "reservation.created" ? "reservation" : event.type === "reservation.modified" ? "modification" : "cancellation";
  const { data: prior } = await admin.from("channel_messages").select("id, status, booking_id, result").eq("connection_id", connection.id).eq("direction", "in").eq("idempotency_key", event.event_id).maybeSingle();
  if (prior) {
    const r = (prior.result as Partial<ProcessResult> | null) ?? {};
    return { event_id: event.event_id, status: "duplicate", action: (r.action as ProcessResult["action"]) ?? "none", booking_id: (prior.booking_id as string | null) ?? null, reference: r.reference ?? null, error: null };
  }
  const { data: msg, error: msgErr } = await admin
    .from("channel_messages")
    .insert({ connection_id: connection.id, property_id: connection.property_id, direction: "in", kind, idempotency_key: event.event_id, external_ref: event.reservation.external_ref, status: "received", payload: event })
    .select("id")
    .single();
  if (msgErr || !msg) {
    // Unique index hit between our select and insert: a concurrent delivery won.
    return { event_id: event.event_id, status: "duplicate", action: "none", booking_id: null, reference: null, error: null };
  }

  const finish = async (res: Omit<ProcessResult, "event_id">) => {
    await admin.from("channel_messages").update({ status: res.status, booking_id: res.booking_id, error: res.error, result: res }).eq("id", msg.id);
    await admin.from("channel_connections").update({ last_inbound_at: new Date().toISOString(), ...(res.status === "failed" ? { last_error: res.error } : {}) }).eq("id", connection.id);
    return { event_id: event.event_id, ...res };
  };

  try {
    const r = event.reservation;
    const maps = mappings ?? (await listMappings(admin, connection.id));
    const { data: existing } = await admin.from("bookings").select("id, reference, status, apartment_id").eq("channel_id", connection.channel_id).eq("external_ref", r.external_ref).maybeSingle();

    const totalGbp = r.total_gbp ?? (r.total ? await convertToGbp(admin, r.total.amount, r.total.currency) : null);

    if (event.type === "reservation.cancelled") {
      if (!existing) return finish({ status: "failed", action: "none", booking_id: null, reference: null, error: "UNKNOWN_RESERVATION: nothing to cancel" });
      if (!["pending", "confirmed"].includes(existing.status as string)) {
        return finish({ status: "failed", action: "none", booking_id: existing.id as string, reference: existing.reference as string, error: `INVALID_STATUS: booking is ${existing.status}` });
      }
      const { error } = await admin.from("bookings").update({ status: "cancelled", cancelled_at: new Date().toISOString(), hold_expires_at: null, cancellation_reason: `Cancelled by ${connection.name} (${r.external_ref})` }).eq("id", existing.id);
      if (error) return finish({ status: "failed", action: "none", booking_id: existing.id as string, reference: existing.reference as string, error: error.message });
      await notifyFrontDesk(admin, { id: existing.id as string, reference: existing.reference as string, check_in: r.check_in, check_out: r.check_out, adults: r.adults, children: r.children }, `${connection.name} cancellation`);
      await emitEvent("booking.cancelled", "channel-manager", { booking_id: existing.id, reference: existing.reference, channel: connection.channel_code, external_ref: r.external_ref }, admin, { idempotencyKey: `channel:${connection.id}:${event.event_id}` }).catch(() => undefined);
      return finish({ status: "processed", action: "cancelled", booking_id: existing.id as string, reference: existing.reference as string, error: null });
    }

    if (event.type === "reservation.modified" && existing) {
      const { data, error } = await admin.rpc("modify_booking_stay", { p_booking_id: existing.id, p_check_in: r.check_in, p_check_out: r.check_out, p_adults: r.adults, p_children: r.children, p_total_gbp: totalGbp });
      if (error) return finish({ status: "failed", action: "none", booking_id: existing.id as string, reference: existing.reference as string, error: error.message });
      const moved = Boolean((data as { moved?: boolean })?.moved);
      await notifyFrontDesk(admin, { id: existing.id as string, reference: existing.reference as string, check_in: r.check_in, check_out: r.check_out, adults: r.adults, children: r.children }, `${connection.name} modification${moved ? " (unit re-assigned)" : ""}`);
      return finish({ status: "processed", action: "modified", booking_id: existing.id as string, reference: existing.reference as string, error: null });
    }

    // created (or a modification for a reservation we never saw: treat as new)
    if (existing) {
      return finish({ status: "processed", action: "none", booking_id: existing.id as string, reference: existing.reference as string, error: null });
    }
    const mapping = resolveMapping(maps, r.room_id, r.rate_plan_id);
    if (!mapping) return finish({ status: "failed", action: "none", booking_id: null, reference: null, error: `MAPPING_NOT_FOUND: room ${r.room_id} is not mapped on ${connection.name}` });

    const email = r.guest.email?.trim().toLowerCase() || `${r.external_ref.toLowerCase().replace(/[^a-z0-9]+/g, "-")}@${connection.channel_code}.guest.invalid`;
    const guest = await upsertOnlineGuest(admin, { first_name: r.guest.first_name, last_name: r.guest.last_name, email, phone: r.guest.phone ?? null, country: r.guest.country ?? null, language: r.guest.language?.slice(0, 2) ?? "en", marketing_consent: false }, connection.property_id);
    const { data, error } = await admin.rpc("create_online_booking", {
      p_property_id: connection.property_id,
      p_apartment_type_id: mapping.apartment_type_id,
      p_check_in: r.check_in,
      p_check_out: r.check_out,
      p_adults: r.adults,
      p_children: r.children,
      p_guest_id: guest.id,
      p_rate_plan_id: mapping.rate_plan_id ?? connection.rate_plan_id,
      p_channel_code: connection.channel_code,
      p_source: "channel",
      p_locale: r.guest.language?.slice(0, 2) ?? null,
      p_guest_currency: r.total?.currency ?? "GBP",
      p_special_requests: r.special_requests ?? null,
      p_hold_minutes: null,
      p_external_ref: r.external_ref,
      p_total_gbp: totalGbp,
      p_confirmed: true,
    });
    if (error) return finish({ status: "failed", action: "none", booking_id: null, reference: null, error: error.message });
    const created = (data as { booking: OnlineBookingRow; duplicate: boolean }).booking;
    await notifyFrontDesk(admin, created, `New ${connection.name} booking`, totalGbp !== null ? `${totalGbp.toFixed(2)} GBP` : "");
    await emitEvent("booking.confirmed", "channel-manager", { booking_id: created.id, reference: created.reference, channel: connection.channel_code, external_ref: r.external_ref }, admin, { idempotencyKey: `channel:${connection.id}:${event.event_id}` }).catch(() => undefined);
    return finish({ status: "processed", action: "created", booking_id: created.id, reference: created.reference, error: null });
  } catch (err) {
    logger.error({ err: String(err), connection: connection.id, event: event.event_id }, "[channel-manager] event failed");
    return finish({ status: "failed", action: "none", booking_id: null, reference: null, error: err instanceof Error ? err.message : String(err) });
  }
}

// ---------------------------------------------------------------------------
// Outbound ARI
// ---------------------------------------------------------------------------

export interface AriRow {
  apartment_type_id: string;
  day: string;
  total: number;
  available: number;
  bar_gbp: number;
  rate_gbp: number;
  min_stay: number;
  closed: boolean;
}

export interface AriPayload {
  hotel_code: string | null;
  channel: string;
  currency: "GBP";
  generated_at: string;
  from: string;
  to: string;
  rooms: { room_id: string; rate_plan_id: string; days: { date: string; available: number; rate: number; min_stay: number; closed: boolean }[] }[];
  unmapped_types: string[];
}

export async function computeAri(admin: SupabaseClient, propertyId: string, from: string, to: string, ratePlanId?: string | null): Promise<AriRow[]> {
  const { data, error } = await admin.rpc("channel_ari", { p_property_id: propertyId, p_from: from, p_to: to, p_rate_plan_id: ratePlanId ?? null });
  if (error) throw new Error(`channel_ari: ${error.message}`);
  return ((data || []) as Record<string, unknown>[]).map((r) => ({
    apartment_type_id: String(r.apartment_type_id),
    day: String(r.day),
    total: Number(r.total),
    available: Number(r.available),
    bar_gbp: Number(r.bar_gbp),
    rate_gbp: Number(r.rate_gbp),
    min_stay: Number(r.min_stay),
    closed: Boolean(r.closed),
  }));
}

/** Group ARI rows by mapped OTA room / rate plan, applying the connection markup. */
export function buildAriPayload(rows: AriRow[], mappings: RoomMapping[], connection: Pick<ChannelConnection, "hotel_code" | "channel_code" | "markup_percent">, from: string, to: string, now: Date = new Date()): AriPayload {
  const factor = 1 + (connection.markup_percent || 0) / 100;
  const rooms: AriPayload["rooms"] = [];
  const mappedTypes = new Set<string>();
  for (const m of mappings) {
    const days = rows.filter((r) => r.apartment_type_id === m.apartment_type_id);
    if (!days.length) continue;
    mappedTypes.add(m.apartment_type_id);
    rooms.push({
      room_id: m.external_room_id,
      rate_plan_id: m.external_rate_plan_id,
      days: days.map((d) => ({ date: d.day, available: Math.max(0, d.available), rate: round2(d.rate_gbp * factor), min_stay: d.min_stay, closed: d.closed })),
    });
  }
  const unmapped = [...new Set(rows.map((r) => r.apartment_type_id))].filter((t) => !mappedTypes.has(t));
  return { hotel_code: connection.hotel_code, channel: connection.channel_code, currency: "GBP", generated_at: now.toISOString(), from, to, rooms, unmapped_types: unmapped };
}

export interface PushResult {
  connection_id: string;
  status: "processed" | "skipped" | "failed";
  rooms: number;
  days: number;
  http_status: number | null;
  error: string | null;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Push ARI for one connection. Without a push_url the payload is computed
 * and logged but not sent (dry run), which is how a connection is checked
 * before the provider credentials exist.
 */
export async function pushAri(admin: SupabaseClient, connection: ChannelConnection, opts: { from?: string; to?: string; fetchImpl?: typeof fetch } = {}): Promise<PushResult> {
  const today = new Date();
  const from = opts.from ?? isoDay(today);
  const to = opts.to ?? isoDay(new Date(today.getTime() + connection.push_days * 86_400_000));
  const base: PushResult = { connection_id: connection.id, status: "skipped", rooms: 0, days: 0, http_status: null, error: null };
  const log = async (res: PushResult, payload: unknown) => {
    await admin.from("channel_messages").insert({ connection_id: connection.id, property_id: connection.property_id, direction: "out", kind: "ari_push", idempotency_key: null, status: res.status, error: res.error, payload: { from, to, rooms: res.rooms, days: res.days }, result: { http_status: res.http_status, sample: Array.isArray((payload as AriPayload)?.rooms) ? (payload as AriPayload).rooms.slice(0, 1).map((r) => ({ ...r, days: r.days.slice(0, 3) })) : null } });
    await admin.from("channel_connections").update({ last_push_at: new Date().toISOString(), last_push_status: res.status, ...(res.status === "failed" ? { last_error: res.error, status: "error" } : {}) }).eq("id", connection.id);
    return res;
  };
  try {
    const [rows, mappings] = await Promise.all([computeAri(admin, connection.property_id, from, to, connection.rate_plan_id), listMappings(admin, connection.id)]);
    const payload = buildAriPayload(rows, mappings, connection, from, to);
    const res: PushResult = { ...base, rooms: payload.rooms.length, days: payload.rooms[0]?.days.length ?? 0 };
    if (!payload.rooms.length) return log({ ...res, status: "skipped", error: "no room mappings" }, payload);
    if (!connection.push_url) return log({ ...res, status: "skipped" }, payload);

    const body = JSON.stringify(adapterFor(connection.provider).formatAri(payload));
    const headers: Record<string, string> = { "Content-Type": "application/json", "User-Agent": "HospitAI-ChannelManager/1.0" };
    const secret = decryptSecret(connection.webhook_secret);
    if (secret) headers[SIGNATURE_HEADER] = signPayload(secret, body);
    const token = connection.push_auth_ref ? process.env[connection.push_auth_ref] : undefined;
    if (token) headers.Authorization = `Bearer ${token}`;
    const f = opts.fetchImpl ?? fetch;
    const resp = await f(connection.push_url, { method: "POST", headers, body, signal: AbortSignal.timeout(20_000) });
    if (!resp.ok) return log({ ...res, status: "failed", http_status: resp.status, error: `provider answered ${resp.status}` }, payload);
    return log({ ...res, status: "processed", http_status: resp.status }, payload);
  } catch (err) {
    return log({ ...base, status: "failed", error: err instanceof Error ? err.message : String(err) }, null);
  }
}

/** Cron entry point: push every active connection. */
export async function pushAllConnections(admin: SupabaseClient): Promise<PushResult[]> {
  const connections = await listActiveConnections(admin);
  const out: PushResult[] = [];
  for (const c of connections) out.push(await pushAri(admin, c));
  return out;
}
