// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { createFakeSupabase } from "./__mocks__/supabase-fake";
import { recommend, median, generateRecommendations, loadSignals, type WindowSignals } from "@/lib/pricing-agent";

vi.mock("@/lib/event-bus", () => ({ emitEvent: vi.fn(async () => ({ event_id: "e", results: [] })) }));

const band = { floor_gbp: 30, ceiling_gbp: 120, target_premium_percent: 15, max_daily_change_percent: 10 };
const base: WindowSignals = { apartment_type_id: "t1", apartment_type: "Studio", stay_from: "2027-07-01", stay_to: "2027-07-08", current_rate_gbp: 50, total_units: 100, available_units: 60, pickup_7d: 10, lead_days: 60, comp_median_gbp: null, comp_samples: 0, occupancy_forecast: null };

describe("pricing rule", () => {
  it("leaves a normally-demanded window alone when there are no competitor shops", () => {
    const r = recommend(base, band);
    expect(r.skip_reason).toBe("change under 1%");
    expect(r.recommended_rate_gbp).toBe(50);
    expect(r.reasoning).toContain("no competitor shops");
  });
  it("raises on high demand and strong pickup, within the daily limit", () => {
    const r = recommend({ ...base, available_units: 10, pickup_7d: 120 }, band);
    // +8% high demand +3% pickup = 1.11 -> capped at +10%
    expect(r.recommended_rate_gbp).toBe(55);
    expect(r.change_percent).toBe(10);
    expect(r.reasoning).toMatch(/high demand \+8%/);
    expect(r.reasoning).toMatch(/limited to \+\/-10% per day/);
  });
  it("lowers soft demand close to arrival but never below the floor", () => {
    const r = recommend({ ...base, available_units: 90, lead_days: 10 }, band);
    expect(r.recommended_rate_gbp).toBe(47);
    const floored = recommend({ ...base, current_rate_gbp: 31, available_units: 90, lead_days: 10 }, band);
    expect(floored.recommended_rate_gbp).toBe(30);
    expect(floored.reasoning).toContain("held at floor");
  });
  it("anchors on the competitor median plus the premium target", () => {
    // anchor = 80 * 1.15 = 92; target = 0.6*92 + 0.4*50 = 75.2 -> capped +10% = 55
    const r = recommend({ ...base, comp_median_gbp: 80, comp_samples: 6 }, band);
    expect(r.recommended_rate_gbp).toBe(55);
    expect(r.reasoning).toContain("competitor median 80 GBP (6 shops), premium target +15% = 92 GBP");
    // with a generous daily limit the anchor shows through, capped at the ceiling
    const wide = recommend({ ...base, current_rate_gbp: 110, comp_median_gbp: 150, comp_samples: 3 }, { ...band, max_daily_change_percent: 50 });
    expect(wide.recommended_rate_gbp).toBe(120);
    expect(wide.reasoning).toContain("held at ceiling");
  });
  it("prefers a demand forecast over sold-share when one exists and skips unusable windows", () => {
    const r = recommend({ ...base, available_units: 95, occupancy_forecast: 0.9 }, band);
    expect(r.change_percent).toBeGreaterThan(0);
    expect(r.reasoning).toContain("forecast occupancy 90%");
    expect(recommend({ ...base, current_rate_gbp: 0 }, band).skip_reason).toBe("no current rate");
    expect(recommend({ ...base, total_units: 0 }, band).skip_reason).toBe("no units");
  });
  it("computes medians", () => {
    expect(median([])).toBeNull();
    expect(median([5])).toBe(5);
    expect(median([9, 1, 5])).toBe(5);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe("agent run", () => {
  const types = [{ id: "t1", property_id: "p1", name: "Studio", base_weekly_rate_gbp: 350 }];
  const ari = (opts: { available: number; bar: number }) => Array.from({ length: 14 }, (_, i) => ({ apartment_type_id: "t1", day: `2027-07-${String(i + 1).padStart(2, "0")}`, total: 100, available: opts.available, bar_gbp: opts.bar, rate_gbp: opts.bar, min_stay: 1, closed: false }));
  const now = new Date("2027-07-01T06:00:00Z");

  it("loads one signal per type per week with pickup, comp median and forecast", async () => {
    const sb = createFakeSupabase({
      apartment_types: types,
      bookings: [{ property_id: "p1", apartment_id: "a1", check_in: "2027-07-03", check_out: "2027-07-10", created_at: "2027-06-30T00:00:00Z", status: "confirmed", apartments: { apartment_type_id: "t1" } }],
      rate_shops: [{ property_id: "p1", apartment_type_id: null, stay_date: "2027-07-02", rate_gbp: 70, shopped_at: "2027-06-29T00:00:00Z" }, { property_id: "p1", apartment_type_id: "t1", stay_date: "2027-07-03", rate_gbp: 90, shopped_at: "2027-06-29T00:00:00Z" }],
      demand_forecasts: [{ property_id: "p1", forecast_date: "2027-07-09", predicted_occupancy: 88 }],
    }, { rpc: { channel_ari: () => ari({ available: 40, bar: 50 }) } });
    const s = await loadSignals(sb, "p1", 2, now);
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ stay_from: "2027-07-01", stay_to: "2027-07-08", current_rate_gbp: 50, total_units: 100, available_units: 40, pickup_7d: 5, lead_days: 0, comp_median_gbp: 80, comp_samples: 2, occupancy_forecast: null });
    expect(s[1]).toMatchObject({ stay_from: "2027-07-08", pickup_7d: 2, comp_samples: 0, occupancy_forecast: 0.88 });
  });

  it("queues recommendations by default and expires the previous queue", async () => {
    const sb = createFakeSupabase({ apartment_types: types, pricing_bands: [], rate_recommendations: [{ id: "old", property_id: "p1", status: "pending" }], bookings: [], rate_shops: [], demand_forecasts: [] }, { rpc: { channel_ari: () => ari({ available: 5, bar: 50 }) } });
    const r = await generateRecommendations(sb, "p1", { now });
    expect(r).toMatchObject({ windows: 2, pending: 2, auto_applied: 0, expired: 1, errors: [] });
    const { data: rows } = await sb.from("rate_recommendations").select("*");
    expect(rows!.find((x) => x.id === "old")!.status).toBe("expired");
    const fresh = rows!.filter((x) => x.status === "pending");
    expect(fresh).toHaveLength(2);
    // derived band without an owner-set one: 70%..200% of the base nightly (50)
    expect(fresh[0]).toMatchObject({ floor_gbp: 35, ceiling_gbp: 100, recommended_rate_gbp: 54, current_rate_gbp: 50 });
    expect(String(fresh[0].reasoning)).toContain("high demand");
  });

  it("auto-applies when the band allows and records the rate id", async () => {
    const applied: Record<string, unknown>[] = [];
    const sb = createFakeSupabase({
      apartment_types: types,
      pricing_bands: [{ property_id: "p1", apartment_type_id: "t1", floor_gbp: 40, ceiling_gbp: 80, target_premium_percent: 10, max_daily_change_percent: 10, auto_apply: true, horizon_weeks: 1 }],
      rate_recommendations: [], bookings: [], rate_shops: [], demand_forecasts: [],
    }, { rpc: { channel_ari: () => ari({ available: 5, bar: 50 }), apply_rate_recommendation: (a) => { applied.push(a); return { rate_id: "rate-1", recommendation: { property_id: "p1", apartment_type_id: "t1", stay_from: "2027-07-01", stay_to: "2027-07-08", current_rate_gbp: 50, recommended_rate_gbp: 54 } }; } } });
    const r = await generateRecommendations(sb, "p1", { now });
    expect(r).toMatchObject({ windows: 1, pending: 0, auto_applied: 1 });
    expect(applied[0]).toMatchObject({ p_auto: true, p_actor: null });
  });
});
