// @vitest-environment node
// Regressions from the Oct 2026 deep test: ai/chat auth (M4), rate-limit keys
// and lockout (M5), login CSRF and enumeration, JWT claim checks, JWKS kid
// poisoning, CSRF double submit.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SignJWT, generateKeyPair, exportJWK } from "jose";
import { setEnv, req, accessToken, sessionCookie, VERIFIED_TOTP, UID, CSRF, authServerFetch } from "./helpers";
import { createFakeSupabase } from "../__mocks__/supabase-fake";

let db: Record<string, Record<string, unknown>[]>;
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => createFakeSupabase(db as never) }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => createFakeSupabase(db as never) }));
vi.mock("@/lib/ai-chat", () => ({ processChat: async () => ({ reply: "Guests in house: ..." }) }));

beforeEach(async () => {
  setEnv();
  delete process.env.CRON_SECRET;
  db = { staff: [{ id: "s1", auth_user_id: UID, role: "manager", is_active: true, property_id: "A", email: "m@x.com" }] };
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("no network"); }));
  const { resetMfaCache } = await import("@/lib/mfa");
  resetMfaCache();
});
afterEach(() => {
  delete process.env.TRUST_PROXY_HEADERS;
});

describe("ai/chat goes through requireRole", () => {
  it("an enrolled manager on an aal1 session is refused", async () => {
    vi.stubGlobal("fetch", vi.fn(authServerFetch([VERIFIED_TOTP])));
    const tok = await accessToken({ aal: "aal1" });
    const cookie = `${sessionCookie(tok, [VERIFIED_TOTP])}; hospitai-csrf=csrf123`;
    const { POST } = await import("@/app/api/v1/ai/chat/route");
    const res = await POST(req("/api/v1/ai/chat", { method: "POST", cookie, headers: CSRF, body: { message: "who is in house?" } }));
    expect(res.status).toBe(403);
  });

  it("a deactivated account is refused", async () => {
    db.staff[0].is_active = false;
    const tok = await accessToken({ aal: "aal2" });
    const cookie = `${sessionCookie(tok, [])}; hospitai-csrf=csrf123`;
    const { POST } = await import("@/app/api/v1/ai/chat/route");
    const res = await POST(req("/api/v1/ai/chat", { method: "POST", cookie, headers: CSRF, body: { message: "hi" } }));
    expect(res.status).toBe(403);
  });

  it("an active, verified manager gets an answer", async () => {
    const tok = await accessToken({ aal: "aal2" });
    const cookie = `${sessionCookie(tok, [])}; hospitai-csrf=csrf123`;
    const { POST } = await import("@/app/api/v1/ai/chat/route");
    const res = await POST(req("/api/v1/ai/chat", { method: "POST", cookie, headers: CSRF, body: { message: "hi" } }));
    expect(res.status).toBe(200);
  });
});

describe("login", () => {
  const login = async (body: unknown, headers: Record<string, string> = {}) => {
    const { POST } = await import("@/app/api/v1/auth/login/route");
    return POST(req("/api/v1/auth/login", { method: "POST", headers: { "content-type": "application/json", ...headers }, body }));
  };

  it("rotating X-Real-IP does not escape the per-IP ceiling when proxy headers are not trusted", async () => {
    // Off Vercel without TRUST_PROXY_HEADERS the headers are ignored, so the
    // per-account failure counter applies whatever the client claims.
    let last = 0;
    for (let i = 0; i < 6; i++) last = (await login({ email: "rotate@hotel.example", password: "wrong" }, { "x-real-ip": `10.9.${i}.1` })).status;
    expect(last).toBe(429);
  });

  it("a stranger's failed attempts from another network do not lock the account out", async () => {
    process.env.TRUST_PROXY_HEADERS = "true";
    for (let i = 0; i < 6; i++) await login({ email: "victim@hotel.example", password: "wrong" }, { "x-real-ip": "10.7.0.1" });
    expect((await login({ email: "victim@hotel.example", password: "wrong" }, { "x-real-ip": "10.7.0.1" })).status).toBe(429);
    // The real user, on the hotel network, still reaches the credential check.
    expect((await login({ email: "victim@hotel.example", password: "right" }, { "x-real-ip": "10.1.1.1" })).status).toBe(401);
  });

  it("refuses a text/plain body (login CSRF) and a foreign Origin", async () => {
    const { POST } = await import("@/app/api/v1/auth/login/route");
    const plain = await POST(req("/api/v1/auth/login", { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify({ email: "a@x.com", password: "p" }) }));
    expect(plain.status).toBe(400);
    const foreign = await login({ email: "a@x.com", password: "p" }, { origin: "https://evil.example" });
    expect(foreign.status).toBe(400);
  });

  it("answers unknown emails and wrong passwords with the same message", async () => {
    const unknown = await (await login({ email: "nobody@x.com", password: "p" })).json();
    const wrong = await (await login({ email: "m@x.com", password: "p" })).json();
    expect(unknown.error.message).toBe(wrong.error.message);
  });
});

describe("rate-limit backend", () => {
  it("treats an Upstash per-command error as unavailable, not as a count of 0", async () => {
    vi.resetModules();
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example";
    process.env.UPSTASH_REDIS_REST_TOKEN = "t";
    try {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([{ error: "WRONGTYPE" }, { result: 1 }]), { status: 200 })));
      const { rateLimit } = await import("@/lib/rate-limit");
      const id = `upstash-err-${Math.random()}`;
      const results = [];
      for (let i = 0; i < 3; i++) results.push(await rateLimit(id, { windowMs: 60_000, max: 2 }));
      // Falls back to the in-memory limiter, which still enforces the limit.
      expect(results.map((r) => r.allowed)).toEqual([true, true, false]);
      expect(results[0].backend).toBe("memory");
    } finally {
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      vi.resetModules();
    }
  });
});

describe("CSRF double submit in requireAuth", () => {
  it("rejects mutating requests without or with a mismatched token, accepts a matching one", async () => {
    const tok = await accessToken({ aal: "aal1" });
    const base = sessionCookie(tok, []);
    const { requireAuth } = await import("@/lib/api-auth");
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect((await requireAuth(req("/x", { method: m, cookie: base }))).authenticated).toBe(false);
      expect((await requireAuth(req("/x", { method: m, cookie: `${base}; hospitai-csrf=a`, headers: { "X-CSRF-Token": "b" } }))).authenticated).toBe(false);
      expect((await requireAuth(req("/x", { method: m, cookie: `${base}; hospitai-csrf=`, headers: { "X-CSRF-Token": "" } }))).authenticated).toBe(false);
      expect((await requireAuth(req("/x", { method: m, cookie: `${base}; hospitai-csrf=a`, headers: { "X-CSRF-Token": "a" } }))).authenticated).toBe(true);
    }
    expect((await requireAuth(req("/x", { method: "GET", cookie: base }))).authenticated).toBe(true);
  });
});

describe("jwt-verify", () => {
  it("a forged ES256 token with an unknown kid is invalid and does not disable local verification", async () => {
    delete process.env.SUPABASE_JWT_SECRET;
    const real = await generateKeyPair("ES256");
    const jwk = { ...(await exportJWK(real.publicKey)), kid: "k1", alg: "ES256", use: "sig" };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ keys: [jwk] }), { headers: { "content-type": "application/json" } })));
    const { verifyAccessToken, resetJwksCache } = await import("@/lib/jwt-verify");
    resetJwksCache();
    const sign = (key: CryptoKey, kid: string) => new SignJWT({ role: "authenticated" }).setProtectedHeader({ alg: "ES256", kid }).setSubject(UID).setAudience("authenticated").setExpirationTime("1h").sign(key);
    const good = await sign(real.privateKey, "k1");
    expect((await verifyAccessToken(good)).ok).toBe(true);
    const attacker = await generateKeyPair("ES256");
    expect(await verifyAccessToken(await sign(attacker.privateKey, "does-not-exist"))).toEqual({ ok: false, reason: "invalid" });
    expect((await verifyAccessToken(good)).ok).toBe(true);
  });

  it("rejects a token without exp", async () => {
    const { verifyAccessToken } = await import("@/lib/jwt-verify");
    const t = await new SignJWT({ role: "authenticated" }).setProtectedHeader({ alg: "HS256" }).setSubject(UID).setAudience("authenticated").sign(new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!));
    expect(await verifyAccessToken(t)).toEqual({ ok: false, reason: "invalid" });
  });

  it("checks iss for hosted projects", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcd.supabase.co";
    try {
      const { verifyAccessToken } = await import("@/lib/jwt-verify");
      const key = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!);
      const mk = (iss: string) => new SignJWT({ role: "authenticated" }).setProtectedHeader({ alg: "HS256" }).setSubject(UID).setAudience("authenticated").setIssuer(iss).setExpirationTime("1h").sign(key);
      expect((await verifyAccessToken(await mk("https://abcd.supabase.co/auth/v1"))).ok).toBe(true);
      expect(await verifyAccessToken(await mk("https://other.supabase.co/auth/v1"))).toEqual({ ok: false, reason: "invalid" });
    } finally {
      setEnv();
    }
  });
});
