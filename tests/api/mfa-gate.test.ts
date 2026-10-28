// @vitest-environment node
// Regression: the second factor used to be decided from `user.factors` in the
// session cookie, which the client controls (Oct 2026 deep test, H2).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { setEnv, accessToken, sessionCookie, VERIFIED_TOTP, req, UID, authServerFetch } from "./helpers";

let staffRole = "manager";
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = () => b;
      b.single = async () => ({ data: { id: "staff-1", role: staffRole, is_active: true, property_id: "prop-A" }, error: null });
      return b;
    },
  }),
}));

beforeEach(async () => {
  setEnv();
  staffRole = "manager";
  const { resetMfaCache } = await import("@/lib/mfa");
  resetMfaCache();
});

describe("requireRole MFA gate", () => {
  it("enrolled manager on an aal1 session is refused with MFA_REQUIRED", async () => {
    vi.stubGlobal("fetch", vi.fn(authServerFetch([VERIFIED_TOTP])));
    const { requireRole, ROLES } = await import("@/lib/api-auth");
    const tok = await accessToken({ aal: "aal1" });
    const r = await requireRole(req("/api/v1/finance/summary", { cookie: sessionCookie(tok, [VERIFIED_TOTP]) }), ROLES.MANAGEMENT);
    expect(r.authenticated).toBe(false);
    expect(await r.error!.json()).toMatchObject({ error: { code: "MFA_REQUIRED" } });
  });

  it("stripping user.factors from the cookie no longer skips the second factor", async () => {
    vi.stubGlobal("fetch", vi.fn(authServerFetch([VERIFIED_TOTP])));
    const { requireRole, ROLES } = await import("@/lib/api-auth");
    const tok = await accessToken({ aal: "aal1" });
    const r = await requireRole(req("/api/v1/finance/summary", { cookie: sessionCookie(tok, []) }), ROLES.MANAGEMENT);
    expect(r.authenticated).toBe(false);
    expect(await r.error!.json()).toMatchObject({ error: { code: "MFA_REQUIRED" } });
  });

  it("a manager who never enrolled passes on aal1", async () => {
    vi.stubGlobal("fetch", vi.fn(authServerFetch([])));
    const { requireRole, ROLES } = await import("@/lib/api-auth");
    const tok = await accessToken({ aal: "aal1" });
    const r = await requireRole(req("/api/v1/finance/summary", { cookie: sessionCookie(tok, [VERIFIED_TOTP]) }), ROLES.MANAGEMENT);
    expect(r).toMatchObject({ authenticated: true, userId: UID, role: "manager", propertyId: "prop-A" });
  });

  it("an aal2 token passes without asking the auth server", async () => {
    const fetchMock = vi.fn(async () => { throw new Error("no network expected"); });
    vi.stubGlobal("fetch", fetchMock);
    const { requireRole, ROLES } = await import("@/lib/api-auth");
    const tok = await accessToken({ aal: "aal2" });
    const r = await requireRole(req("/api/v1/finance/summary", { cookie: sessionCookie(tok, []) }), ROLES.MANAGEMENT);
    expect(r.authenticated).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed (503) when the factor list cannot be read", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("auth server down"); }));
    const { requireRole, ROLES } = await import("@/lib/api-auth");
    const tok = await accessToken({ aal: "aal1" });
    const r = await requireRole(req("/api/v1/finance/summary", { cookie: sessionCookie(tok, []) }), ROLES.MANAGEMENT);
    expect(r.authenticated).toBe(false);
    expect(r.error!.status).toBe(503);
  });

  it("owner/admin without a factor still get MFA_ENROLMENT_REQUIRED", async () => {
    staffRole = "admin";
    vi.stubGlobal("fetch", vi.fn(authServerFetch([])));
    const { requireRole, ROLES } = await import("@/lib/api-auth");
    const tok = await accessToken({ aal: "aal1" });
    const r = await requireRole(req("/api/v1/audit", { cookie: sessionCookie(tok, []) }), ROLES.ADMIN);
    expect(await r.error!.json()).toMatchObject({ error: { code: "MFA_ENROLMENT_REQUIRED" } });
  });
});

describe("middleware MFA redirect", () => {
  beforeEach(() => {
    // Auth server truth: the user HAS a verified TOTP factor.
    vi.stubGlobal("fetch", vi.fn(authServerFetch([VERIFIED_TOTP])));
  });

  it("redirects an aal1 session of an enrolled user to the MFA step", async () => {
    const { middleware } = await import("@/middleware");
    const tok = await accessToken({ aal: "aal1" });
    const res = await middleware(req("http://app.local/dashboard/finance", { cookie: sessionCookie(tok, [VERIFIED_TOTP]) }));
    expect(res.headers.get("location")).toContain("step=mfa");
  });

  it("still redirects when the factors were stripped from the cookie", async () => {
    const { middleware } = await import("@/middleware");
    const tok = await accessToken({ aal: "aal1" });
    const res = await middleware(req("http://app.local/dashboard/finance", { cookie: sessionCookie(tok, []) }));
    expect(res.headers.get("location")).toContain("step=mfa");
  });

  it("serves the dashboard to an aal2 session", async () => {
    const { middleware } = await import("@/middleware");
    const tok = await accessToken({ aal: "aal2" });
    const res = await middleware(req("http://app.local/dashboard/finance", { cookie: sessionCookie(tok, [VERIFIED_TOTP]) }));
    expect(res.headers.get("location")).toBeNull();
  });

  it("runs on /dashboard paths that end in a static-file extension", async () => {
    const { config } = await import("@/middleware");
    expect(config.matcher).toContain("/dashboard/:path*");
    const { middleware } = await import("@/middleware");
    const res = await middleware(req("http://app.local/dashboard/bookings/x.png"));
    expect(res.headers.get("location")).toContain("/login");
  });
});
