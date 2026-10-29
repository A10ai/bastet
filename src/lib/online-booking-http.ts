import "server-only";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolvePortalToken } from "@/lib/portal";
import type { OnlineBookingRow } from "@/lib/online-booking";

/** Shared pieces of the public booking routes: headers, token resolution, errors. */

export const PUBLIC_HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } as const;

export function publicJson(body: unknown, init: { status?: number } = {}) {
  return NextResponse.json(body, { status: init.status ?? 200, headers: PUBLIC_HEADERS });
}

export function publicError(code: string, message: string, status: number) {
  return publicJson({ error: { code, message } }, { status });
}

export const notFound = () => publicError("NOT_FOUND", "This booking link is not valid", 404);

export const BOOKING_COLUMNS =
  "id, reference, status, property_id, apartment_id, guest_id, check_in, check_out, nights, adults, children, total_amount_gbp, rate_per_night_gbp, rate_plan_snapshot, hold_expires_at, guest_currency, locale, source";

/** Resolve a booking token to its booking row, or null. */
export async function bookingFromToken(admin: SupabaseClient, token: string): Promise<{ link: { id: string; use_count: number; expires_at: string }; booking: OnlineBookingRow } | null> {
  const link = await resolvePortalToken(admin, token);
  if (!link) return null;
  const { data } = await admin.from("bookings").select(BOOKING_COLUMNS).eq("id", link.booking_id).maybeSingle();
  if (!data) return null;
  return { link: { id: link.id, use_count: link.use_count ?? 0, expires_at: link.expires_at }, booking: data as unknown as OnlineBookingRow };
}

export function requestOrigin(request: NextRequest): string {
  return request.nextUrl.origin;
}
