/**
 * Client-safe CSRF constants shared between server and client code.
 * This file has no "server-only" import so it can be bundled into client
 * components (e.g. CSRFTokenProvider).
 *
 * On https deployments the cookie uses the __Host- prefix: the browser then
 * refuses it unless it is Secure, Path=/ and has no Domain, which stops a
 * sibling subdomain from planting ("tossing") a CSRF cookie of its own.
 */
export const CSRF_SECURE = (process.env.NEXT_PUBLIC_APP_URL || "").startsWith("https://");
export const CSRF_COOKIE_NAME = CSRF_SECURE ? "__Host-hospitai-csrf" : "hospitai-csrf";
export const CSRF_HEADER_NAME = "X-CSRF-Token";
