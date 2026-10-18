import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * /api/v1/health must answer 503 when a hard dependency is down and 200
 * (possibly "degraded") otherwise, and must never leak internals.
 */
type Probe = { tableError?: { code: string } | null; fnError?: { code: string } | null; lastCycle?: string | null; lastClose?: string | null };
let probe: Probe = {};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    const resolveFor = (table: string) => {
      if (table === "properties") return { data: null, error: probe.tableError ?? null, count: 1 };
      if (table === "system_events") return { data: probe.lastCycle === null ? null : { created_at: probe.lastCycle ?? new Date().toISOString() }, error: null };
      if (table === "daily_closes") return { data: probe.lastClose === null ? null : { business_date: probe.lastClose ?? new Date().toISOString().slice(0, 10) }, error: null };
      return { data: null, error: null };
    };
    const builder = (table: string) => {
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order", "limit"]) b[m] = () => b;
      b.maybeSingle = () => Promise.resolve(resolveFor(table));
      b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(resolveFor(table)).then(res, rej);
      return b;
    };
    return { from: builder, rpc: async () => ({ data: 0, error: probe.fnError ?? null }) };
  },
}));
vi.mock("@/lib/rate-limit", () => ({ RATE_LIMIT_BACKEND: "memory" }));

const ENV = { NEXT_PUBLIC_SUPABASE_URL: "http://sb.local", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "svc", SENTRY_DSN: "https://x@sentry.io/1" };
let authOk = true;

beforeEach(() => {
  probe = {};
  authOk = true;
  Object.assign(process.env, ENV);
  delete process.env.VERCEL;
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: authOk, status: authOk ? 200 : 502 })));
});
afterEach(() => vi.unstubAllGlobals());

async function health() {
  const mod = await import("@/lib/health");
  return mod.runHealthChecks();
}

describe("GET /api/v1/health", () => {
  it("is healthy when database, auth and jobs are fine", async () => {
    const { status, body } = await health();
    expect(status).toBe(200);
    expect(body.status).toBe("healthy");
    expect(body.checks.database.status).toBe("ok");
    expect(body.checks.auth.status).toBe("ok");
    expect(body.checks.scheduler.status).toBe("ok");
    expect(body.checks.night_audit.status).toBe("ok");
    expect(typeof body.checks.database.latency_ms).toBe("number");
  });

  it("returns 503 when the database is unreachable and hides the error", async () => {
    probe = { tableError: { code: "ECONNREFUSED to db.internal:5432" } };
    const { status, body } = await health();
    expect(status).toBe(503);
    expect(body.status).toBe("unhealthy");
    expect(body.checks.database).toMatchObject({ status: "fail", detail: "unreachable" });
    expect(JSON.stringify(body)).not.toContain("db.internal");
  });

  it("returns 503 when the auth server is down", async () => {
    authOk = false;
    const { status, body } = await health();
    expect(status).toBe(503);
    expect(body.checks.auth.status).toBe("fail");
  });

  it("is degraded (200) when migrations are missing", async () => {
    probe = { fnError: { code: "PGRST202" } };
    const { status, body } = await health();
    expect(status).toBe(200);
    expect(body.status).toBe("degraded");
    expect(body.checks.database.status).toBe("degraded");
    expect(body.checks.database.detail).toContain("apply migrations");
  });

  it("is degraded when the scheduler is stale or no day has been closed", async () => {
    probe = { lastCycle: new Date(Date.now() - 3 * 3600_000).toISOString(), lastClose: null };
    const { status, body } = await health();
    expect(status).toBe(200);
    expect(body.checks.scheduler.status).toBe("degraded");
    expect(body.checks.scheduler.detail).toMatch(/180 min ago/);
    expect(body.checks.night_audit).toMatchObject({ status: "degraded", detail: "no day closed yet" });
  });

  it("fails on missing configuration without touching dependencies", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { status, body } = await health();
    expect(status).toBe(503);
    expect(body.checks.config).toMatchObject({ status: "fail" });
    expect(body.checks.database).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("flags per-instance rate limiting on serverless as degraded", async () => {
    process.env.VERCEL = "1";
    const { body } = await health();
    expect(body.checks.rate_limiter.status).toBe("degraded");
  });
});
