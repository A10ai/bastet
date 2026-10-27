// @vitest-environment node
// Regression: admin routes on the service-role client were not scoped to the
// caller's property and let an admin grant owner (Oct 2026 deep test, C1/M1).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { setEnv, req, adminCookie, CSRF, tenantDb, A, B } from "./helpers";
import { createFakeSupabase } from "../__mocks__/supabase-fake";

let db: Record<string, Record<string, unknown>[]>;
const rpcCalls: Record<string, unknown>[] = [];
const created: { id: string }[] = [];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    const c = createFakeSupabase(db as never, {
      rpc: { run_night_audit: (a: Record<string, unknown>) => { rpcCalls.push(a); return { closed: true }; } },
    }) as unknown as Record<string, unknown>;
    c.auth = {
      ...(c.auth as object),
      admin: {
        listUsers: async () => ({ data: { users: [] } }),
        createUser: async () => { const u = { id: `new-uid-${created.length}` }; created.push(u); return { data: { user: u }, error: null }; },
        deleteUser: async () => ({}),
        updateUserById: async () => ({}),
      },
    };
    return c;
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => createFakeSupabase(db as never) }));

beforeEach(() => {
  setEnv();
  delete process.env.CRON_SECRET;
  db = tenantDb();
  rpcCalls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("no network"); }));
});

const put = async (body: unknown) => {
  const { PUT } = await import("@/app/api/v1/admin/users/route");
  return PUT(req("/api/v1/admin/users", { method: "PUT", cookie: await adminCookie(), headers: CSRF, body }));
};

describe("/api/v1/admin/users (admin of property A)", () => {
  it("GET lists only property A's staff", async () => {
    const { GET } = await import("@/app/api/v1/admin/users/route");
    const res = await GET(req("/api/v1/admin/users", { cookie: await adminCookie() }));
    expect(res.status).toBe(200);
    const ids = (await res.json()).data.map((s: { id: string }) => s.id);
    expect(ids).toContain("staff-recepA");
    expect(ids).not.toContain("staff-ownerB");
    expect(ids).not.toContain("staff-recepB");
  });

  it("PUT cannot promote yourself or change your own role", async () => {
    const res = await put({ id: "staff-adminA", role: "owner" });
    expect(res.status).toBe(400); // owner is not an assignable role
    const res2 = await put({ id: "staff-adminA", role: "manager" });
    expect(res2.status).toBe(403);
    expect(db.staff.find((s) => s.id === "staff-adminA")!.role).toBe("admin");
  });

  it("PUT cannot touch another property's staff", async () => {
    const res = await put({ id: "staff-ownerB", role: "readonly", is_active: false });
    expect(res.status).toBe(404);
    expect(db.staff.find((s) => s.id === "staff-ownerB")).toMatchObject({ role: "owner", is_active: true });
  });

  it("PUT cannot change a peer admin, nor hand out admin", async () => {
    expect((await put({ id: "staff-admin2A", is_active: false })).status).toBe(403);
    expect((await put({ id: "staff-recepA", role: "admin" })).status).toBe(403);
  });

  it("PUT can manage a receptionist of the same property", async () => {
    const res = await put({ id: "staff-recepA", role: "manager" });
    expect(res.status).toBe(200);
    expect(db.staff.find((s) => s.id === "staff-recepA")!.role).toBe("manager");
  });

  it("POST validates the body, refuses owner/admin and puts the account on the caller's property", async () => {
    const { POST } = await import("@/app/api/v1/admin/users/route");
    const post = async (body: unknown) =>
      POST(req("/api/v1/admin/users", { method: "POST", cookie: await adminCookie(), headers: CSRF, body }));
    const base = { first_name: "E", last_name: "Vil", email: "e@x.com", password: "Str0ngPassword!" };
    expect((await post({ ...base, role: "owner" })).status).toBe(400);
    expect((await post({ ...base, role: "admin" })).status).toBe(403);
    expect((await post({ ...base, password: "x", role: "receptionist" })).status).toBe(400);
    const ok = await post({ ...base, role: "receptionist" });
    expect(ok.status).toBe(201);
    expect(db.staff.find((s) => s.email === "e@x.com")).toMatchObject({ role: "receptionist", property_id: A });
    // Service-role audit rows name the property so its admins can see them (00036)
    const auditRow = (db.audit_log || []).find((r) => r.action === "admin.user.create");
    expect(auditRow?.metadata).toMatchObject({ property_id: A });
  });

  it("DELETE cannot deactivate another property's staff or yourself", async () => {
    const { DELETE } = await import("@/app/api/v1/admin/users/route");
    const del = async (id: string) =>
      DELETE(req(`/api/v1/admin/users?id=${id}`, { method: "DELETE", cookie: await adminCookie(), headers: CSRF }));
    expect((await del("staff-ownerB")).status).toBe(404);
    expect((await del("staff-adminA")).status).toBe(403);
    expect((await del("staff-recepA")).status).toBe(200);
    expect(db.staff.find((s) => s.id === "staff-recepA")!.is_active).toBe(false);
  });
});

describe("/api/v1/admin/database (admin of property A)", () => {
  it("GET ?table=guests returns only property A and redacts passport numbers", async () => {
    const { GET } = await import("@/app/api/v1/admin/database/route");
    const res = await GET(req("/api/v1/admin/database?table=guests", { cookie: await adminCookie() }));
    const body = await res.json();
    expect(body.data.map((g: { id: string }) => g.id)).toEqual(["guest-A1"]);
    expect(body.data[0].passport_number).toBe("[redacted]");
    expect(body.writable).toBe(false);
  });

  it("staff is not exposed at all", async () => {
    const { GET, PUT } = await import("@/app/api/v1/admin/database/route");
    expect((await GET(req("/api/v1/admin/database?table=staff", { cookie: await adminCookie() }))).status).toBe(400);
    const res = await PUT(req("/api/v1/admin/database", { method: "PUT", cookie: await adminCookie(), headers: CSRF, body: { table: "staff", id: "staff-adminA", updates: { role: "owner", property_id: B } } }));
    expect(res.status).toBe(400);
    expect(db.staff.find((s) => s.id === "staff-adminA")).toMatchObject({ role: "admin", property_id: A });
  });

  it("read-only tables, global tables (non-owner) and property_id writes are refused", async () => {
    const { PUT, POST } = await import("@/app/api/v1/admin/database/route");
    const cookie = await adminCookie();
    expect((await PUT(req("/api/v1/admin/database", { method: "PUT", cookie, headers: CSRF, body: { table: "guests", id: "guest-A1", updates: { first_name: "X" } } }))).status).toBe(403);
    expect((await PUT(req("/api/v1/admin/database", { method: "PUT", cookie, headers: CSRF, body: { table: "booking_channels", id: "ch1", updates: { name: "X" } } }))).status).toBe(403);
    db.buildings = [{ id: "bld-A", property_id: A, name: "Main" }];
    expect((await PUT(req("/api/v1/admin/database", { method: "PUT", cookie, headers: CSRF, body: { table: "buildings", id: "bld-A", updates: { property_id: B } } }))).status).toBe(400);
    const ins = await POST(req("/api/v1/admin/database", { method: "POST", cookie, headers: CSRF, body: { table: "buildings", row: { name: "Annex" } } }));
    expect(ins.status).toBe(201);
    expect(db.buildings.find((b) => b.name === "Annex")).toMatchObject({ property_id: A });
  });

  it("secret columns of global tables are redacted", async () => {
    const { GET } = await import("@/app/api/v1/admin/database/route");
    const body = await (await GET(req("/api/v1/admin/database?table=booking_channels", { cookie: await adminCookie() }))).json();
    expect(body.data[0].api_connection).toBe("[redacted]");
  });
});

describe("/api/v1/cron/night-audit", () => {
  it("an admin cannot run the audit on another property", async () => {
    const { POST } = await import("@/app/api/v1/cron/night-audit/route");
    const res = await POST(req("/api/v1/cron/night-audit", { method: "POST", cookie: await adminCookie(), headers: CSRF, body: { property_id: B, business_date: "2026-01-01" } }));
    expect(res.status).toBe(403);
    expect(rpcCalls).toHaveLength(0);
  });

  it("an admin without property_id only audits their own property", async () => {
    const { POST } = await import("@/app/api/v1/cron/night-audit/route");
    const res = await POST(req("/api/v1/cron/night-audit", { method: "POST", cookie: await adminCookie(), headers: CSRF, body: {} }));
    expect(res.status).toBe(200);
    expect(rpcCalls.map((c) => c.p_property_id)).toEqual([A]);
  });

  it("refuses a business date that is today or in the future", async () => {
    const { POST } = await import("@/app/api/v1/cron/night-audit/route");
    const future = new Date(Date.now() + 3 * 86400e3).toISOString().slice(0, 10);
    const res = await POST(req("/api/v1/cron/night-audit", { method: "POST", cookie: await adminCookie(), headers: CSRF, body: { property_id: A, business_date: future } }));
    expect(res.status).toBe(400);
    expect(rpcCalls).toHaveLength(0);
  });

  it("GET with an admin session returns only the admin's own closes", async () => {
    const { GET } = await import("@/app/api/v1/cron/night-audit/route");
    const res = await GET(req("/api/v1/cron/night-audit", { cookie: await adminCookie() }));
    const ids = (await res.json()).data.map((c: { property_id: string }) => c.property_id);
    expect(ids).toEqual([A]);
    expect(rpcCalls).toHaveLength(0);
  });

  it("GET with the cron secret (how Vercel Cron calls it) runs the audit for every property", async () => {
    process.env.CRON_SECRET = "s3cr3t-value-0123456789";
    const { GET } = await import("@/app/api/v1/cron/night-audit/route");
    const res = await GET(req("/api/v1/cron/night-audit", { headers: { authorization: "Bearer s3cr3t-value-0123456789" } }));
    expect(res.status).toBe(200);
    expect(rpcCalls.map((c) => c.p_property_id).sort()).toEqual([A, B].sort());
    const audits = (db.audit_log || []).filter((r) => r.action === "night_audit.run");
    expect(audits.map((r) => (r.metadata as { property_id: string }).property_id).sort()).toEqual([A, B].sort());
  });

  it("GET ?status=1 with the cron secret only reports", async () => {
    process.env.CRON_SECRET = "s3cr3t-value-0123456789";
    const { GET } = await import("@/app/api/v1/cron/night-audit/route");
    const res = await GET(req("/api/v1/cron/night-audit?status=1", { headers: { authorization: "Bearer s3cr3t-value-0123456789" } }));
    expect(res.status).toBe(200);
    expect(rpcCalls).toHaveLength(0);
  });
});

describe("cron-auth", () => {
  it("an empty CRON_SECRET never matches 'Bearer '", async () => {
    process.env.CRON_SECRET = "";
    const { isCronRequest } = await import("@/lib/cron-auth");
    expect(isCronRequest(req("/api/v1/cron/fx", { headers: { authorization: "Bearer " } }))).toBe(false);
  });

  it("accepts only the exact secret", async () => {
    process.env.CRON_SECRET = "s3cr3t-value-0123456789";
    const { isCronRequest } = await import("@/lib/cron-auth");
    expect(isCronRequest(req("/x", { headers: { authorization: "Bearer s3cr3t-value-0123456789" } }))).toBe(true);
    for (const h of ["Bearer s3cr3t-value-012345678", "Bearer s3cr3t-value-01234567899", "Bearer S3cr3t-value-0123456789", "bearer s3cr3t-value-0123456789"]) {
      expect(isCronRequest(req("/x", { headers: { authorization: h } }))).toBe(false);
    }
  });
});
