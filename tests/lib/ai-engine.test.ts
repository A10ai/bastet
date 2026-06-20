import { describe, it, expect } from "vitest";
import { generateInsights, calculateHealthScore } from "@/lib/ai-engine";

describe("generateInsights", () => {
  it("generates high-occupancy pricing insight when occupancy > 85%", () => {
    const insights = generateInsights({
      occupancy: 90,
      avg_rate: 100,
      open_maintenance: 0,
      urgent_maintenance: 0,
      housekeeping_dirty: 0,
      total_apartments: 270,
      revenue_today: 5000,
      arrivals_today: 5,
      departures_today: 3,
    });

    const pricing = insights.find((i) => i.id === "pricing-high-occ");
    expect(pricing).toBeDefined();
    expect(pricing!.severity).toBe("opportunity");
    expect(pricing!.confidence).toBe(87);
  });

  it("generates low-occupancy pricing insight when occupancy < 50%", () => {
    const insights = generateInsights({
      occupancy: 35,
      avg_rate: 100,
      open_maintenance: 0,
      urgent_maintenance: 0,
      housekeeping_dirty: 0,
      total_apartments: 270,
      revenue_today: 2000,
      arrivals_today: 2,
      departures_today: 1,
    });

    const pricing = insights.find((i) => i.id === "pricing-low-occ");
    expect(pricing).toBeDefined();
    expect(pricing!.severity).toBe("warning");
    expect(pricing!.confidence).toBe(74);
  });

  it("generates urgent maintenance insight when urgent > 0", () => {
    const insights = generateInsights({
      occupancy: 70,
      avg_rate: 100,
      open_maintenance: 2,
      urgent_maintenance: 3,
      housekeeping_dirty: 0,
      total_apartments: 270,
      revenue_today: 4000,
      arrivals_today: 4,
      departures_today: 2,
    });

    const urgent = insights.find((i) => i.id === "maint-urgent");
    expect(urgent).toBeDefined();
    expect(urgent!.severity).toBe("critical");
    expect(urgent!.confidence).toBe(95);
    expect(urgent!.title).toContain("3 urgent");
  });

  it("generates maintenance backlog insight when open > 5", () => {
    const insights = generateInsights({
      occupancy: 70,
      avg_rate: 100,
      open_maintenance: 8,
      urgent_maintenance: 0,
      housekeeping_dirty: 0,
      total_apartments: 270,
      revenue_today: 4000,
      arrivals_today: 4,
      departures_today: 2,
    });

    const backlog = insights.find((i) => i.id === "maint-backlog");
    expect(backlog).toBeDefined();
    expect(backlog!.severity).toBe("warning");
  });

  it("generates housekeeping insight when dirty > 30% of total", () => {
    const insights = generateInsights({
      occupancy: 70,
      avg_rate: 100,
      open_maintenance: 0,
      urgent_maintenance: 0,
      housekeeping_dirty: 100, // 100/270 = 37% > 30%
      total_apartments: 270,
      revenue_today: 4000,
      arrivals_today: 4,
      departures_today: 2,
    });

    const hk = insights.find((i) => i.id === "hk-backlog");
    expect(hk).toBeDefined();
    expect(hk!.severity).toBe("warning");
    expect(hk!.confidence).toBe(90);
  });

  it("does not generate housekeeping insight when dirty <= 30%", () => {
    const insights = generateInsights({
      occupancy: 70,
      avg_rate: 100,
      open_maintenance: 0,
      urgent_maintenance: 0,
      housekeeping_dirty: 50, // 50/270 = 18.5% < 30%
      total_apartments: 270,
      revenue_today: 4000,
      arrivals_today: 4,
      departures_today: 2,
    });

    const hk = insights.find((i) => i.id === "hk-backlog");
    expect(hk).toBeUndefined();
  });

  it("always generates energy insight", () => {
    const insights = generateInsights({
      occupancy: 70,
      avg_rate: 100,
      open_maintenance: 0,
      urgent_maintenance: 0,
      housekeeping_dirty: 0,
      total_apartments: 270,
      revenue_today: 4000,
      arrivals_today: 4,
      departures_today: 2,
    });

    const energy = insights.find((i) => i.id === "energy-occ-match");
    expect(energy).toBeDefined();
    expect(energy!.type).toBe("energy");
  });

  it("generates energy savings opportunity when occupancy < 60%", () => {
    const insights = generateInsights({
      occupancy: 40,
      avg_rate: 100,
      open_maintenance: 0,
      urgent_maintenance: 0,
      housekeeping_dirty: 0,
      total_apartments: 270,
      revenue_today: 2000,
      arrivals_today: 2,
      departures_today: 1,
    });

    const energy = insights.find((i) => i.id === "energy-occ-match");
    expect(energy).toBeDefined();
    expect(energy!.severity).toBe("opportunity");
    expect(energy!.impact).toContain("£");
  });
});

describe("calculateHealthScore", () => {
  it("returns high score for healthy property", () => {
    const score = calculateHealthScore({
      occupancy: 85,
      urgent_maintenance: 0,
      housekeeping_dirty: 10,
      total_apartments: 270,
    });
    expect(score).toBeGreaterThan(70);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("returns low score for unhealthy property", () => {
    const score = calculateHealthScore({
      occupancy: 30,
      urgent_maintenance: 5,
      housekeeping_dirty: 150,
      total_apartments: 270,
    });
    expect(score).toBeLessThan(50);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it("returns score between 0 and 100", () => {
    const score = calculateHealthScore({
      occupancy: 50,
      urgent_maintenance: 1,
      housekeeping_dirty: 30,
      total_apartments: 270,
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});