// @vitest-environment node
// Regression: erasure updated columns the guests table does not have
// ("address", "postal_code"), so PostgREST rejected the update, the error
// was ignored, and the request was marked completed with the guest's
// address, postcode and date of birth still on file.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { setEnv, req, adminCookie, CSRF, tenantDb, A } from "./helpers";
import { createFakeSupabase } from "../__mocks__/supabase-fake";

let db: Record<string, Record<string, unknown>[]>;
const REQUEST_ID = "e0000000-0000-4000-8000-0000000000e1";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => createFakeSupabase(db as never) }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => createFakeSupabase(db as never) }));

beforeEach(() => {
  setEnv();
  db = tenantDb();
  Object.assign(db.guests.find((g) => g.id === "guest-A1")!, {
    email: "ann@example.com", phone: "+20 100 123 4567", date_of_birth: "1990-04-01",
    address_line1: "12 Sheraton Rd", address_line2: "Flat 3", city: "Hurghada", postcode: "84511", nationality: "EG",
  });
  db.gdpr_requests = [{ id: REQUEST_ID, property_id: A, guest_id: "guest-A1", request_type: "erasure", status: "pending" }];
  for (const t of ["guest_preferences", "guest_communications", "guest_activity_log", "reviews", "guest_consent"]) db[t] = [];
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("no network"); }));
});

describe("POST /api/v1/gdpr complete_erasure", () => {
  it("clears every personal field the guests table actually has", async () => {
    const { POST } = await import("@/app/api/v1/gdpr/route");
    const res = await POST(req("/api/v1/gdpr", {
      method: "POST", cookie: await adminCookie(), headers: CSRF, body: { action: "complete_erasure", request_id: REQUEST_ID },
    }));
    expect(res.status).toBeLessThan(300);
    const g = db.guests.find((x) => x.id === "guest-A1")!;
    expect(g).toMatchObject({
      first_name: "[REDACTED]", last_name: "[REDACTED]", phone: null, passport_number: null, date_of_birth: null,
      nationality: null, address_line1: null, address_line2: null, city: null, postcode: null,
    });
    expect(String(g.email)).toMatch(/^redacted_/);
    expect(g).not.toHaveProperty("address");
    expect(g).not.toHaveProperty("postal_code");
  });
});
