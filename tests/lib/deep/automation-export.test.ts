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
