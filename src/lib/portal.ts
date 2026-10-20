import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describeCancellation, type RatePlanSnapshot } from "@/lib/rate-plans";

/**
 * Guest portal links (migration 00029).
 *
 * The URL carries a 256-bit random token; the database holds only its
 * SHA-256. A link is valid until a week after check-out unless revoked.
 * Everything the portal shows is scoped to one booking and never includes
 * identity documents, internal notes or other guests.
 */

export const PORTAL_PATH = "/stay";
const GRACE_DAYS_AFTER_CHECKOUT = 7;

export function generatePortalToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashPortalToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Tokens are base64url of 32 bytes: 43 characters, no padding. */
export function isPlausiblePortalToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function portalExpiry(checkOut: string): Date {
  const d = new Date(`${checkOut}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + GRACE_DAYS_AFTER_CHECKOUT);
  return d;
}

export function buildPortalUrl(token: string, origin: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || origin).replace(/\/$/, "");
  return `${base}${PORTAL_PATH}/${token}`;
}

export interface PortalStay {
  property: { name: string; phone: string | null; email: string | null; address: string | null; city: string | null; country: string | null };
  booking: {
    id: string;
    reference: string;
    status: string;
    check_in: string;
    check_out: string;
    nights: number;
    adults: number;
    children: number;
    apartment: { number: string; type: string | null } | null;
    rate_plan: { name: string; cancellation: string; includes_breakfast: boolean } | null;
    total_gbp: number;
    special_requests: string | null;
    precheckin: Record<string, unknown> | null;
    precheckin_completed_at: string | null;
  };
  guest: { first_name: string | null } | null;
  folio: { status: string; balance_gbp: number; lines: { date: string; description: string; type: string; debit_gbp: number; credit_gbp: number }[] } | null;
  link: { expires_at: string };
}

/**
 * Resolve a portal token with the service-role client. Returns null for an
 * unknown, revoked or expired token (callers answer 404 for all three so the
 * response does not reveal which).
 */
export async function resolvePortalToken(admin: SupabaseClient, token: string) {
  if (!isPlausiblePortalToken(token)) return null;
  const { data } = await admin
    .from("booking_access_tokens")
    .select("id, booking_id, property_id, expires_at, revoked_at, use_count")
    .eq("token_hash", hashPortalToken(token))
    .maybeSingle();
  if (!data || data.revoked_at || new Date(data.expires_at).getTime() < Date.now()) return null;
  return data as { id: string; booking_id: string; property_id: string; expires_at: string; revoked_at: string | null; use_count: number };
}

/** Build the guest-facing view of one booking. Service-role reads, scoped by id. */
export async function loadPortalStay(admin: SupabaseClient, bookingId: string, expiresAt: string): Promise<PortalStay | null> {
  const { data: b } = await admin
    .from("bookings")
    .select("id, reference, status, check_in, check_out, nights, adults, children, total_amount_gbp, special_requests, precheckin, precheckin_completed_at, rate_plan_snapshot, property_id, apartment:apartments(number, apartment_type:apartment_types(name)), guest:guests(first_name)")
    .eq("id", bookingId)
    .maybeSingle();
  if (!b) return null;
  const { data: p } = await admin.from("properties").select("name, phone, email, address, city, country").eq("id", b.property_id).maybeSingle();
  const { data: folio } = await admin.from("folios").select("id, status").eq("booking_id", bookingId).maybeSingle();
  let folioView: PortalStay["folio"] = null;
  if (folio) {
    const [{ data: lines }, { data: balance }] = await Promise.all([
      admin.from("folio_lines").select("business_date, description, type, debit_gbp, credit_gbp, reversal_of").eq("folio_id", folio.id).order("posted_at"),
      admin.rpc("folio_balance", { p_folio_id: folio.id }),
    ]);
    folioView = {
      status: folio.status,
      balance_gbp: Number(balance ?? 0),
      lines: (lines || []).map((l) => ({ date: l.business_date as string, description: l.description as string, type: l.type as string, debit_gbp: Number(l.debit_gbp || 0), credit_gbp: Number(l.credit_gbp || 0) })),
    };
  }
  const apt = b.apartment as unknown as { number: string; apartment_type: { name: string } | null } | null;
  const guest = b.guest as unknown as { first_name: string | null } | null;
  const plan = b.rate_plan_snapshot as RatePlanSnapshot | null;
  return {
    property: { name: p?.name ?? "Your stay", phone: p?.phone ?? null, email: p?.email ?? null, address: p?.address ?? null, city: p?.city ?? null, country: p?.country ?? null },
    booking: {
      id: b.id,
      reference: b.reference,
      status: b.status,
      check_in: b.check_in,
      check_out: b.check_out,
      nights: b.nights,
      adults: b.adults,
      children: b.children,
      apartment: apt ? { number: apt.number, type: apt.apartment_type?.name ?? null } : null,
      rate_plan: plan ? { name: plan.name, cancellation: describeCancellation(plan), includes_breakfast: plan.includes_breakfast } : null,
      total_gbp: Number(b.total_amount_gbp || 0),
      special_requests: b.special_requests,
      precheckin: (b.precheckin as Record<string, unknown> | null) ?? null,
      precheckin_completed_at: b.precheckin_completed_at,
    },
    guest: guest ? { first_name: guest.first_name } : null,
    folio: folioView,
    link: { expires_at: expiresAt },
  };
}
