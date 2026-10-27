import type { CookieOptionsWithName } from "@supabase/ssr";

/**
 * Options for the Supabase session cookies, shared by every client that
 * writes them (middleware, route handlers, server components, browser).
 *
 * - secure: on https deployments the cookie never travels over plain http.
 * - maxAge: 14 days instead of @supabase/ssr's 400. The cookie is rewritten on
 *   every token refresh, so active staff stay signed in; a front-desk PC left
 *   signed in stops carrying a usable refresh token after two idle weeks.
 * - httpOnly stays off: the browser client reads the session from this cookie
 *   (realtime, client-side queries). XSS exposure is contained by the nonce CSP.
 */
export function sessionCookieOptions(): CookieOptionsWithName {
  const https =
    (process.env.NEXT_PUBLIC_APP_URL || "").startsWith("https://") ||
    (typeof window !== "undefined" && window.location?.protocol === "https:");
  return {
    path: "/",
    sameSite: "lax",
    secure: https,
    maxAge: 14 * 24 * 60 * 60,
  };
}
