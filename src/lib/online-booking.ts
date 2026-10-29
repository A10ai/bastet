import type { SupabaseClient } from "@supabase/supabase-js";
import { describeCancellation, type RatePlanSnapshot, type StayQuote } from "@/lib/rate-plans";
import { generatePortalToken, hashPortalToken, portalExpiry, buildPortalUrl } from "@/lib/portal";
import { createNotification } from "@/lib/notifications";
import { logger } from "@/lib/logger";

/**
 * Online (direct) booking engine — Sales module, slice 1 (migration 00037).
 *
 * The public website and the AI concierge sell inventory through these
 * functions. A web booking is an ordinary *pending* booking with a hold
 * expiry; the deposit confirms it, the cron cancels it if nobody pays.
 * Every call uses the service-role client: anon has no table access, and
 * the booking token (same scheme as the guest portal) is the guest's only
 * credential. Nothing here returns identity documents or staff notes.
 */

export const ONLINE_CHANNEL_CODE = "web";
export const ONLINE_LOCALES = ["en", "de", "pl", "ru", "cs"] as const;
export type OnlineLocale = (typeof ONLINE_LOCALES)[number];

export interface SalesSettings {
  property_id: string;
  online_enabled: boolean;
  deposit_percent: number;
  hold_minutes: number;
  request_hold_hours: number;
  min_lead_days: number;
  max_advance_days: number;
  max_nights: number;
  max_guests_per_booking: number;
  currencies: string[];
  terms_url: string | null;
}

export const DEFAULT_SALES_SETTINGS: Omit<SalesSettings, "property_id"> = {
  online_enabled: true,
  deposit_percent: 20,
  hold_minutes: 30,
  request_hold_hours: 48,
  min_lead_days: 0,
  max_advance_days: 540,
  max_nights: 90,
  max_guests_per_booking: 8,
  currencies: ["GBP", "EUR", "USD", "EGP"],
  terms_url: null,
};

export interface PublicProperty {
  id: string;
  slug: string;
  name: string;
  city: string;
  country: string;
  star_rating: number | null;
  opening_date: string | null;
  status: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  timezone: string;
}

export interface PublicApartmentType {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  bedrooms: number;
  bathrooms: number;
  max_occupancy: number;
  size_sqm: number | null;
  amenities: string[];
  images: { url: string; alt: string | null }[];
}

export interface AvailabilityOffer {
  apartment_type: PublicApartmentType;
  available_count: number;
  quote: StayQuote | null;
  cancellation: string | null;
  deposit_gbp: number | null;
  unavailable_reason: string | null;
}

export interface AvailabilitySearch {
  propertyId: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  ratePlanId?: string | null;
}

/** Property by slug or id. Only properties that are selling (pre_opening or active) are public. */
export async function resolvePublicProperty(admin: SupabaseClient, slugOrId: string | null): Promise<PublicProperty | null> {
  const cols = "id, slug, name, city, country, star_rating, opening_date, status, phone, email, website, timezone";
  let q = admin.from("properties").select(cols);
  if (slugOrId) {
    q = /^[0-9a-f-]{36}$/i.test(slugOrId) ? q.eq("id", slugOrId) : q.eq("slug", slugOrId);
  } else if (process.env.PROPERTY_ID || process.env.NEXT_PUBLIC_PROPERTY_ID) {
    q = q.eq("id", (process.env.PROPERTY_ID || process.env.NEXT_PUBLIC_PROPERTY_ID) as string);
  } else {
    q = q.order("created_at", { ascending: true }).limit(1);
  }
  const { data } = await q.maybeSingle();
  if (!data) return null;
  if (!["pre_opening", "active"].includes(data.status as string)) return null;
  return data as PublicProperty;
}

export async function getSalesSettings(admin: SupabaseClient, propertyId: string): Promise<SalesSettings> {
  const { data } = await admin.from("sales_settings").select("*").eq("property_id", propertyId).maybeSingle();
  if (!data) return { property_id: propertyId, ...DEFAULT_SALES_SETTINGS };
  return {
    property_id: propertyId,
    online_enabled: Boolean(data.online_enabled),
    deposit_percent: Number(data.deposit_percent),
    hold_minutes: Number(data.hold_minutes),
    request_hold_hours: Number(data.request_hold_hours),
    min_lead_days: Number(data.min_lead_days),
    max_advance_days: Number(data.max_advance_days),
    max_nights: Number(data.max_nights),
    max_guests_per_booking: Number(data.max_guests_per_booking),
    currencies: (data.currencies as string[] | null) ?? DEFAULT_SALES_SETTINGS.currencies,
    terms_url: (data.terms_url as string | null) ?? null,
  };
}

/**
 * Deposit due at booking. Non-refundable plans are paid in full; otherwise
 * the property's percentage, never less than one night and never more than
 * the total. Rounded to pence.
 */
export function computeDeposit(totalGbp: number, nights: number, settings: Pick<SalesSettings, "deposit_percent">, plan: Pick<RatePlanSnapshot, "cancellation_policy"> | null): number {
  const total = Math.max(0, Number(totalGbp) || 0);
  if (total === 0) return 0;
  if (plan?.cancellation_policy === "non_refundable" || settings.deposit_percent >= 100) return round2(total);
  const pct = Math.max(0, settings.deposit_percent) / 100;
  const oneNight = nights > 0 ? total / nights : total;
  return round2(Math.min(total, Math.max(total * pct, oneNight)));
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Days between today (UTC) and an ISO date; negative when the date is past. */
export function daysUntil(isoDate: string, now: Date = new Date()): number {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const target = new Date(`${isoDate}T00:00:00Z`).getTime();
  return Math.floor((target - today) / 86_400_000);
}

/**
 * Whether a guest may cancel online without charge. Follows the rate plan
 * snapshot stored on the booking: free until `free_cancellation_days` before
 * arrival (flexible: 0 means until the arrival day itself); never for
 * non-refundable plans; always for an unpaid pending hold.
 */
export function cancellationAssessment(
  booking: { status: string; check_in: string; rate_plan_snapshot: RatePlanSnapshot | null; hold_expires_at?: string | null },
  paidGbp: number,
  now: Date = new Date()
): { allowed: boolean; free: boolean; reason: string } {
  if (!["pending", "confirmed"].includes(booking.status)) {
    return { allowed: false, free: false, reason: "This booking can no longer be cancelled online" };
  }
  if (booking.status === "pending" && paidGbp <= 0) {
    return { allowed: true, free: true, reason: "Nothing has been charged" };
  }
  const plan = booking.rate_plan_snapshot;
  if (!plan) return { allowed: true, free: true, reason: "Free cancellation" };
  if (plan.cancellation_policy === "non_refundable") {
    return { allowed: false, free: false, reason: "This rate is non-refundable. Contact the property to discuss changes." };
  }
  const lead = daysUntil(booking.check_in, now);
  if (lead >= (plan.free_cancellation_days ?? 0)) {
    return { allowed: true, free: true, reason: describeCancellation(plan) };
  }
  return { allowed: false, free: false, reason: `${describeCancellation(plan)}. Contact the property to cancel now.` };
}

/** Hold deadline shown to the guest, in ms remaining (0 when expired or none). */
export function holdRemainingMs(holdExpiresAt: string | null | undefined, now: Date = new Date()): number {
  if (!holdExpiresAt) return 0;
  return Math.max(0, new Date(holdExpiresAt).getTime() - now.getTime());
}

type TypeRow = {
  id: string; name: string; slug: string; description: string | null; bedrooms: number; bathrooms: number;
  max_occupancy: number; size_sqm: number | null; amenities: unknown;
};

function toPublicType(t: TypeRow, images: { apartment_type_id: string | null; url: string; alt_text: string | null; sort_order: number }[]): PublicApartmentType {
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    description: t.description,
    bedrooms: Number(t.bedrooms ?? 0),
    bathrooms: Number(t.bathrooms ?? 1),
    max_occupancy: Number(t.max_occupancy ?? 2),
    size_sqm: t.size_sqm === null || t.size_sqm === undefined ? null : Number(t.size_sqm),
    amenities: Array.isArray(t.amenities) ? (t.amenities as unknown[]).map(String) : [],
    images: images
      .filter((i) => i.apartment_type_id === t.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => ({ url: i.url, alt: i.alt_text })),
  };
}

/** Public apartment types with images for a property. */
export async function listPublicApartmentTypes(admin: SupabaseClient, propertyId: string): Promise<PublicApartmentType[]> {
  const { data: types } = await admin
    .from("apartment_types")
    .select("id, name, slug, description, bedrooms, bathrooms, max_occupancy, size_sqm, amenities")
    .eq("property_id", propertyId)
    .order("base_weekly_rate_gbp", { ascending: true });
  const ids = (types || []).map((t) => t.id as string);
  const { data: images } = ids.length
    ? await admin.from("apartment_images").select("apartment_type_id, url, alt_text, sort_order").in("apartment_type_id", ids)
    : { data: [] as never[] };
  return ((types || []) as TypeRow[]).map((t) => toPublicType(t, (images || []) as never[]));
}

/**
 * Availability search: every apartment type of the property with how many
 * units are free for the stay and the price through the web channel's
 * default rate plan. Types the party does not fit, or that have no rate,
 * come back with `unavailable_reason` so the page can say why.
 */
export async function searchAvailability(admin: SupabaseClient, search: AvailabilitySearch, settings: SalesSettings): Promise<AvailabilityOffer[]> {
  const [types, { data: counts, error }] = await Promise.all([
    listPublicApartmentTypes(admin, search.propertyId),
    admin.rpc("online_availability", { p_property_id: search.propertyId, p_check_in: search.checkIn, p_check_out: search.checkOut }),
  ]);
  if (error) throw new Error(`online_availability: ${error.message}`);
  const countByType = new Map<string, number>();
  for (const row of (counts || []) as { apartment_type_id: string; available_count: number }[]) {
    countByType.set(row.apartment_type_id, Number(row.available_count));
  }
  const party = search.adults + search.children;
  const offers = await Promise.all(
    types.map(async (type): Promise<AvailabilityOffer> => {
      const available = countByType.get(type.id) ?? 0;
      if (party > type.max_occupancy) {
        return { apartment_type: type, available_count: available, quote: null, cancellation: null, deposit_gbp: null, unavailable_reason: `Sleeps up to ${type.max_occupancy}` };
      }
      if (available <= 0) {
        return { apartment_type: type, available_count: 0, quote: null, cancellation: null, deposit_gbp: null, unavailable_reason: "Sold out for these dates" };
      }
      const { data, error: qErr } = await admin.rpc("quote_stay", {
        p_apartment_type_id: type.id,
        p_check_in: search.checkIn,
        p_check_out: search.checkOut,
        p_rate_plan_id: search.ratePlanId ?? null,
        p_channel_code: ONLINE_CHANNEL_CODE,
      });
      if (qErr || !data) {
        const reason = String(qErr?.message || "").split(":")[0];
        return { apartment_type: type, available_count: available, quote: null, cancellation: null, deposit_gbp: null, unavailable_reason: humanQuoteError(reason, qErr?.message) };
      }
      const quote = data as StayQuote;
      return {
        apartment_type: type,
        available_count: available,
        quote,
        cancellation: quote.rate_plan ? describeCancellation(quote.rate_plan) : null,
        deposit_gbp: computeDeposit(quote.total_gbp, quote.nights, settings, quote.rate_plan),
        unavailable_reason: null,
      };
    })
  );
  return offers;
}

function humanQuoteError(code: string, message?: string): string {
  switch (code) {
    case "MIN_NIGHTS":
    case "MAX_NIGHTS":
    case "RATE_PLAN_NOT_VALID":
      return (message || "").split(/:\s*/)[1] || "Not available for this length of stay";
    case "NO_RATE":
      return "Not yet on sale for these dates";
    default:
      return "Not available for these dates";
  }
}

export interface OnlineGuestInput {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string | null;
  country?: string | null;
  language?: string | null;
  marketing_consent?: boolean;
}

/**
 * Find or create the guest record for an online booking. Email is the key
 * (unique in `guests`). Existing guests keep their record; only blanks are
 * filled in, so a returning guest's profile is never overwritten by a form.
 */
export async function upsertOnlineGuest(admin: SupabaseClient, input: OnlineGuestInput): Promise<{ id: string; created: boolean }> {
  const email = input.email.trim().toLowerCase();
  const { data: existing } = await admin.from("guests").select("id, phone, country, language, marketing_consent").eq("email", email).maybeSingle();
  if (existing) {
    const patch: Record<string, unknown> = {};
    if (!existing.phone && input.phone) patch.phone = input.phone;
    if (!existing.country && input.country) patch.country = input.country;
    if (input.marketing_consent && !existing.marketing_consent) patch.marketing_consent = true;
    if (Object.keys(patch).length) await admin.from("guests").update(patch).eq("id", existing.id);
    return { id: existing.id as string, created: false };
  }
  const { data, error } = await admin
    .from("guests")
    .insert({
      first_name: input.first_name.trim(),
      last_name: input.last_name.trim(),
      email,
      phone: input.phone || null,
      country: input.country || null,
      language: input.language || "en",
      marketing_consent: Boolean(input.marketing_consent),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`guests.insert: ${error?.message || "no row"}`);
  return { id: data.id as string, created: true };
}

export interface CreateOnlineBookingInput {
  propertyId: string;
  apartmentTypeId: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  guestId: string;
  ratePlanId?: string | null;
  locale?: string | null;
  guestCurrency?: string;
  specialRequests?: string | null;
  source?: "web" | "concierge";
}

export interface OnlineBookingRow {
  id: string;
  reference: string;
  status: string;
  property_id: string;
  apartment_id: string;
  guest_id: string | null;
  check_in: string;
  check_out: string;
  nights: number;
  adults: number;
  children: number;
  total_amount_gbp: number | string;
  rate_per_night_gbp: number | string;
  rate_plan_snapshot: RatePlanSnapshot | null;
  hold_expires_at: string | null;
  guest_currency: string;
  locale: string | null;
  source: string;
}

/** Create the pending booking (hold) through `create_online_booking`. Errors keep the `CODE: detail` convention. */
export async function createOnlineBooking(admin: SupabaseClient, input: CreateOnlineBookingInput, settings: SalesSettings) {
  const { data, error } = await admin.rpc("create_online_booking", {
    p_property_id: input.propertyId,
    p_apartment_type_id: input.apartmentTypeId,
    p_check_in: input.checkIn,
    p_check_out: input.checkOut,
    p_adults: input.adults,
    p_children: input.children,
    p_guest_id: input.guestId,
    p_rate_plan_id: input.ratePlanId ?? null,
    p_channel_code: ONLINE_CHANNEL_CODE,
    p_source: input.source ?? "web",
    p_locale: input.locale ?? null,
    p_guest_currency: input.guestCurrency ?? "GBP",
    p_special_requests: input.specialRequests ?? null,
    p_hold_minutes: settings.hold_minutes,
    p_external_ref: null,
  });
  if (error) return { booking: null, quote: null, error };
  const result = data as { booking: OnlineBookingRow; quote: StayQuote };
  return { booking: result.booking, quote: result.quote, error: null };
}

/** Issue the guest's booking token (portal scheme) and return the URL. The token is returned once. */
export async function issueBookingToken(admin: SupabaseClient, booking: { id: string; property_id: string; check_out: string }, origin: string) {
  const token = generatePortalToken();
  const expiresAt = portalExpiry(booking.check_out);
  const { error } = await admin.from("booking_access_tokens").insert({
    booking_id: booking.id,
    property_id: booking.property_id,
    token_hash: hashPortalToken(token),
    expires_at: expiresAt.toISOString(),
  });
  if (error) throw new Error(`booking_access_tokens.insert: ${error.message}`);
  return { token, expires_at: expiresAt.toISOString(), manage_url: buildPortalUrl(token, origin), pay_url: `${(process.env.NEXT_PUBLIC_APP_URL || origin).replace(/\/$/, "")}/book/${token}` };
}

/** Sum of completed payments on the booking's folio. */
export async function paidOnBooking(admin: SupabaseClient, bookingId: string): Promise<number> {
  const { data: folio } = await admin.from("folios").select("id").eq("booking_id", bookingId).maybeSingle();
  if (!folio) return 0;
  const { data: payments } = await admin.from("payments").select("amount_gbp, status").eq("folio_id", folio.id);
  return round2((payments || []).filter((p) => ["completed", "partially_refunded"].includes(p.status as string)).reduce((s, p) => s + Number(p.amount_gbp || 0), 0));
}

/** Record the deposit and confirm. Idempotent on `reference` (the Stripe PaymentIntent id). */
export async function confirmOnlineBooking(admin: SupabaseClient, args: { bookingId: string; amountGbp: number; method?: string; reference: string; currency?: string; amountOriginal?: number | null; fxRate?: number | null }) {
  const { data, error } = await admin.rpc("confirm_online_booking", {
    p_booking_id: args.bookingId,
    p_amount_gbp: args.amountGbp,
    p_method: args.method ?? "stripe",
    p_reference: args.reference,
    p_currency: args.currency ?? "GBP",
    p_amount_original: args.amountOriginal ?? null,
    p_fx_rate: args.fxRate ?? null,
  });
  if (error) return { result: null, error };
  return { result: data as { booking_id: string; status: string; payment_id: string | null; balance_gbp: number | null; duplicate: boolean }, error: null };
}

/** Tell the front desk about a new online booking (never throws). */
export async function notifyFrontDesk(admin: SupabaseClient, booking: Pick<OnlineBookingRow, "id" | "reference" | "check_in" | "check_out" | "adults" | "children">, title: string, extra = "") {
  try {
    await createNotification(admin, {
      title: `${title}: ${booking.reference}`,
      message: `${booking.check_in} to ${booking.check_out}, ${booking.adults} adult${booking.adults === 1 ? "" : "s"}${booking.children ? `, ${booking.children} child${booking.children === 1 ? "" : "ren"}` : ""}${extra ? ` · ${extra}` : ""}`,
      type: "info",
      category: "booking",
      link: `/dashboard/bookings/${booking.id}`,
    });
  } catch (err) {
    logger.warn({ err: String(err) }, "[online-booking] notification failed");
  }
}

/** Cancel unpaid holds past their expiry. Returns how many were cancelled. */
export async function expireOnlineHolds(admin: SupabaseClient): Promise<number> {
  const { data, error } = await admin.rpc("expire_online_holds");
  if (error) throw new Error(`expire_online_holds: ${error.message}`);
  return Number(data ?? 0);
}

/** What the guest sees after booking: everything needed to pay or manage, nothing internal. */
export function publicBookingView(b: OnlineBookingRow, paidGbp: number, settings: SalesSettings, now: Date = new Date()) {
  const total = Number(b.total_amount_gbp);
  const deposit = computeDeposit(total, Number(b.nights), settings, b.rate_plan_snapshot);
  const due = round2(Math.max(0, deposit - paidGbp));
  const cancellation = cancellationAssessment({ status: b.status, check_in: b.check_in, rate_plan_snapshot: b.rate_plan_snapshot, hold_expires_at: b.hold_expires_at }, paidGbp, now);
  return {
    id: b.id,
    reference: b.reference,
    status: b.status,
    check_in: b.check_in,
    check_out: b.check_out,
    nights: Number(b.nights),
    adults: b.adults,
    children: b.children,
    total_gbp: round2(total),
    rate_per_night_gbp: round2(Number(b.rate_per_night_gbp)),
    deposit_gbp: deposit,
    paid_gbp: round2(paidGbp),
    due_now_gbp: b.status === "pending" ? due : 0,
    balance_gbp: round2(Math.max(0, total - paidGbp)),
    currency: "GBP" as const,
    rate_plan: b.rate_plan_snapshot ? { name: b.rate_plan_snapshot.name, cancellation: describeCancellation(b.rate_plan_snapshot), includes_breakfast: b.rate_plan_snapshot.includes_breakfast } : null,
    hold_expires_at: b.hold_expires_at,
    hold_remaining_ms: holdRemainingMs(b.hold_expires_at, now),
    cancellation,
    locale: b.locale,
  };
}
