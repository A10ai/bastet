import "server-only";
import type { NextResponse } from "next/server";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "@/lib/csrf-constants";

export { CSRF_COOKIE_NAME, CSRF_HEADER_NAME };

/**
 * CSRF protection utilities for HospitAI.
 *
 * Strategy: double-submit cookie.
 * - A random token is stored in an httpOnly cookie named `hospitai-csrf`.
 * - Mutating requests (POST/PUT/DELETE/PATCH) must send the same token in the
 *   `X-CSRF-Token` request header.
 * - The server validates that the header value matches the cookie value.
 *
 * Because the cookie is httpOnly, JavaScript on the page cannot read it, so a
 * cross-origin attacker cannot learn the token to forge the header. Legitimate
 * client code obtains the token from the GET /api/v1/csrf endpoint (which
 * returns it in the response body while also setting the cookie) and then
 * echoes it back on every mutation.
 */

/** Cookie options shared between the set helper and the CSRF endpoint. */
export const CSRF_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
} as const;

/**
 * Generate a cryptographically random CSRF token.
 * Uses `crypto.randomUUID()` when available, falling back to
 * `crypto.randomBytes(16).toString("hex")` via a dynamic import.
 */
export async function generateCsrfToken(): Promise<string> {
  const cryptoObj = globalThis.crypto as Crypto | undefined;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return cryptoObj.randomUUID();
  }
  // Fallback for runtimes without globalThis.crypto.randomUUID (older Node).
  const { randomBytes } = await import("node:crypto");
  return randomBytes(16).toString("hex");
}

/**
 * Set the CSRF cookie on a NextResponse (used by the GET /api/v1/csrf endpoint).
 * Returns the same response for chaining.
 */
export function setCsrfCookie(
  response: NextResponse,
  token: string
): NextResponse {
  response.cookies.set(CSRF_COOKIE_NAME, token, CSRF_COOKIE_OPTIONS);
  return response;
}

/**
 * Constant-time string comparison to avoid timing-attack token guessing.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Validate the CSRF token on a mutating request.
 *
 * Compares the `X-CSRF-Token` header against the `hospitai-csrf` cookie value.
 * Returns true if both are present and equal; false otherwise.
 *
 * Only call this for POST/PUT/DELETE/PATCH requests — never for GET.
 */
export function validateCsrfToken(
  request: Request
): boolean {
  const cookieToken = request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${CSRF_COOKIE_NAME}=`))
    ?.split("=")
    .slice(1)
    .join("=");

  const headerToken = request.headers.get(CSRF_HEADER_NAME);

  if (!cookieToken || !headerToken) return false;
  return safeEqual(cookieToken, headerToken);
}

/**
 * Whether a given request method should be subject to CSRF validation.
 */
export function isMutatingMethod(method: string): boolean {
  const m = method.toUpperCase();
  return m === "POST" || m === "PUT" || m === "DELETE" || m === "PATCH";
}