import "server-only";
import { logger } from "@/lib/logger";

/**
 * Rate limiter with two backends:
 *
 *  - Upstash Redis (REST API) when UPSTASH_REDIS_REST_URL and
 *    UPSTASH_REDIS_REST_TOKEN are set. Shared across every serverless
 *    instance, so the limit is real on Vercel.
 *  - In-memory Map otherwise (single-process deployments, local dev, tests).
 *    On a multi-instance platform this only limits per instance; the startup
 *    log says which backend is active so nobody mistakes one for the other.
 *
 * Usage:
 *   const rl = await rateLimit(`login:${ip}`, RATE_LIMITS.LOGIN);
 *   if (!rl.allowed) return rateLimitResponse(rl);
 */

export interface RateLimitOptions {
  /** Time window in milliseconds */
  windowMs: number;
  /** Maximum requests in the window */
  max: number;
  /** Optional message for the error response */
  message?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  backend: "upstash" | "memory";
}

// ---------------------------------------------------------------------------
// In-memory backend
// ---------------------------------------------------------------------------
interface RateLimitEntry {
  count: number;
  resetAt: number;
}
const store = new Map<string, RateLimitEntry>();
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const key of Array.from(store.keys())) {
    const entry = store.get(key);
    if (entry && entry.resetAt < now) store.delete(key);
  }
}

function memoryLimit(key: string, options: RateLimitOptions): RateLimitResult {
  cleanup();
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + options.windowMs });
    return { allowed: true, remaining: options.max - 1, resetAt: now + options.windowMs, backend: "memory" };
  }
  if (entry.count >= options.max) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt, backend: "memory" };
  }
  entry.count++;
  return { allowed: true, remaining: options.max - entry.count, resetAt: entry.resetAt, backend: "memory" };
}

// ---------------------------------------------------------------------------
// Upstash backend (fixed window: INCR + PEXPIRE on first hit, via pipeline)
// ---------------------------------------------------------------------------
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
export const RATE_LIMIT_BACKEND: "upstash" | "memory" = UPSTASH_URL && UPSTASH_TOKEN ? "upstash" : "memory";
let warnedFallback = false;

async function upstashLimit(key: string, options: RateLimitOptions): Promise<RateLimitResult | null> {
  try {
    const windowId = Math.floor(Date.now() / options.windowMs);
    const redisKey = `rl:${key}:${windowId}`;
    const res = await fetch(`${UPSTASH_URL}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["INCR", redisKey],
        ["PEXPIRE", redisKey, String(options.windowMs), "NX"],
      ]),
      // A slow limiter must never take the login path down with it.
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: number; error?: string }[];
    // A per-command error (wrong type, OOM, ...) comes back with HTTP 200;
    // reading it as a count of 0 would let every request through.
    const first = data?.[0];
    if (!first || first.error || typeof first.result !== "number") return null;
    const count = first.result;
    const resetAt = (windowId + 1) * options.windowMs;
    return {
      allowed: count <= options.max,
      remaining: Math.max(0, options.max - count),
      resetAt,
      backend: "upstash",
    };
  } catch (err) {
    logger.warn({ err: String(err) }, "[rate-limit] Upstash unreachable, falling back to memory for this request");
    return null;
  }
}

/**
 * Check the rate limit for an identifier (IP, user id, route + user, ...).
 */
export async function rateLimit(identifier: string, options: RateLimitOptions): Promise<RateLimitResult> {
  if (RATE_LIMIT_BACKEND === "upstash") {
    const r = await upstashLimit(identifier, options);
    if (r) return r;
  } else if (!warnedFallback && process.env.NODE_ENV === "production" && process.env.VERCEL) {
    warnedFallback = true;
    logger.warn("[rate-limit] UPSTASH_REDIS_REST_URL not set: limits are per-instance only on Vercel");
  }
  return memoryLimit(identifier, options);
}

/**
 * Standard 429 response with Retry-After.
 */
export function rateLimitResponse(result: RateLimitResult, message = "Too many requests. Please try again later.") {
  const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  return new Response(JSON.stringify({ error: { code: "RATE_LIMITED", message } }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(retryAfter),
      "X-RateLimit-Remaining": "0",
    },
  });
}

// ---------------------------------------------------------------------------
// Failure counters: checked before an action, incremented only when it fails.
// Used for per-account login limits, so a stranger's wrong passwords cannot
// lock the real user out (a counter incremented on every attempt could).
// ---------------------------------------------------------------------------
async function upstashCommand(command: string[]): Promise<number | null> {
  try {
    const res = await fetch(`${UPSTASH_URL}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify([command]),
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: unknown; error?: string }[];
    const first = data?.[0];
    if (!first || first.error) return null;
    return first.result == null ? 0 : Number(first.result);
  } catch {
    return null;
  }
}

/** True while `identifier` has fewer than `max` recorded failures in the window. */
export async function failuresBelowLimit(identifier: string, options: RateLimitOptions): Promise<boolean> {
  if (RATE_LIMIT_BACKEND === "upstash") {
    const windowId = Math.floor(Date.now() / options.windowMs);
    const n = await upstashCommand(["GET", `rlf:${identifier}:${windowId}`]);
    if (n !== null) return n < options.max;
  }
  const entry = store.get(`fail:${identifier}`);
  return !entry || entry.resetAt < Date.now() || entry.count < options.max;
}

/** Record one failure for `identifier`. */
export async function recordFailure(identifier: string, options: RateLimitOptions): Promise<void> {
  if (RATE_LIMIT_BACKEND === "upstash") {
    const windowId = Math.floor(Date.now() / options.windowMs);
    const key = `rlf:${identifier}:${windowId}`;
    const n = await upstashCommand(["INCR", key]);
    if (n !== null) {
      await upstashCommand(["PEXPIRE", key, String(options.windowMs), "NX"]);
      return;
    }
  }
  const now = Date.now();
  const key = `fail:${identifier}`;
  const entry = store.get(key);
  if (!entry || entry.resetAt < now) store.set(key, { count: 1, resetAt: now + options.windowMs });
  else entry.count++;
}

/** Forget recorded failures (after a successful sign-in). */
export async function clearFailures(identifier: string, options: RateLimitOptions): Promise<void> {
  if (RATE_LIMIT_BACKEND === "upstash") {
    const windowId = Math.floor(Date.now() / options.windowMs);
    await upstashCommand(["DEL", `rlf:${identifier}:${windowId}`]);
  }
  store.delete(`fail:${identifier}`);
}

/**
 * Whether X-Real-IP / X-Forwarded-For can be believed. On Vercel the
 * platform sets them from the connection and a client cannot spoof them.
 * Anywhere else they are whatever the client sent unless a reverse proxy in
 * front overwrites them: set TRUST_PROXY_HEADERS=true only behind such a
 * proxy. Without it every request is keyed "unknown", which makes the per-IP
 * limits shared ceilings rather than per-client ones, but not bypassable.
 */
function trustProxyHeaders(): boolean {
  const flag = process.env.TRUST_PROXY_HEADERS;
  if (flag === "true") return true;
  if (flag === "false") return false;
  return !!process.env.VERCEL;
}

/** Client IP for rate-limit keys (see trustProxyHeaders). */
export function getClientIp(request: Request): string {
  if (!trustProxyHeaders()) return "unknown";
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

/**
 * Rate limit presets.
 */
export const RATE_LIMITS = {
  LOGIN: { windowMs: 15 * 60 * 1000, max: 5 }, // 5 failed attempts per 15 min per account and network
  LOGIN_ACCOUNT_GLOBAL: { windowMs: 15 * 60 * 1000, max: 50 }, // failed attempts per account from all networks
  LOGIN_PER_IP: { windowMs: 15 * 60 * 1000, max: 60 }, // ceiling per network address
  PASSWORD_RESET: { windowMs: 60 * 60 * 1000, max: 3 }, // 3 per hour
  API_DEFAULT: { windowMs: 60 * 1000, max: 100 }, // 100 per min
  AI_ENDPOINT: { windowMs: 60 * 1000, max: 10 }, // 10 per min per user (Anthropic spend)
  AI_BRAIN_CYCLE: { windowMs: 60 * 60 * 1000, max: 6 }, // 6 brain cycles per hour per property
  WRITE_OPERATION: { windowMs: 60 * 1000, max: 30 }, // 30 per min
} as const;
