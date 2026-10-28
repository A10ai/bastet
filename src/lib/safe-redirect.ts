/**
 * Validate a post-login `?redirect=` target. Only same-origin absolute paths
 * are allowed: "/dashboard/bookings" passes; "https://evil.example",
 * "//evil.example", "/\\evil.example", "javascript:..." and anything with
 * control characters fall back to `fallback`. The router does a full-page
 * navigation for external URLs, so an unchecked value is an open redirect
 * straight after a real sign-in (Oct 2026 deep test).
 */
export function safeRedirectPath(raw: string | null | undefined, fallback = "/dashboard"): string {
  if (!raw || raw.length > 2048) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return fallback;
  try {
    const base = "http://same-origin.invalid";
    const url = new URL(raw, base);
    if (url.origin !== base) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
