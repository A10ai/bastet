import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
/** Automation thresholds and browser CSV export. */
import { createFakeSupabase, type FakeDb } from "../../__mocks__/supabase-fake";

describe("automations-engine auto-pricing at exactly 85% occupancy", () => {
  beforeEach(() => { vi.resetModules(); vi.stubEnv("AUTO_PRICING_ENABLED", "true"); });
  afterEach(() => vi.unstubAllEnvs());

  it("does not CUT rates when occupancy is exactly 85% (high-demand boundary)", async () => {
    const apartments = Array.from({ length: 20 }, (_, i) => ({ id: `a${i}`, status: i < 17 ? "occupied" : "available" })); // 17/20 = 85%
    const db: FakeDb = {
      apartments,
      properties: [{ id: "p1" }],
      apartment_types: [{ id: "t1", name: "Studio", base_weekly_rate_gbp: 300 }],
      pricing_decisions: [],
    };
    const { runAutomation, getAutomations } = await import("@/lib/automations-engine");
    const id = (getAutomations() as { id: string; name: string }[]).find((a) => /pric/i.test(a.id + a.name))!.id;
    const res = await runAutomation(id, createFakeSupabase(db));
    const newRate = db.apartment_types[0].base_weekly_rate_gbp as number;
    expect({ newRate, actions: res.map((r) => r.action) }).toEqual({ newRate: 300, actions: ["pricing_check"] });
  });

  async function runPricing(db: FakeDb, opts: Parameters<typeof createFakeSupabase>[1] = {}) {
    const { runAutomation, getAutomations } = await import("@/lib/automations-engine");
    const id = (getAutomations() as { id: string; name: string }[]).find((a) => /pric/i.test(a.id + a.name))!.id;
    return runAutomation(id, createFakeSupabase(db, opts));
  }
  const busyDb = (): FakeDb => ({
    apartments: Array.from({ length: 20 }, (_, i) => ({ id: `a${i}`, status: i < 19 ? "occupied" : "available" })), // 95%
    properties: [{ id: "p1" }],
    apartment_types: [{ id: "t1", name: "Studio", base_weekly_rate_gbp: 300, property_id: "p1" }],
    pricing_decisions: [],
  });

  it("records the decision, then raises the rate", async () => {
    const db = busyDb();
    const res = await runPricing(db);
    expect(db.apartment_types[0].base_weekly_rate_gbp).toBe(345);
    expect(db.pricing_decisions).toHaveLength(1);
    expect(res.map((r) => r.action)).toContain("rate_adjusted");
  });

  it("leaves the rate alone when another run already claimed today (23505)", async () => {
    const db = busyDb();
    const res = await runPricing(db, { errors: { pricing_decisions: { message: "duplicate key", code: "23505", op: "insert" } } });
    expect(db.apartment_types[0].base_weekly_rate_gbp).toBe(300);
    expect(res.map((r) => r.action)).toEqual(["pricing_cooldown"]);
  });

  it("never changes a rate it could not record", async () => {
    const db = busyDb();
    await runPricing(db, { errors: { pricing_decisions: { message: "new row violates row-level security policy", code: "42501", op: "insert" } } });
    expect(db.apartment_types[0].base_weekly_rate_gbp).toBe(300);
  });
});

describe("export-utils.toCSV", () => {
  async function capture(rows: Record<string, unknown>[]) {
    let text = "";
    const OrigBlob = globalThis.Blob;
    vi.stubGlobal("Blob", class extends OrigBlob { constructor(parts: BlobPart[], o?: BlobPropertyBag) { super(parts, o); text = parts.map(String).join(""); } });
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    const { toCSV } = await import("@/lib/export-utils");
    toCSV(rows, "r");
    vi.unstubAllGlobals();
    return text;
  }
  it("neutralises formula-leading cells (=, +, -, @) from guest-controlled data", async () => {
    const csv = await capture([{ Nationality: "=cmd|' /C calc'!A0", "Guest Count": 1 }, { Nationality: "@SUM(1+1)", "Guest Count": 2 }]);
    const lines = csv.split("\n").slice(1);
    for (const l of lines) expect(l).not.toMatch(/^"?[=+\-@]/);
  });
  it("quotes values containing a bare carriage return", async () => {
    const csv = await capture([{ A: "line1\rline2", B: 1 }]);
    expect(csv.split("\n")[1]).toBe('"line1\rline2",1');
  });
});
