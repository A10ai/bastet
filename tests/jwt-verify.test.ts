// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SignJWT, exportJWK, generateKeyPair } from "jose";

const SECRET = "a-local-test-secret-that-is-at-least-32-chars";
const sub = "00000000-0000-0000-0000-000000000001";

async function hs(claims: Record<string, unknown>, secret = SECRET, exp = "1h") {
  return new SignJWT({ role: "authenticated", email: "o@x.com", ...claims })
    .setProtectedHeader({ alg: "HS256" }).setSubject(sub).setAudience("authenticated").setIssuer("http://sb.local/auth/v1").setIssuedAt().setExpirationTime(exp)
    .sign(new TextEncoder().encode(secret));
}

beforeEach(async () => {
  process.env.SUPABASE_JWT_SECRET = SECRET;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://sb.local";
  const { resetJwksCache } = await import("@/lib/jwt-verify");
  resetJwksCache();
});
afterEach(() => vi.unstubAllGlobals());

describe("verifyAccessToken (HS256, SUPABASE_JWT_SECRET)", () => {
  it("accepts a token signed with the project secret and returns its claims", async () => {
    const { verifyAccessToken } = await import("@/lib/jwt-verify");
    const r = await verifyAccessToken(await hs({ aal: "aal2", session_id: "s1" }));
    expect(r).toMatchObject({ ok: true, claims: { sub, email: "o@x.com", aal: "aal2", session_id: "s1" } });
  });

  it("rejects wrong secret, expiry, wrong audience, wrong role, alg none and garbage", async () => {
    const { verifyAccessToken } = await import("@/lib/jwt-verify");
    expect(await verifyAccessToken(await hs({}, "another-secret-that-is-also-long-enough-ok"))).toEqual({ ok: false, reason: "invalid" });
    expect(await verifyAccessToken(await hs({}, SECRET, "-2h"))).toEqual({ ok: false, reason: "invalid" });
    const wrongAud = await new SignJWT({ role: "authenticated" }).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setAudience("other").setIssuer("http://sb.local/auth/v1").setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));
    expect(await verifyAccessToken(wrongAud)).toEqual({ ok: false, reason: "invalid" });
    expect(await verifyAccessToken(await hs({ role: "anon" }))).toEqual({ ok: false, reason: "invalid" });
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
    expect(await verifyAccessToken(`${b64({ alg: "none" })}.${b64({ sub, role: "authenticated", aud: "authenticated", exp: 9999999999 })}.`)).toEqual({ ok: false, reason: "invalid" });
    expect(await verifyAccessToken("forged.jwt.token")).toEqual({ ok: false, reason: "invalid" });
    expect(await verifyAccessToken("")).toEqual({ ok: false, reason: "invalid" });
  });

  it("reports 'unavailable' for HS256 when no secret is configured so the caller falls back to the auth server", async () => {
    const token = await hs({});
    delete process.env.SUPABASE_JWT_SECRET;
    const { verifyAccessToken } = await import("@/lib/jwt-verify");
    expect(await verifyAccessToken(token)).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("verifyAccessToken (ES256, project JWKS)", () => {
  it("verifies against the project's JWKS and rejects a token from another key", async () => {
    const { publicKey, privateKey } = await generateKeyPair("ES256");
    const other = await generateKeyPair("ES256");
    const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "ES256", use: "sig" };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ keys: [jwk] }), { status: 200, headers: { "content-type": "application/json" } })));
    const sign = (key: CryptoKey, kid = "k1") => new SignJWT({ role: "authenticated" }).setProtectedHeader({ alg: "ES256", kid }).setSubject(sub).setAudience("authenticated").setIssuer("http://sb.local/auth/v1").setExpirationTime("1h").sign(key);
    const { verifyAccessToken } = await import("@/lib/jwt-verify");
    expect(await verifyAccessToken(await sign(privateKey))).toMatchObject({ ok: true, claims: { sub } });
    expect(await verifyAccessToken(await sign(other.privateKey))).toEqual({ ok: false, reason: "invalid" });
  });

  it("falls back (unavailable) when the JWKS endpoint cannot be reached, and backs off", async () => {
    const { privateKey } = await generateKeyPair("ES256");
    const fetchMock = vi.fn(async () => { throw new Error("ECONNREFUSED"); });
    vi.stubGlobal("fetch", fetchMock);
    const token = await new SignJWT({ role: "authenticated" }).setProtectedHeader({ alg: "ES256", kid: "k9" }).setSubject(sub).setAudience("authenticated").setIssuer("http://sb.local/auth/v1").setExpirationTime("1h").sign(privateKey);
    const { verifyAccessToken } = await import("@/lib/jwt-verify");
    expect(await verifyAccessToken(token)).toEqual({ ok: false, reason: "unavailable" });
    expect(await verifyAccessToken(token)).toEqual({ ok: false, reason: "unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
