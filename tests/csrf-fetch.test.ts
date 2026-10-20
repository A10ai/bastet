import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Browser CSRF wrapper: every same-origin mutation gets the X-CSRF-Token
 * header; reads and cross-origin calls are untouched; a stale token is
 * refreshed once and the call retried.
 */
describe("installCsrfFetch", () => {
  let calls: { url: string; method: string; csrf: string | null }[];
  let mode: "ok" | "stale-then-ok";
  let tokenServed: string;

  beforeEach(async () => {
    vi.resetModules();
    calls = [];
    mode = "ok";
    tokenServed = "tok-1";
    window.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = (init?.method || "GET").toUpperCase();
      const csrf = new Headers(init?.headers).get("X-CSRF-Token");
      calls.push({ url, method, csrf });
      if (url.endsWith("/api/v1/csrf")) return new Response(JSON.stringify({ data: { token: tokenServed } }), { status: 200 });
      if (mode === "stale-then-ok" && csrf === "stale") return new Response(JSON.stringify({ error: { code: "CSRF_TOKEN_INVALID" } }), { status: 403 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;
    const mod = await import("@/lib/csrf-fetch");
    mod.installCsrfFetch();
    mod.setCsrfToken(null);
  });

  it("adds the header to same-origin POSTs, fetching the token first when none is known", async () => {
    const res = await fetch("/api/v1/bookings", { method: "POST", body: "{}" });
    expect(res.status).toBe(200);
    expect(calls.map((c) => c.url)).toEqual(["/api/v1/csrf", "/api/v1/bookings"]);
    expect(calls[1].csrf).toBe("tok-1");
  });

  it("leaves GETs, cross-origin calls and requests that already carry the header alone", async () => {
    const { setCsrfToken } = await import("@/lib/csrf-fetch");
    setCsrfToken("tok-1");
    await fetch("/api/v1/bookings");
    await fetch("https://api.example.com/hook", { method: "POST" });
    await fetch("/api/v1/bookings", { method: "POST", headers: { "X-CSRF-Token": "mine" } });
    expect(calls.map((c) => c.csrf)).toEqual([null, null, "mine"]);
  });

  it("refreshes a rejected token once and retries", async () => {
    const { setCsrfToken } = await import("@/lib/csrf-fetch");
    setCsrfToken("stale");
    mode = "stale-then-ok";
    tokenServed = "tok-2";
    const res = await fetch("/api/v1/bookings", { method: "POST", body: "{}" });
    expect(res.status).toBe(200);
    expect(calls.map((c) => `${c.method} ${c.url} ${c.csrf}`)).toEqual([
      "POST /api/v1/bookings stale",
      "GET /api/v1/csrf null",
      "POST /api/v1/bookings tok-2",
    ]);
  });
});
