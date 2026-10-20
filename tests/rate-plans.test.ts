import { describe, it, expect } from "vitest";
import { ratePlanSchema, updateRatePlanSchema, quoteStaySchema, createBookingSchema } from "@/lib/validation";
import { describeCancellation, quoteStay } from "@/lib/rate-plans";
import { createFakeSupabase, seedDb } from "./__mocks__/supabase-fake";

describe("rate plan validation", () => {
  it("accepts a percent-off plan with defaults filled in", () => {
    const r = ratePlanSchema.safeParse({ code: "nrf", name: "Non-refundable", pricing_mode: "percent_off", adjustment: 10 });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.cancellation_policy).toBe("flexible");
      expect(r.data.min_nights).toBe(1);
      expect(r.data.is_active).toBe(true);
    }
  });

  it("rejects discounts over 100%, zero fixed rates, inverted night and date ranges, bad codes", () => {
    expect(ratePlanSchema.safeParse({ code: "X1", name: "Too much", pricing_mode: "percent_off", adjustment: 120 }).success).toBe(false);
    expect(ratePlanSchema.safeParse({ code: "X1", name: "Free", pricing_mode: "fixed_nightly", adjustment: 0 }).success).toBe(false);
    expect(ratePlanSchema.safeParse({ code: "X1", name: "Range", min_nights: 5, max_nights: 3 }).success).toBe(false);
    expect(ratePlanSchema.safeParse({ code: "X1", name: "Dates", valid_from: "2026-12-01", valid_to: "2026-11-01" }).success).toBe(false);
    expect(ratePlanSchema.safeParse({ code: "bad code!", name: "Code" }).success).toBe(false);
  });

  it("partial updates validate only what is sent and ignore unknown keys", () => {
    expect(updateRatePlanSchema.safeParse({ is_active: false }).success).toBe(true);
    expect(updateRatePlanSchema.safeParse({ adjustment: -1 }).success).toBe(false);
    const r = updateRatePlanSchema.safeParse({ name: "Renamed", property_id: "6f1c2a3e-1b2c-4d5e-8f90-123456789001", hacker: true });
    expect(r.success).toBe(true);
    if (r.success) expect("hacker" in r.data).toBe(false);
  });

  it("quote needs an apartment or a type and ordered dates", () => {
    expect(quoteStaySchema.safeParse({ check_in: "2026-11-01", check_out: "2026-11-03" }).success).toBe(false);
    expect(quoteStaySchema.safeParse({ apartment_type_id: "6f1c2a3e-1b2c-4d5e-8f90-123456789002", check_in: "2026-11-03", check_out: "2026-11-01" }).success).toBe(false);
    expect(quoteStaySchema.safeParse({ apartment_id: "6f1c2a3e-1b2c-4d5e-8f90-123456789002", check_in: "2026-11-01", check_out: "2026-11-03", rate_plan_id: null }).success).toBe(true);
  });

  it("bookings accept an optional rate_plan_id", () => {
    const r = createBookingSchema.safeParse({ apartment_id: "6f1c2a3e-1b2c-4d5e-8f90-123456789002", check_in: "2026-11-01", check_out: "2026-11-03", rate_plan_id: "6f1c2a3e-1b2c-4d5e-8f90-123456789003" });
    expect(r.success).toBe(true);
  });
});

describe("rate plan helpers", () => {
  it("describes cancellation terms in plain words", () => {
    expect(describeCancellation({ cancellation_policy: "non_refundable", free_cancellation_days: 0 })).toBe("Non-refundable");
    expect(describeCancellation({ cancellation_policy: "flexible", free_cancellation_days: 1 })).toMatch(/1 day before arrival/);
    expect(describeCancellation({ cancellation_policy: "flexible", free_cancellation_days: 3 })).toMatch(/3 days before arrival/);
    expect(describeCancellation({ cancellation_policy: "moderate", free_cancellation_days: 3 })).toMatch(/first night charged/);
    expect(describeCancellation({ cancellation_policy: "strict", free_cancellation_days: 7 })).toMatch(/100% charged/);
  });

  it("quoteStay passes the arguments through to the database function and returns its result", async () => {
    let seen: Record<string, unknown> = {};
    const sb = createFakeSupabase(seedDb(), {
      rpc: { quote_stay: (args) => { seen = args; return { nights: 2, total_gbp: 90, rate_plan: { code: "NRF" } }; } },
    });
    const { quote, error } = await quoteStay(sb, { apartmentTypeId: "t1", checkIn: "2026-11-01", checkOut: "2026-11-03", ratePlanId: "p1", channelCode: "direct" });
    expect(error).toBeNull();
    expect(quote?.total_gbp).toBe(90);
    expect(seen).toEqual({ p_apartment_type_id: "t1", p_check_in: "2026-11-01", p_check_out: "2026-11-03", p_rate_plan_id: "p1", p_channel_code: "direct" });
  });
});
