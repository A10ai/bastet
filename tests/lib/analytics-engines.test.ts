import { describe, expect, it } from "vitest";
import { createFakeSupabase, seedDb } from "../__mocks__/supabase-fake";

const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n);

describe("revenue-engine", () => {
  it("computes overview, channel mix, rate performance, LOS and forecast from bookings", async () => {
    const { getRevenueOverview, getChannelMix, getChannelOptimization, getRatePerformance, getLOSAnalysis, getRevenueForecasting, getAllRevenueData } = await import("@/lib/revenue-engine");
    const sb = createFakeSupabase(seedDb());
    const overview = await getRevenueOverview(sb);
    expect(overview).toBeTruthy();
    const numbers = Object.values(overview).filter((v) => typeof v === "number") as number[];
    expect(numbers.length).toBeGreaterThan(3);
    expect(numbers.every(Number.isFinite)).toBe(true);
    expect(numbers.some((n) => n > 0)).toBe(true);
    const mix = await getChannelMix(sb);
    expect(mix).toBeTruthy();
    const mixItems = (Array.isArray(mix) ? mix : ((mix as { channels?: unknown[] }).channels ?? (mix as { items?: unknown[] }).items ?? [])) as { commission_rate: number; commission_cost_gbp: number }[];
    expect(mixItems.length).toBeGreaterThan(0);
    for (const m of mixItems) {
      expect(m.commission_rate).toBeLessThanOrEqual(1); // fraction, never 15 (percent)
      expect(finite(m.commission_cost_gbp)).toBe(true);
    }
    const opt = await getChannelOptimization(sb);
    expect(opt).toBeTruthy();
    const rates = await getRatePerformance(sb);
    expect(Array.isArray(rates) || typeof rates === "object").toBe(true);
    const los = await getLOSAnalysis(sb);
    expect(los).toBeTruthy();
    const fc = await getRevenueForecasting(sb);
    expect(fc).toBeTruthy();
    const all = await getAllRevenueData(sb);
    expect(all.overview).toBeTruthy();
    expect(all.channel_mix).toBeTruthy();
  });

  it("runs what-if simulations with elasticity and keeps numbers finite", async () => {
    const { getWhatIfSimulation } = await import("@/lib/revenue-engine");
    const sim = getWhatIfSimulation(45, 50, 70);
    expect(sim).toBeTruthy();
    const json = JSON.stringify(sim);
    expect(json).not.toMatch(/NaN|Infinity/);
    const down = getWhatIfSimulation(45, 38, 70, -0.8);
    expect(JSON.stringify(down)).not.toMatch(/NaN|Infinity/);
    const zero = getWhatIfSimulation(0, 10, 50);
    expect(JSON.stringify(zero)).not.toMatch(/NaN|Infinity/);
  });

  it("handles an empty property without throwing", async () => {
    const { getAllRevenueData } = await import("@/lib/revenue-engine");
    const sb = createFakeSupabase({ bookings: [], apartments: [], booking_channels: [], apartment_types: [] });
    const all = await getAllRevenueData(sb);
    expect(JSON.stringify(all)).not.toMatch(/NaN|Infinity/);
  });
});

describe("reports-engine", () => {
  const from = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const to = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);

  it("produces every report type with finite figures", async () => {
    const r = await import("@/lib/reports-engine");
    const sb = createFakeSupabase(seedDb());
    const occ = await r.getOccupancyReport(sb, from, to);
    expect(occ).toBeTruthy();
    const rev = await r.getRevenueReport(sb, from, to);
    expect(rev).toBeTruthy();
    const guests = await r.getGuestReport(sb, from, to);
    expect(guests).toBeTruthy();
    const ops = await r.getOperationsReport(sb, from, to);
    expect(ops).toBeTruthy();
    const fin = await r.getFinancialSummary(sb, from, to);
    expect(fin).toBeTruthy();
    const exec = await r.getExecutiveSummary(sb, from, to);
    expect(exec).toBeTruthy();
    expect(JSON.stringify([occ, rev, guests, ops, fin, exec])).not.toMatch(/NaN|Infinity/);
  });

  it("survives an empty database", async () => {
    const r = await import("@/lib/reports-engine");
    const sb = createFakeSupabase({});
    const exec = await r.getExecutiveSummary(sb, from, to);
    expect(JSON.stringify(exec)).not.toMatch(/NaN|Infinity/);
  });
});

describe("guest-intelligence", () => {
  it("scores guests, flags churn, finds upsells, segments and predicts", async () => {
    const g = await import("@/lib/guest-intelligence");
    const sb = createFakeSupabase(seedDb());
    const scores = await g.getGuestScores(sb);
    expect(Array.isArray(scores)).toBe(true);
    const churn = await g.getChurnRiskGuests(sb);
    expect(Array.isArray(churn)).toBe(true);
    const upsell = await g.getUpsellOpportunities(sb);
    expect(Array.isArray(upsell)).toBe(true);
    const seg = await g.getGuestSegmentAnalysis(sb);
    expect(seg).toBeTruthy();
    const pred = await g.getGuestPredictions(sb);
    expect(pred).toBeTruthy();
    const insights = await g.getGuestInsights(sb);
    expect(Array.isArray(insights)).toBe(true);
    const all = await g.getAllGuestIntelligence(sb);
    expect(all).toBeTruthy();
    expect(JSON.stringify(all)).not.toMatch(/NaN|Infinity/);
  });
  it("handles no guests", async () => {
    const g = await import("@/lib/guest-intelligence");
    const all = await g.getAllGuestIntelligence(createFakeSupabase({}));
    expect(JSON.stringify(all)).not.toMatch(/NaN|Infinity/);
  });
});

describe("prediction-model", () => {
  it("trains on booking history, predicts, forecasts 30 days and compares with rules", async () => {
    const p = await import("@/lib/prediction-model");
    const sb = createFakeSupabase(seedDb());
    const model = await p.trainModel(sb);
    expect(finite(model.training_samples)).toBe(true);
    const fc = await p.forecast30Days(sb);
    expect(fc).toBeTruthy();
    const perf = await p.getModelPerformance(sb);
    expect(perf).toBeTruthy();
    const cmp = await p.compareWithRules(sb);
    expect(cmp).toBeTruthy();
    expect(JSON.stringify([model, fc, perf, cmp])).not.toMatch(/NaN|Infinity/);
  });
  it("does not divide by zero on an empty history", async () => {
    const p = await import("@/lib/prediction-model");
    const model = await p.trainModel(createFakeSupabase({ bookings: [], apartments: [] }));
    expect(JSON.stringify(model)).not.toMatch(/NaN|Infinity/);
  });
});

describe("energy-engine", () => {
  it("builds overview, building, floor, heatmap, timeline and recommendations", async () => {
    const e = await import("@/lib/energy-engine");
    const sb = createFakeSupabase(seedDb());
    const ov = await e.getEnergyOverview(sb);
    expect(finite(ov.estimated_daily_consumption_kwh)).toBe(true);
    expect(await e.getEnergyByBuilding(sb)).toBeTruthy();
    expect(await e.getEnergyByFloorGrouped(sb)).toBeTruthy();
    expect(await e.getEnergyByFloor(sb, "22222222-2222-4222-8222-222222222222")).toBeTruthy();
    expect(await e.getEnergyHeatmap(sb)).toBeTruthy();
    const timeline = e.getEnergyTimeline(8, 3);
    expect(timeline.length).toBeGreaterThan(0);
    const recs = await e.getEnergyRecommendations(sb);
    expect(Array.isArray(recs)).toBe(true);
    for (const r of recs) expect(finite(r.estimated_savings_gbp)).toBe(true);
  });
});

describe("ai-engine (rule based)", () => {
  it("generates insights, pricing recommendations, forecast and a health score", async () => {
    const { generateInsights, generatePricingRecommendations, generateOccupancyForecast, calculateHealthScore } = await import("@/lib/ai-engine");
    const snapshot = { occupancy: 82, avg_rate: 55, open_maintenance: 3, urgent_maintenance: 1, housekeeping_dirty: 4, total_apartments: 12, revenue_today: 540, arrivals_today: 3, departures_today: 2 };
    const insights = generateInsights(snapshot);
    expect(Array.isArray(insights)).toBe(true);
    const pricing = generatePricingRecommendations(82, [{ type: "Studio", rate: 45 }, { type: "One bedroom", rate: 60 }]);
    expect(pricing).toBeTruthy();
    const low = generatePricingRecommendations(30, [{ type: "Studio", rate: 45 }]);
    expect(low).toBeTruthy();
    const forecast = generateOccupancyForecast(82, 3, 2);
    expect(forecast).toBeTruthy();
    const score = calculateHealthScore(snapshot as never);
    const value = typeof score === "number" ? score : (score as { score: number }).score;
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(100);
  });
});
