import "server-only";

/**
 * Simple in-memory rate limiter.
 * For production with multiple instances, use Upstash Redis rate limiter.
 * This implementation works for single-instance deployments (Edge Box, Vercel with single instance).
 *
 * Usage:
 *   const result = rateLimit(identifier, { windowMs: 60000, max: 100 });
 *   if (!result.allowed) return result.error!;
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const key of Array.from(store.keys())) {
    const entry = store.get(key);
    if (entry && entry.resetAt < now) {
      store.delete(key);
    }
  }
}

interface RateLimitOptions {
  /** Time window in milliseconds */
  windowMs: number;
  /** Maximum requests in the window */
  max: number;
  /** Optional message for the error response */
  message?: string;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Check rate limit for a given identifier (IP, user ID, etc).
 * Returns { allowed: true } if under limit, { allowed: false, remaining: 0 } if exceeded.
 */
export function rateLimit(
  identifier: string,
  options: RateLimitOptions
): RateLimitResult {
  cleanup();
  const now = Date.now();
  const key = identifier;

  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    // New window
    store.set(key, { count: 1, resetAt: now + options.windowMs });
    return { allowed: true, remaining: options.max - 1, resetAt: now + options.windowMs };
  }

  if (entry.count >= options.max) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: options.max - entry.count, resetAt: entry.resetAt };
}

/**
 * Get client IP from request.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}

/**
 * Rate limit presets.
 */
export const RATE_LIMITS = {
  LOGIN: { windowMs: 15 * 60 * 1000, max: 5 },      // 5 attempts per 15 min
  PASSWORD_RESET: { windowMs: 60 * 60 * 1000, max: 3 }, // 3 per hour
  API_DEFAULT: { windowMs: 60 * 1000, max: 100 },   // 100 per min
  AI_ENDPOINT: { windowMs: 60 * 1000, max: 10 },     // 10 per min
  WRITE_OPERATION: { windowMs: 60 * 1000, max: 30 }, // 30 per min
} as const;