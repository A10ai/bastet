// @vitest-environment node
// Regression: properties and currency_rates had no write policies, so the
// user-scoped POST routes always failed; creating a property is an owner's
// job and needs the creator's membership (00036 review).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { setEnv, req, adminCookie, CSRF, tenantDb, A } from "./helpers";
import { createFakeSupabase } from "../__mocks__/supabase-fake";

let db: Record<string, Record<string, unknown>[]>;
const serviceTables: string[] = [];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    const c = createFakeSupabase(db as never);
    const from = c.from.bind(c);
    (c as { from: unknown }).from = (t: string) => { serviceTables.push(t); return from(t); };
    return c;
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => createFakeSupabase(db as never) }));

beforeEach(() => {
  setEnv();
  db = tenantDb();
  db.staff_properties = db.staff_properties || [];
  db.currency_rates = [];
  serviceTables.length = 0;
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("no network"); }));
});

const asOwner = () => { db.staff.find((s) => s.id === "staff-adminA")!.role = "owner"; };

describe("POST /api/v1/properties", () => {
  const body = { name: "Bastet Marsa Alam", slug: "bastet-rmf" };

  it("is refused for an admin", async () => {
    const { POST } = await import("@/app/api/v1/properties/route");
    const res = await POST(req("/api/v1/properties", { method: "POST", cookie: await adminCookie(), headers: CSRF, body }));
    expect(res.status).toBe(403);
  });

  it("creates the property as the service role and makes the owner a member", async () => {
    asOwner();
    const { POST } = await import("@/app/api/v1/properties/route");
    const res = await POST(req("/api/v1/properties", { method: "POST", cookie: await adminCookie(), headers: CSRF, body }));
    expect(res.status).toBe(201);
    const created = db.properties.find((p) => p.name === body.name)!;
    expect(created).toBeTruthy();
    expect(serviceTables).toContain("properties");
    expect(db.staff_properties).toContainEqual(expect.objectContaining({ staff_id: "staff-adminA", property_id: created.id }));
    expect(created.id).not.toBe(A);
  });
});

describe("POST /api/v1/currency-rates", () => {
  const body = { target_currency: "EGP", rate: 61.25 };

  it("is refused below owner (the table serves every property)", async () => {
    const { POST } = await import("@/app/api/v1/currency-rates/route");
    const res = await POST(req("/api/v1/currency-rates", { method: "POST", cookie: await adminCookie(), headers: CSRF, body }));
    expect(res.status).toBe(403);
  });

  it("records a manual rate for an owner", async () => {
    asOwner();
    const { POST } = await import("@/app/api/v1/currency-rates/route");
    const res = await POST(req("/api/v1/currency-rates", { method: "POST", cookie: await adminCookie(), headers: CSRF, body }));
    expect(res.status).toBe(201);
    expect(db.currency_rates).toContainEqual(expect.objectContaining({ target_currency: "EGP", rate: 61.25, source: "manual" }));
  });
});
