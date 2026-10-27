import { SignJWT } from "jose";
import { NextRequest } from "next/server";

/**
 * Shared fixtures for HTTP-layer tests: real signed access tokens, the
 * session cookie exactly as @supabase/ssr writes it, and a two-tenant fake
 * database. Only Postgres is faked; requireRole, middleware and route
 * handlers run for real.
 */
export const SECRET = "a-local-test-secret-that-is-at-least-32-chars";
export const SB_URL = "http://sbproj.supabase.local";
export const COOKIE = "sb-sbproj-auth-token";
export const UID = "00000000-0000-0000-0000-0000000000aa";

export function setEnv() {
  process.env.SUPABASE_JWT_SECRET = SECRET;
  process.env.NEXT_PUBLIC_SUPABASE_URL = SB_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
}

export async function accessToken(claims: Record<string, unknown> = {}, sub = UID) {
  return new SignJWT({ role: "authenticated", email: "m@x.com", aal: "aal1", session_id: "s1", ...claims })
    .setProtectedHeader({ alg: "HS256" }).setSubject(sub).setAudience("authenticated").setIssuedAt().setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}

/** Supabase SSR session cookie (base64url JSON); `factors` is client-controlled. */
export function sessionCookie(token: string, factors: unknown[]) {
  const session = {
    access_token: token,
    refresh_token: "r",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: UID, aud: "authenticated", role: "authenticated", email: "m@x.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z", factors },
  };
  return `${COOKIE}=base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
}

export const VERIFIED_TOTP = { id: "f1", factor_type: "totp", status: "verified", friendly_name: "app", created_at: "", updated_at: "" };

/** What the auth server returns from GET /auth/v1/user. */
export function authUserJson(factors: unknown[]) {
  return { id: UID, aud: "authenticated", role: "authenticated", email: "m@x.com", app_metadata: {}, user_metadata: {}, created_at: "", factors };
}

/** fetch stub standing in for the auth server; anything else is unexpected. */
export function authServerFetch(factors: unknown[]) {
  return async (u: string | URL | Request) => {
    const url = String(u instanceof Request ? u.url : u);
    if (url.startsWith(`${SB_URL}/auth/v1/user`)) {
      return new Response(JSON.stringify(authUserJson(factors)), { headers: { "content-type": "application/json" } });
    }
    throw new Error("unexpected fetch " + url);
  };
}

export function req(url: string, init: { method?: string; cookie?: string; headers?: Record<string, string>; body?: unknown } = {}) {
  const headers: Record<string, string> = { ...(init.headers || {}) };
  if (init.cookie) headers.cookie = init.cookie;
  return new NextRequest(new URL(url, "http://app.local"), {
    method: init.method || "GET",
    headers,
    body: init.body === undefined ? undefined : typeof init.body === "string" ? init.body : JSON.stringify(init.body),
  });
}

export const A = "a0000000-0000-4000-8000-00000000000a";
export const B = "b0000000-0000-4000-8000-00000000000b";

/** Two-tenant fake DB: admin of A (the caller), owner and receptionist of B. */
export function tenantDb() {
  return {
    staff: [
      { id: "staff-adminA", auth_user_id: UID, role: "admin", is_active: true, property_id: A, email: "adminA@x" },
      { id: "staff-recepA", auth_user_id: "uid-recepA", role: "receptionist", is_active: true, property_id: A, email: "recepA@x" },
      { id: "staff-admin2A", auth_user_id: "uid-admin2A", role: "admin", is_active: true, property_id: A, email: "admin2A@x" },
      { id: "staff-ownerB", auth_user_id: "uid-ownerB", role: "owner", is_active: true, property_id: B, email: "ownerB@x" },
      { id: "staff-recepB", auth_user_id: "uid-recepB", role: "receptionist", is_active: true, property_id: B, email: "recepB@x" },
    ],
    staff_properties: [],
    guests: [
      { id: "guest-A1", property_id: A, first_name: "Ann", last_name: "TenantA", passport_number: "PA1" },
      { id: "guest-B1", property_id: B, first_name: "Bob", last_name: "TenantB", passport_number: "P123" },
    ],
    properties: [
      { id: A, name: "A", status: "active", timezone: "Africa/Cairo" },
      { id: B, name: "B", status: "active", timezone: "Africa/Cairo" },
    ],
    daily_closes: [
      { id: "dc-A", property_id: A, business_date: "2026-10-25", revenue_gbp: 111 },
      { id: "dc-B", property_id: B, business_date: "2026-10-26", revenue_gbp: 12345 },
    ],
    booking_channels: [{ id: "ch1", name: "Booking.com", api_connection: { api_key: "sk_live_secret" } }],
    audit_log: [],
  } as Record<string, Record<string, unknown>[]>;
}

/** Signed aal2 session for the admin of A plus a matching CSRF pair. */
export async function adminCookie() {
  const tok = await accessToken({ aal: "aal2" });
  return `${sessionCookie(tok, [VERIFIED_TOTP])}; hospitai-csrf=csrf123`;
}
export const CSRF = { "X-CSRF-Token": "csrf123", "content-type": "application/json" };
