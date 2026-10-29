import type { StayQuote } from "@/lib/rate-plans";
import type { PublicApartmentType, PublicProperty } from "@/lib/online-booking";

/** Shapes returned by the public /api/v1/book routes, as the pages consume them. */
export interface BookPolicy {
  online_enabled: boolean;
  deposit_percent: number;
  hold_minutes: number;
  min_lead_days: number;
  max_advance_days: number;
  max_nights: number;
  max_guests_per_booking: number;
  currencies: string[];
  terms_url: string | null;
  card_payments: boolean;
}

export interface PropertyResponse {
  property: PublicProperty;
  apartment_types: PublicApartmentType[];
  policy: BookPolicy;
}

export interface Offer {
  apartment_type: PublicApartmentType;
  available_count: number;
  quote: StayQuote | null;
  cancellation: string | null;
  deposit_gbp: number | null;
  unavailable_reason: string | null;
}

export interface AvailabilityResponse {
  property: { id: string; name: string; slug: string };
  check_in: string;
  check_out: string;
  nights: number;
  adults: number;
  children: number;
  offers: Offer[];
}

export interface BookingView {
  id: string;
  reference: string;
  status: string;
  check_in: string;
  check_out: string;
  nights: number;
  adults: number;
  children: number;
  total_gbp: number;
  rate_per_night_gbp: number;
  deposit_gbp: number;
  paid_gbp: number;
  due_now_gbp: number;
  balance_gbp: number;
  currency: "GBP";
  rate_plan: { name: string; cancellation: string; includes_breakfast: boolean } | null;
  hold_expires_at: string | null;
  hold_remaining_ms: number;
  cancellation: { allowed: boolean; free: boolean; reason: string };
  locale: string | null;
}

export interface BookingStatusResponse {
  booking: BookingView;
  property: { name: string; phone: string | null; email: string | null; city: string | null; country: string | null } | null;
  card_payments: boolean;
  currencies: string[];
}

export interface SearchParams {
  check_in: string;
  check_out: string;
  adults: number;
  children: number;
}

export const inputClass = "w-full rounded-lg border border-brand-border bg-brand-card px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-accent/40";
export const primaryButton = "w-full rounded-lg bg-brand-accent text-brand-bg font-semibold py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand-accent-hover transition-colors";
export const secondaryButton = "rounded-lg border border-brand-border bg-brand-card text-text-primary text-sm px-4 py-2 hover:bg-brand-border/60 transition-colors";

export async function readError(res: Response, fallback: string): Promise<{ code: string; message: string }> {
  try {
    const j = await res.json();
    if (j?.error && typeof j.error === "object") return { code: String(j.error.code || "ERROR"), message: String(j.error.message || fallback) };
    if (typeof j?.error === "string") return { code: "ERROR", message: j.error };
  } catch {
    /* no body */
  }
  return { code: "ERROR", message: fallback };
}
