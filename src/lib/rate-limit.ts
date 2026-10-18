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
    const data = (await res.json()) as { result: number }[];
    const count = Number(data?.[0]?.result ?? 0);
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

/**
 * Client IP. On Vercel the platform sets x-real-ip from the connection; a
 * client cannot spoof it. Behind other proxies, configure them to overwrite
 * x-forwarded-for rather than append to it.
 */
export function getClientIp(request: Request): string {
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
  LOGIN: { windowMs: 15 * 60 * 1000, max: 5 }, // 5 attempts per 15 min per account
  LOGIN_PER_IP: { windowMs: 15 * 60 * 1000, max: 60 }, // ceiling per network address
  PASSWORD_RESET: { windowMs: 60 * 60 * 1000, max: 3 }, // 3 per hour
  API_DEFAULT: { windowMs: 60 * 1000, max: 100 }, // 100 per min
  AI_ENDPOINT: { windowMs: 60 * 1000, max: 10 }, // 10 per min per user (Anthropic spend)
  AI_BRAIN_CYCLE: { windowMs: 60 * 60 * 1000, max: 6 }, // 6 brain cycles per hour per property
  WRITE_OPERATION: { windowMs: 60 * 1000, max: 30 }, // 30 per min
} as const;
