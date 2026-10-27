// @vitest-environment node
// Regression: guest pre-check-in broadcast to every property's staff, let the
// party size grow unchecked and appended requests forever (Oct 2026, M2).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { setEnv, req } from "./helpers";
import { createFakeSupabase } from "../__mocks__/supabase-fake";

let db: Record<string, Record<string, unknown>[]>;
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => createFakeSupabase(db as never) }));
vi.mock("@/lib/event-bus", () => ({ emitEvent: async () => undefined }));

const TOKEN = "A".repeat(43);
beforeEach(async () => {
  setEnv();
  const { hashPortalToken } = await import("@/lib/portal");
  db = {
    booking_access_tokens: [
      { id: "t1", booking_id: "bk1", property_id: "P", token_hash: hashPortalToken(TOKEN), expires_at: new Date(Date.now() + 86400e3).toISOString(), revoked_at: null, use_count: 0 },
    ],
    bookings: [{ id: "bk1", reference: "BK-1", status: "confirmed", adults: 2, children: 0, total_amount_gbp: 700, special_requests: "Staff: late checkout agreed", property_id: "P", apartment_id: "apt1" }],
    staff: [
      { id: "s-P", property_id: "P", is_active: true },
      { id: "s-OTHER", property_id: "OTHER-TENANT", is_active: true },
    ],
    staff_properties: [],
    notifications: [],
  };
});

const submit = async (body: Record<string, unknown>) => {
  const { POST } = await import("@/app/api/v1/portal/[token]/precheckin/route");
  return POST(req(`/api/v1/portal/${TOKEN}/precheckin`, { method: "POST", headers: { "content-type": "application/json" }, body: { accept_terms: true, ...body } }), { params: Promise.resolve({ token: TOKEN }) });
};

describe("POST /api/v1/portal/:token/precheckin", () => {
  it("a larger party is recorded for the front desk, not written to the booking", async () => {
    const res = await submit({ adults: 20, children: 20 });
    expect(res.status).toBe(201);
    expect(db.bookings[0]).toMatchObject({ adults: 2, children: 0 });
    expect(db.bookings[0].precheckin).toMatchObject({ party_change_requested: true });
  });

  it("a smaller party is applied", async () => {
    await submit({ adults: 1 });
    expect(db.bookings[0]).toMatchObject({ adults: 1 });
  });

  it("resubmitting replaces the guest's request instead of appending", async () => {
    for (let i = 0; i < 5; i++) await submit({ special_requests: `request ${i} ${"x".repeat(900)}` });
    const text = String(db.bookings[0].special_requests);
    expect(text.startsWith("Staff: late checkout agreed\n")).toBe(true);
    expect(text).toContain("request 4");
    expect(text).not.toContain("request 3");
    expect(text.length).toBeLessThan(1100);
  });

  it("notifies only the booking's property staff", async () => {
    await submit({ special_requests: "IT NOTICE: re-login at https://evil.example/pms" });
    expect(db.notifications.map((n) => n.staff_id)).toEqual(["s-P"]);
  });
});
