import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
/** Revenue / report KPIs computed from a small, hand-checked dataset. */
import { createFakeSupabase, type FakeDb } from "../../__mocks__/supabase-fake";
import { getRatePerformance, getRevenueOverview } from "@/lib/revenue-engine";
import { getRevenueReport, getFinancialSummary } from "@/lib/reports-engine";

const T = "t-studio";
function db(bookings: Record<string, unknown>[]): FakeDb {
  return {
    apartment_types: [{ id: T, name: "Studio", base_weekly_rate_gbp: 350 }], // = 50/night
    apartments: [{ id: "a1", apartment_type_id: T, status: "available", apartment_types: { name: "Studio" } }],
    booking_channels: [{ id: "d", name: "Direct", code: "direct", commission_rate: 0 }],
    bookings,
    expenses: [], invoices: [], payments: [],
  };
}
const bk = (id: string, ci: string, co: string, nights: number, rate: number, extra: Record<string, unknown> = {}) => ({
  id, reference: id, apartment_id: "a1", channel_id: "d", status: "checked_out", check_in: ci, check_out: co, nights,
  rate_per_night_gbp: rate, total_amount_gbp: rate * nights, ...extra,
});

describe("revenue-engine.getRatePerformance", () => {
  it("rate_efficiency compares like with like: selling exactly at the base rate (50/night = 350/week) is 1.0", async () => {
    const sb = createFakeSupabase(db([bk("b1", "2026-10-01", "2026-10-08", 7, 50)]));
    const [row] = await getRatePerformance(sb);
    expect(row.rate_efficiency).toBeCloseTo(1, 1); // actual: 50/350 = 0.14
  });
  it("occupancy_pct never exceeds 100% for one unit", async () => {
    // one unit, 60 historic nights; capacity is measured as one month
    const sb = createFakeSupabase(db([bk("b1", "2026-07-01", "2026-08-30", 60, 50)]));
    const [row] = await getRatePerformance(sb);
    expect(row.occupancy_pct).toBeLessThanOrEqual(100);
  });
});

describe("revenue-engine.getRevenueOverview", () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-15T12:00:00Z")); });
  afterAll(() => vi.useRealTimers());
  it("RevPAR is bounded by ADR (revpar <= adr)", async () => {
    // a year of history for one unit at 50/night: ADR 50, RevPAR can't exceed 50
    const rows = Array.from({ length: 12 }, (_, m) => bk(`b${m}`, `2025-${String(m + 1).padStart(2, "0")}-01`, `2025-${String(m + 1).padStart(2, "0")}-28`, 27, 50));
    const o = await getRevenueOverview(createFakeSupabase(db(rows)));
    expect(o.avg_daily_rate).toBe(50);
    expect(o.revpar).toBeLessThanOrEqual(o.avg_daily_rate);
  });
  it(`a booking checking in on the 1st counts in this month (TZ=${process.env.TZ})`, async () => {
    const o = await getRevenueOverview(createFakeSupabase(db([bk("b1", "2026-10-01", "2026-10-03", 2, 50)])));
    expect(o.revenue_this_month).toBe(100);
    expect(o.revenue_last_month).toBe(0);
  });
});

describe("reports-engine revenue attribution", () => {
  // 1 Oct -> 31 Oct... a 10-night stay 27 Sep -> 7 Oct worth 500
  const rows = [bk("b1", "2026-09-27", "2026-10-07", 10, 50)];
  it("September + October revenue reports do not double count one 500 stay", async () => {
    const sep = await getRevenueReport(createFakeSupabase(db(rows)), "2026-09-01", "2026-09-30");
    const oct = await getRevenueReport(createFakeSupabase(db(rows)), "2026-10-01", "2026-10-31");
    expect(sep.total_revenue + oct.total_revenue).toBe(500);
  });
  it("a booking that checked out ON dateFrom contributes no revenue to that period", async () => {
    const r = await getFinancialSummary(createFakeSupabase(db([bk("b2", "2026-09-25", "2026-10-01", 6, 50)])), "2026-10-01", "2026-10-31");
    expect(r.total_revenue).toBe(0);
  });
  it("daily revenue rows stay inside the requested range", async () => {
    const oct = await getRevenueReport(createFakeSupabase(db(rows)), "2026-10-01", "2026-10-31");
    for (const d of oct.daily) expect(d.date >= "2026-10-01").toBe(true);
  });
});
