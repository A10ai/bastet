/**
 * Client-safe CSRF constants shared between server and client code.
 * This file has no "server-only" import so it can be bundled into client
 * components (e.g. CSRFTokenProvider).
 */

export const CSRF_COOKIE_NAME = "hospitai-csrf";
export const CSRF_HEADER_NAME = "X-CSRF-Token";