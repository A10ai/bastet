"use client";

import { CSRF_HEADER_NAME } from "@/lib/csrf-constants";

/**
 * Same-origin CSRF for the browser, installed once by CSRFTokenProvider.
 *
 * The server uses a double-submit cookie: every mutating request must carry
 * the X-CSRF-Token header matching the httpOnly `hospitai-csrf` cookie.
 * Thirty-plus screens call `fetch` directly; rather than editing each one
 * (and forgetting the next), `window.fetch` is wrapped so that any same-origin
 * POST/PUT/PATCH/DELETE without the header gets the current token. A request
 * that still comes back 403 CSRF_TOKEN_INVALID (token rotated at login on
 * another tab) refreshes the token once and retries.
 */

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
let token: string | null = null;
let pending: Promise<string | null> | null = null;
let installed = false;

export function setCsrfToken(value: string | null): void {
  token = value;
}

export function getCsrfToken(): string | null {
  return token;
}

async function refreshToken(originalFetch: typeof fetch): Promise<string | null> {
  if (!pending) {
    pending = originalFetch("/api/v1/csrf", { credentials: "same-origin" })
      .then(async (res) => (res.ok ? ((await res.json()) as { data?: { token?: string } }).data?.token ?? null : null))
      .catch(() => null)
      .then((t) => {
        token = t;
        pending = null;
        return t;
      });
  }
  return pending;
}

function isSameOrigin(input: RequestInfo | URL): boolean {
  if (typeof window === "undefined") return false;
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith("/")) return true;
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

export function installCsrfFetch(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (!MUTATING.has(method) || !isSameOrigin(input)) return originalFetch(input, init);

    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    if (headers.has(CSRF_HEADER_NAME)) return originalFetch(input, init);

    const current = token ?? (await refreshToken(originalFetch));
    if (current) headers.set(CSRF_HEADER_NAME, current);
    const withHeader: RequestInit = { ...init, headers };

    const res = await originalFetch(input, withHeader);
    if (res.status !== 403) return res;

    // Retry once with a fresh token if the server says the token was wrong.
    const clone = res.clone();
    let code = "";
    try {
      code = ((await clone.json()) as { error?: { code?: string } })?.error?.code ?? "";
    } catch {
      /* not JSON */
    }
    if (code !== "CSRF_TOKEN_INVALID") return res;
    const fresh = await refreshToken(originalFetch);
    if (!fresh || fresh === current) return res;
    headers.set(CSRF_HEADER_NAME, fresh);
    return originalFetch(input, { ...init, headers });
  };
}
