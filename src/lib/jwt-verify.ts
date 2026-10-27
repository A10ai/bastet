import "server-only";
import { createRemoteJWKSet, decodeProtectedHeader, errors, jwtVerify, type JWTVerifyGetKey } from "jose";
import { logger } from "@/lib/logger";

/**
 * Local verification of Supabase access tokens.
 *
 * Why: `auth.getUser()` makes a network round trip to the auth server (and the
 * auth server a database query) on every API request. Under load that is the
 * first thing to fall over (measured: the local auth container exhausted its
 * connections at ~200 req/s) and in production it adds 50-100 ms to each call.
 * A JWT can be checked locally in microseconds.
 *
 * Key material, in order:
 *   1. SUPABASE_JWT_SECRET (HS256): legacy projects and the local CLI stack.
 *   2. The project's JWKS (ES256/RS256): projects that migrated to asymmetric
 *      signing keys. Cached by jose, refreshed on unknown kid, backed off on
 *      network failure.
 *   3. Neither available: the caller falls back to `getUser()`.
 *
 * Trade-off: a locally verified token is accepted until it expires (one hour
 * by default) even if the session was revoked or the user banned in between.
 * That is the same window Supabase's own `getClaims()` accepts; sign-out
 * clears the cookie, and admin "disable user" should be paired with a short
 * JWT expiry on the project if instant revocation matters.
 */

export interface VerifiedClaims {
  sub: string;
  email?: string;
  role?: string;
  aal?: string;
  session_id?: string;
  exp?: number;
}

export type VerifyResult =
  | { ok: true; claims: VerifiedClaims }
  | { ok: false; reason: "invalid" | "unavailable" };

const SYMMETRIC = new Set(["HS256", "HS384", "HS512"]);
const ASYMMETRIC = new Set(["ES256", "RS256", "ES384", "RS384", "ES512", "RS512"]);
const AUDIENCE = "authenticated";

let jwks: JWTVerifyGetKey | null = null;
let jwksBackoffUntil = 0;

/**
 * Expected `iss`. SUPABASE_JWT_ISSUER wins; otherwise hosted projects
 * (*.supabase.co) issue `<project url>/auth/v1`. Self-hosted and the local
 * CLI stack are not checked by default, because the issuer there often names
 * a different host (127.0.0.1 vs localhost) than the URL the app uses.
 */
function expectedIssuer(): string | undefined {
  if (process.env.SUPABASE_JWT_ISSUER) return process.env.SUPABASE_JWT_ISSUER;
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
    return url.hostname.endsWith(".supabase.co") ? `${url.origin}/auth/v1` : undefined;
  } catch {
    return undefined;
  }
}

function verifyOptions(alg: string) {
  return {
    algorithms: [alg],
    audience: AUDIENCE,
    issuer: expectedIssuer(),
    // Supabase always sets exp; a token without one would never expire.
    requiredClaims: ["exp", "sub"],
    clockTolerance: 30,
  };
}

function secretKey(): Uint8Array | null {
  const raw = process.env.SUPABASE_JWT_SECRET;
  return raw && raw.length >= 32 ? new TextEncoder().encode(raw) : null;
}

function remoteKeys(): JWTVerifyGetKey | null {
  if (Date.now() < jwksBackoffUntil) return null;
  if (!jwks) {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!base) return null;
    jwks = createRemoteJWKSet(new URL(`${base}/auth/v1/.well-known/jwks.json`), {
      cooldownDuration: 30_000,
      cacheMaxAge: 10 * 60_000,
      timeoutDuration: 3_000,
    });
  }
  return jwks;
}

/** Test hook: forget the cached JWKS and backoff. */
export function resetJwksCache(): void {
  jwks = null;
  jwksBackoffUntil = 0;
}

function toClaims(payload: Record<string, unknown>): VerifiedClaims | null {
  if (typeof payload.sub !== "string" || !payload.sub) return null;
  if (payload.role !== AUDIENCE) return null;
  return {
    sub: payload.sub,
    email: typeof payload.email === "string" ? payload.email : undefined,
    role: payload.role,
    aal: typeof payload.aal === "string" ? payload.aal : undefined,
    session_id: typeof payload.session_id === "string" ? payload.session_id : undefined,
    exp: typeof payload.exp === "number" ? payload.exp : undefined,
  };
}

export async function verifyAccessToken(token: string): Promise<VerifyResult> {
  let alg: string | undefined;
  try {
    alg = decodeProtectedHeader(token).alg;
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (!alg) return { ok: false, reason: "invalid" };

  if (SYMMETRIC.has(alg)) {
    const key = secretKey();
    if (!key) return { ok: false, reason: "unavailable" };
    try {
      const { payload } = await jwtVerify(token, key, verifyOptions(alg));
      const claims = toClaims(payload as Record<string, unknown>);
      return claims ? { ok: true, claims } : { ok: false, reason: "invalid" };
    } catch {
      return { ok: false, reason: "invalid" };
    }
  }

  if (ASYMMETRIC.has(alg)) {
    const keys = remoteKeys();
    if (!keys) return { ok: false, reason: "unavailable" };
    try {
      const { payload } = await jwtVerify(token, keys, verifyOptions(alg));
      const claims = toClaims(payload as Record<string, unknown>);
      return claims ? { ok: true, claims } : { ok: false, reason: "invalid" };
    } catch (err) {
      // Signature, expiry, audience, or a key id the (freshly refetched) JWKS
      // does not contain: the token is bad. Treating an unknown kid as "keys
      // unavailable" let one forged token switch off local verification for
      // every request for 60 s. Only fetch failures fall back to the auth server.
      if (
        err instanceof errors.JWTExpired ||
        err instanceof errors.JWSSignatureVerificationFailed ||
        err instanceof errors.JWTClaimValidationFailed ||
        err instanceof errors.JWSInvalid ||
        err instanceof errors.JWTInvalid ||
        err instanceof errors.JWKSNoMatchingKey ||
        err instanceof errors.JWKSMultipleMatchingKeys
      ) {
        return { ok: false, reason: "invalid" };
      }
      jwksBackoffUntil = Date.now() + 60_000;
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[jwt-verify] JWKS unavailable, falling back to auth server for 60s");
      return { ok: false, reason: "unavailable" };
    }
  }

  // "none" and anything exotic are never accepted.
  return { ok: false, reason: "invalid" };
}
