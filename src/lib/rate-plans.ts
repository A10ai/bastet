import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostgrestError } from "@supabase/supabase-js";

/** Row of `rate_plans` (migration 00027). */
export interface RatePlan {
  id: string;
  property_id: string;
  code: string;
  name: string;
  description: string | null;
  pricing_mode: "bar" | "percent_off" | "percent_markup" | "fixed_nightly";
  adjustment: number;
  cancellation_policy: "flexible" | "moderate" | "strict" | "non_refundable";
  free_cancellation_days: number;
  min_nights: number;
  max_nights: number | null;
  includes_breakfast: boolean;
  valid_from: string | null;
  valid_to: string | null;
  channel_codes: string[] | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Snapshot of the plan stored on the booking at the time of sale. */
export type RatePlanSnapshot = Pick<RatePlan, "id" | "code" | "name" | "pricing_mode" | "adjustment" | "cancellation_policy" | "free_cancellation_days" | "includes_breakfast" | "min_nights" | "max_nights">;

/** Result of the `quote_stay` database function. */
export interface StayQuote {
  apartment_type_id: string;
  apartment_type: string;
  check_in: string;
  check_out: string;
  nights: number;
  currency: "GBP";
  bar_total_gbp: number;
  total_gbp: number;
  rate_per_night_gbp: number;
  discount_percentage: number;
  nightly: { date: string; season: string; bar_gbp: number; rate_gbp: number }[];
  rate_plan: RatePlanSnapshot | null;
}

export interface QuoteArgs {
  apartmentTypeId: string;
  checkIn: string;
  checkOut: string;
  ratePlanId?: string | null;
  channelCode?: string | null;
}

/**
 * Price a stay night by night through `quote_stay`. All pricing rules live in
 * the database so the API, the booking form and any import share one truth.
 * Errors come back with the 'CODE: detail' convention (see rpc-error.ts).
 */
export async function quoteStay(
  supabase: SupabaseClient,
  args: QuoteArgs
): Promise<{ quote: StayQuote | null; error: PostgrestError | null }> {
  const { data, error } = await supabase.rpc("quote_stay", {
    p_apartment_type_id: args.apartmentTypeId,
    p_check_in: args.checkIn,
    p_check_out: args.checkOut,
    p_rate_plan_id: args.ratePlanId ?? null,
    p_channel_code: args.channelCode ?? null,
  });
  if (error) return { quote: null, error };
  return { quote: data as StayQuote, error: null };
}

/** Human label for a cancellation policy, used by the booking form and guest-facing text. */
export function describeCancellation(plan: Pick<RatePlanSnapshot, "cancellation_policy" | "free_cancellation_days">): string {
  switch (plan.cancellation_policy) {
    case "non_refundable":
      return "Non-refundable";
    case "strict":
      return `Free cancellation until ${plan.free_cancellation_days} days before arrival, then 100% charged`;
    case "moderate":
      return `Free cancellation until ${plan.free_cancellation_days} days before arrival, then first night charged`;
    default:
      return plan.free_cancellation_days === 0 ? "Free cancellation until arrival" : `Free cancellation until ${plan.free_cancellation_days} day${plan.free_cancellation_days === 1 ? "" : "s"} before arrival`;
  }
}
