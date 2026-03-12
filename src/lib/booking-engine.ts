import { SupabaseClient } from "@supabase/supabase-js";
import { generateBookingRef, getLengthOfStayDiscount } from "./utils";
import { differenceInDays } from "date-fns";

/**
 * Query rates table for the nightly rate for a given apartment type and check-in date.
 * V1: uses the rate active at check-in date (multi-season split deferred).
 */
export async function calculateRate(
  apartmentTypeId: string,
  checkIn: string,
  checkOut: string,
  supabase: SupabaseClient
): Promise<{ nightly_rate_gbp: number; season_name: string } | null> {
  // First try to find a rate whose date range covers the check-in date
  const { data: rate } = await supabase
    .from("rates")
    .select("*")
    .eq("apartment_type_id", apartmentTypeId)
    .eq("is_active", true)
    .lte("start_date", checkIn)
    .gte("end_date", checkIn)
    .order("start_date", { ascending: false })
    .limit(1)
    .single();

  if (rate) {
    return {
      nightly_rate_gbp: rate.nightly_rate_gbp ?? rate.weekly_rate_gbp / 7,
      season_name: rate.season_name,
    };
  }

  // Fallback: use base_weekly_rate_gbp from apartment_types
  const { data: aptType } = await supabase
    .from("apartment_types")
    .select("base_weekly_rate_gbp")
    .eq("id", apartmentTypeId)
    .single();

  if (aptType) {
    return {
      nightly_rate_gbp: aptType.base_weekly_rate_gbp / 7,
      season_name: "Standard",
    };
  }

  return null;
}

/**
 * Calculate total booking cost with LOS discount.
 */
export function calculateBookingTotal(
  ratePerNight: number,
  nights: number
): { subtotal: number; discount: number; total: number; discount_percentage: number } {
  const subtotal = ratePerNight * nights;
  const discount_percentage = getLengthOfStayDiscount(nights);
  const discount = subtotal * discount_percentage;
  const total = subtotal - discount;
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discount: Math.round(discount * 100) / 100,
    total: Math.round(total * 100) / 100,
    discount_percentage: discount_percentage * 100,
  };
}

/**
 * Get the next booking reference by querying the last one and incrementing.
 */
export async function getNextBookingReference(
  supabase: SupabaseClient
): Promise<string> {
  const year = new Date().getFullYear().toString().slice(-2);
  const prefix = `BAS-HRG-${year}`;

  const { data } = await supabase
    .from("bookings")
    .select("reference")
    .like("reference", `${prefix}%`)
    .order("reference", { ascending: false })
    .limit(1)
    .single();

  let seq = 1;
  if (data?.reference) {
    const lastSeq = parseInt(data.reference.slice(-4), 10);
    if (!isNaN(lastSeq)) {
      seq = lastSeq + 1;
    }
  }

  return generateBookingRef(seq);
}

/**
 * Check if an apartment is available for the given date range.
 * Returns { available: true } or { available: false, reason: string }
 */
export async function checkAvailability(
  apartmentId: string,
  checkIn: string,
  checkOut: string,
  supabase: SupabaseClient,
  excludeBookingId?: string
): Promise<{ available: boolean; reason?: string }> {
  // Check availability table for blocked dates
  const { data: blockedDates } = await supabase
    .from("availability")
    .select("date, block_reason")
    .eq("apartment_id", apartmentId)
    .eq("is_available", false)
    .gte("date", checkIn)
    .lt("date", checkOut);

  if (blockedDates && blockedDates.length > 0) {
    return {
      available: false,
      reason: `Apartment blocked on ${blockedDates[0].date}: ${blockedDates[0].block_reason || "unavailable"}`,
    };
  }

  // Check overlapping bookings (status not cancelled/no_show)
  let query = supabase
    .from("bookings")
    .select("id, reference, check_in, check_out, status")
    .eq("apartment_id", apartmentId)
    .not("status", "in", "(cancelled,no_show)")
    .lt("check_in", checkOut)
    .gt("check_out", checkIn);

  if (excludeBookingId) {
    query = query.neq("id", excludeBookingId);
  }

  const { data: overlapping } = await query;

  if (overlapping && overlapping.length > 0) {
    return {
      available: false,
      reason: `Conflicts with booking ${overlapping[0].reference} (${overlapping[0].check_in} to ${overlapping[0].check_out})`,
    };
  }

  return { available: true };
}

/**
 * Convert an amount from GBP to a target currency using cached rates.
 */
export async function convertCurrency(
  amountGbp: number,
  targetCurrency: string,
  supabase: SupabaseClient
): Promise<{ amount: number; rate: number } | null> {
  if (targetCurrency === "GBP") {
    return { amount: amountGbp, rate: 1 };
  }

  const { data: fxRate } = await supabase
    .from("currency_rates")
    .select("rate")
    .eq("base_currency", "GBP")
    .eq("target_currency", targetCurrency)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .single();

  if (!fxRate) return null;

  return {
    amount: Math.round(amountGbp * fxRate.rate * 100) / 100,
    rate: fxRate.rate,
  };
}

/**
 * Calculate the number of nights between two dates.
 */
export function calculateNights(checkIn: string, checkOut: string): number {
  return differenceInDays(new Date(checkOut), new Date(checkIn));
}
