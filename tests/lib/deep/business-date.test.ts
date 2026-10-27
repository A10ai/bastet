import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
/**
 * "Today" must be the property's business date (Africa/Cairo, stored on
 * properties.timezone and used by SQL property_business_date()), not the
 * server's clock date. Run under TZ=UTC (Vercel's default).
 */
import { createFakeSupabase, type FakeDb } from "../../__mocks__/supabase-fake";

describe(`ai-chat arrivals 'today' at 01:30 Cairo time (server TZ=${process.env.TZ})`, () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-27T22:30:00Z")); }); // 28 Oct 01:30 EEST
  afterAll(() => vi.useRealTimers());
  it("lists the guest arriving on the Cairo date (2026-10-28)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const db: FakeDb = {
      properties: [{ id: "p", name: "Bastet", timezone: "Africa/Cairo", status: "active" }],
      bookings: [{ id: "b1", reference: "BAS-1", status: "confirmed", check_in: "2026-10-28", nights: 2, created_at: "2026-10-01",
        guest: { first_name: "Ada", last_name: "G", loyalty_tier: "bronze", vip_status: false }, apartment: { number: "101" } }],
    };
    const { processChat } = await import("@/lib/ai-chat");
    const r = await processChat("who is arriving today?", createFakeSupabase(db));
    vi.unstubAllEnvs();
    expect(r.content).toMatch(/arrivals: 1 guest/);
  });
});
