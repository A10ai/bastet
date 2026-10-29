// @vitest-environment node
// Regression (29 Oct 2026): GET /api/v1/auth/mfa took the factor list from the
// session cookie. After a factor was removed elsewhere the stale cookie still
// reported verification_required, and the dashboard looped
// page -> /login?step=mfa -> /dashboard until the token refreshed. The route
// must report what the auth server says about the user, never the cookie.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { setEnv, req, accessToken, sessionCookie, VERIFIED_TOTP, UID, authServerFetch } from "./helpers";
import { createFakeSupabase } from "../__mocks__/supabase-fake";

let db: Record<string, Record<string, unknown>[]>;
let serverFactors: unknown[] = [];
let cookieAal: { currentLevel: string; nextLevel: string } = { currentLevel: "aal1", nextLevel: "aal1" };

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => createFakeSupabase(db as never) }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () =>
    createFakeSupabase(db as never, {
      // What the auth server returns for this request.
      user: { id: UID, email: "m@x.com", factors: serverFactors } as never,
      // currentLevel comes from the verified token; nextLevel is what the
      // cookie-cached user object would claim.
      aal: cookieAal as never,
    }),
}));

beforeEach(async () => {
  setEnv();
  db = { staff: [{ id: "s1", auth_user_id: UID, role: "manager", is_active: true, property_id: "A", email: "m@x.com" }] };
  const { resetMfaCache } = await import("@/lib/mfa");
  resetMfaCache();
});

async function status(aal: "aal1" | "aal2", cookieFactors: unknown[]) {
  vi.stubGlobal("fetch", vi.fn(authServerFetch(serverFactors)));
  const tok = await accessToken({ aal });
  const { GET } = await import("@/app/api/v1/auth/mfa/route");
  const res = await GET(req("/api/v1/auth/mfa", { cookie: sessionCookie(tok, cookieFactors) }));
  expect(res.status).toBe(200);
  return (await res.json()).data as { enrolled: boolean; verification_required: boolean; next_level: string; factors: { id: string }[] };
}

describe("GET /api/v1/auth/mfa reports the auth server's factors, not the cookie's", () => {
  it("a cookie still listing a removed factor does not demand verification", async () => {
    serverFactors = [];
    cookieAal = { currentLevel: "aal1", nextLevel: "aal2" };
    const data = await status("aal1", [VERIFIED_TOTP]);
    expect(data.enrolled).toBe(false);
    expect(data.factors).toEqual([]);
    expect(data.next_level).toBe("aal1");
    expect(data.verification_required).toBe(false);
  });

  it("a cookie with the factor list stripped still demands verification", async () => {
    serverFactors = [VERIFIED_TOTP];
    cookieAal = { currentLevel: "aal1", nextLevel: "aal1" };
    const data = await status("aal1", []);
    expect(data.enrolled).toBe(true);
    expect(data.factors.map((f) => f.id)).toEqual(["f1"]);
    expect(data.verification_required).toBe(true);
  });

  it("an aal2 session with an enrolled factor is settled", async () => {
    serverFactors = [VERIFIED_TOTP];
    cookieAal = { currentLevel: "aal2", nextLevel: "aal2" };
    const data = await status("aal2", [VERIFIED_TOTP]);
    expect(data.enrolled).toBe(true);
    expect(data.verification_required).toBe(false);
  });
});
