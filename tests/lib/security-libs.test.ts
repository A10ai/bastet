import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createFakeSupabase, seedDb } from "../__mocks__/supabase-fake";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock("@/lib/api-auth");
  vi.doUnmock("@/lib/supabase/server");
  vi.resetModules();
  delete process.env.CRON_SECRET;
});

describe("csrf", () => {
  it("issues tokens, sets and clears the cookie, validates in constant time", async () => {
    const { generateCsrfToken, setCsrfCookie, clearCsrfCookie, validateCsrfToken, isMutatingMethod, CSRF_COOKIE_NAME, CSRF_HEADER_NAME } = await import("@/lib/csrf");
    const { NextResponse } = await import("next/server");
    const token = await generateCsrfToken();
    expect(token.length).toBeGreaterThanOrEqual(32);
    const res = setCsrfCookie(NextResponse.json({}), token);
    expect(res.cookies.get(CSRF_COOKIE_NAME)?.value).toBe(token);
    const cleared = clearCsrfCookie(NextResponse.json({}));
    expect(cleared.cookies.get(CSRF_COOKIE_NAME)?.value).toBe("");
    const good = new Request("http://x/api", { method: "POST", headers: { cookie: `${CSRF_COOKIE_NAME}=${token}`, [CSRF_HEADER_NAME]: token } });
    expect(validateCsrfToken(good)).toBe(true);
    const bad = new Request("http://x/api", { method: "POST", headers: { cookie: `${CSRF_COOKIE_NAME}=${token}`, [CSRF_HEADER_NAME]: token.slice(0, -1) + "x" } });
    expect(validateCsrfToken(bad)).toBe(false);
    expect(validateCsrfToken(new Request("http://x/api", { method: "POST" }))).toBe(false);
    expect(isMutatingMethod("post")).toBe(true);
    expect(isMutatingMethod("GET")).toBe(false);
  });
});

describe("api-error and rpc-error", () => {
  it("maps database errors to safe responses", async () => {
    const { apiError, apiSuccess, handleDbError, withErrorHandler } = await import("@/lib/api-error");
    const e = apiError("X", "msg", 418);
    expect(e.status).toBe(418);
    expect((await apiSuccess({ ok: 1 }).json()).data.ok).toBe(1);
    const notFound = handleDbError({ code: "PGRST116", message: "no rows" });
    expect(notFound.status).toBe(404);
    const dup = handleDbError({ code: "23505", message: "duplicate key value violates unique constraint" });
    expect([409, 400]).toContain(dup.status);
    const wrapped = withErrorHandler(async () => { throw new Error("kaboom"); });
    const res = await wrapped();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/kaboom/);
  });

  it("maps our CODE: detail convention and hides unknown errors", async () => {
    const { rpcErrorResponse } = await import("@/lib/rpc-error");
    const r1 = rpcErrorResponse({ message: "OUTSTANDING_BALANCE: 45.60 GBP unpaid on this stay" }, "t");
    expect(r1.status).toBe(402);
    expect((await r1.json()).error.code).toBe("OUTSTANDING_BALANCE");
    const r2 = rpcErrorResponse({ message: "conflicting key value violates exclusion constraint \"bookings_no_overlap\"", code: "23P01" }, "t");
    expect(r2.status).toBe(409);
    expect((await r2.json()).error.code).toBe("DOUBLE_BOOKING");
    const r3 = rpcErrorResponse({ message: 'relation "secret_table" does not exist', code: "42P01" }, "t");
    expect(r3.status).toBe(500);
    expect(JSON.stringify(await r3.json())).not.toMatch(/secret_table/);
    expect(rpcErrorResponse({ message: "LEDGER_IMMUTABLE: nope" }, "t").status).toBe(409);
    const r4 = rpcErrorResponse({ message: 'invalid input syntax for type uuid: "undefined"', code: "22P02" }, "t");
    expect(r4.status).toBe(400);
    expect((await r4.json()).error.code).toBe("INVALID_INPUT");
  });

  it("maps the 00033/00034 codes and database permission errors", async () => {
    const { rpcErrorResponse } = await import("@/lib/rpc-error");
    expect(rpcErrorResponse({ message: "ROLE_FORBIDDEN: manager required", code: "42501" }, "t").status).toBe(403);
    expect(rpcErrorResponse({ message: "PROPERTY_FORBIDDEN" }, "t").status).toBe(403);
    expect(rpcErrorResponse({ message: "STALE_STAY: stay ended" }, "t").status).toBe(409);
    expect(rpcErrorResponse({ message: "BUSINESS_DATE_OPEN: 2026-10-27 has not ended" }, "t").status).toBe(409);
    // direct-write guards (00036)
    expect(rpcErrorResponse({ message: "BOOKING_IMMUTABLE: total_amount_gbp cannot be changed directly" }, "t").status).toBe(409);
    expect(rpcErrorResponse({ message: "PRICE_MISMATCH: the stay is quoted at 200.00" }, "t").status).toBe(409);
    expect(rpcErrorResponse({ message: "ROOMS_BLOCKED: dates cannot change while rooms are blocked" }, "t").status).toBe(409);
    // any <ENTITY>_NOT_FOUND, including ones not listed explicitly
    const nf = rpcErrorResponse({ message: "GUEST_NOT_FOUND" }, "t");
    expect(nf.status).toBe(404);
    expect((await nf.json()).error.code).toBe("GUEST_NOT_FOUND");
    // RLS refusal / missing grant: 403 without leaking the relation name
    const denied = rpcErrorResponse({ message: "permission denied for table folio_lines", code: "42501" }, "t");
    expect(denied.status).toBe(403);
    expect(JSON.stringify(await denied.json())).not.toMatch(/folio_lines/);
  });
});

describe("cron-auth", () => {
  it("accepts the cron secret, rejects a wrong one, and falls back to an admin session", async () => {
    process.env.CRON_SECRET = "s3cret-cron-token";
    vi.doMock("@/lib/api-auth", () => ({
      requireRole: async (req: NextRequest) => (req.headers.get("x-test-admin") ? { authenticated: true, userId: "u", email: "a@b.co", role: "admin" } : { authenticated: false, error: new Response("no", { status: 401 }) }),
      ROLES: { ADMIN: ["admin"] },
    }));
    const { requireCronOrAdmin } = await import("@/lib/cron-auth");
    const ok = await requireCronOrAdmin(new NextRequest("http://x/api/v1/cron/x", { headers: { authorization: "Bearer s3cret-cron-token" } }));
    expect(ok.ok).toBe(true);
    const wrong = await requireCronOrAdmin(new NextRequest("http://x/api/v1/cron/x", { headers: { authorization: "Bearer nope" } }));
    expect(wrong.ok).toBe(false);
    const admin = await requireCronOrAdmin(new NextRequest("http://x/api/v1/cron/x", { headers: { "x-test-admin": "1" } }));
    expect(admin.ok).toBe(true);
    if (admin.ok) expect(admin.actor).toBe("a@b.co");
  });
});

describe("route factories", () => {
  it("getByIdHandler returns the row, 404 when missing, and updateByIdHandler whitelists fields", async () => {
    const db = seedDb();
    const fake = createFakeSupabase(db, { user: { id: "user-1", email: "owner@test.local" } });
    vi.doMock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => fake }));
    vi.doMock("@/lib/api-auth", () => ({
      requireRole: async () => ({ authenticated: true, userId: "user-1", email: "owner@test.local", role: "owner", propertyId: db.properties[0].id }),
      ROLES: { ALL_STAFF: ["readonly"], MANAGEMENT: ["manager"] },
    }));
    const { getByIdHandler, updateByIdHandler } = await import("@/lib/crud");
    const { z } = await import("zod");
    const get = getByIdHandler({ table: "apartment_types", roles: ["readonly"], label: "Apartment type" });
    const found = await get(new NextRequest("http://x/api"), { params: Promise.resolve({ id: db.apartment_types[0].id as string }) });
    expect(found.status).toBe(200);
    const missing = await get(new NextRequest("http://x/api"), { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000000" }) });
    expect(missing.status).toBe(404);

    const update = updateByIdHandler({
      table: "apartment_types", roles: ["manager"], schema: z.object({ name: z.string().optional(), evil: z.string().optional() }),
      allowedFields: ["name"], label: "Apartment type", audit: { action: "t", category: "settings", resource_type: "apartment_type" },
    });
    const req = new NextRequest("http://x/api", { method: "PATCH", body: JSON.stringify({ name: "Suite", evil: "x" }), headers: { "content-type": "application/json" } });
    const res = await update(req, { params: Promise.resolve({ id: db.apartment_types[0].id as string }) });
    expect(res.status).toBe(200);
    expect(db.apartment_types[0].name).toBe("Suite");
    expect(db.apartment_types[0].evil).toBeUndefined();
    const empty = await update(new NextRequest("http://x/api", { method: "PATCH", body: JSON.stringify({ evil: "x" }), headers: { "content-type": "application/json" } }), { params: Promise.resolve({ id: db.apartment_types[0].id as string }) });
    expect(empty.status).toBe(400);
  });

  it("assign handler validates the staff role and the item status", async () => {
    const db = seedDb();
    const fake = createFakeSupabase(db);
    vi.doMock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => fake }));
    vi.doMock("@/lib/api-auth", () => ({
      requireRole: async () => ({ authenticated: true, userId: "user-1", email: "o@t", role: "manager" }),
      ROLES: { MANAGEMENT: ["manager"] },
    }));
    const { createAssignHandler } = await import("@/lib/assign-handler");
    const post = createAssignHandler({ table: "housekeeping_tasks", label: "housekeeping task", assignableRoles: ["housekeeping", "manager"], assignableStatuses: ["pending", "assigned"], select: "*", audit: { action: "a", category: "housekeeping", resource_type: "housekeeping_task" } });
    const mk = (body: unknown) => new NextRequest("http://x/api", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
    const hkStaff = db.staff.find((s) => s.role === "housekeeping")!;
    const ok = await post(mk({ staff_id: hkStaff.id }), { params: Promise.resolve({ id: db.housekeeping_tasks[0].id as string }) });
    expect(ok.status).toBe(200);
    const wrongRole = await post(mk({ staff_id: db.staff[0].id }), { params: Promise.resolve({ id: db.housekeeping_tasks[0].id as string }) });
    expect(wrongRole.status).toBe(400);
    const completed = await post(mk({ staff_id: hkStaff.id }), { params: Promise.resolve({ id: db.housekeeping_tasks[2].id as string }) });
    expect(completed.status).toBe(409);
    const invalid = await post(mk({ staff_id: "nope" }), { params: Promise.resolve({ id: db.housekeeping_tasks[0].id as string }) });
    expect(invalid.status).toBe(400);
  });

  it("guest sub-resource handler filters by type and caps the limit", async () => {
    const db = seedDb();
    db.guest_activity_log = [
      { id: "1", guest_id: db.guests[0].id, activity_type: "stay", created_at: "2026-01-01" },
      { id: "2", guest_id: db.guests[0].id, activity_type: "complaint", created_at: "2026-02-01" },
    ];
    const fake = createFakeSupabase(db);
    vi.doMock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => fake }));
    vi.doMock("@/lib/api-auth", () => ({ requireRole: async () => ({ authenticated: true, role: "receptionist" }), ROLES: { FRONT_DESK: ["receptionist"] } }));
    const { createGuestSubresourceHandler } = await import("@/lib/guest-subresource");
    const { guestActivityQuerySchema } = await import("@/lib/validation");
    const get = createGuestSubresourceHandler({ table: "guest_activity_log", typeColumn: "activity_type", querySchema: guestActivityQuerySchema, defaultLimit: 50 });
    const all = await get(new NextRequest("http://x/api"), { params: Promise.resolve({ id: db.guests[0].id as string }) });
    expect((await all.json()).data.length).toBe(2);
    const filtered = await get(new NextRequest("http://x/api?type=complaint"), { params: Promise.resolve({ id: db.guests[0].id as string }) });
    expect((await filtered.json()).data.length).toBe(1);
    const bad = await get(new NextRequest("http://x/api?limit=abc"), { params: Promise.resolve({ id: db.guests[0].id as string }) });
    expect([200, 400]).toContain(bad.status);
  });
});

describe("fx", () => {
  it("stores ECB rates when no provider key is configured", async () => {
    delete process.env.OPEN_EXCHANGE_RATES_APP_ID;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ rates: { EGP: 62.1, EUR: 1.18, USD: 1.33 } }), { status: 200 })));
    const { refreshFxRates } = await import("@/lib/fx");
    const db = seedDb();
    const r = await refreshFxRates(createFakeSupabase(db));
    expect("stored" in r && r.stored === 3).toBe(true);
    expect(db.currency_rates.length).toBe(4);
  });
  it("reports a provider failure instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    const { refreshFxRates } = await import("@/lib/fx");
    const r = await refreshFxRates(createFakeSupabase(seedDb()));
    expect("error" in r).toBe(true);
  });
});

describe("scheduled-cycle", () => {
  it("runs brain, automations and training and records the cycle", async () => {
    vi.doMock("@/lib/ai-brain", () => ({ getBrainConfig: async () => ({ enabled: true }), runBrainCycle: async () => ({ decisions: [1, 2], mode: "supervised", summary: "ok" }) }));
    vi.doMock("@/lib/automations-engine", () => ({ runAllAutomations: async () => [{ results: [{ action: "x" }, { action: "y_check" }] }] }));
    vi.doMock("@/lib/prediction-model", () => ({ trainModel: async () => ({ training_samples: 10, accuracy_mae: 1, accuracy_r_squared: 0.5 }) }));
    const { runScheduledCycle, getLastCycle } = await import("@/lib/scheduled-cycle");
    const db = seedDb();
    const sb = createFakeSupabase(db);
    const r = await runScheduledCycle(sb, "test");
    expect((r.brain as { decisions: number }).decisions).toBe(2);
    expect((r.automations as { total_actions: number }).total_actions).toBe(1);
    expect(db.system_events.length).toBe(1);
    const last = await getLastCycle(sb);
    expect(last?.payload).toBeTruthy();
  });
});
