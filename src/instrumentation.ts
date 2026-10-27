/**
 * Next.js instrumentation hook — runs once when the server starts
 * (enabled via `experimental.instrumentationHook` in next.config.mjs).
 *
 * Two jobs, both previously written but never wired (audit Oct 2026):
 *   1. Validate required environment variables and fail fast.
 *   2. Initialise Sentry when SENTRY_DSN is configured.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getEnv } = await import("@/lib/env");
  try {
    getEnv();
  } catch (err) {
    console.error(`[startup] ${err instanceof Error ? err.message : String(err)}`);
    // A long-running server (`next start`, Docker) refuses to start. On
    // Vercel there is no process to stop: rethrowing makes every request fail
    // with this message in the function logs instead of half-working.
    if (!process.env.VERCEL) process.exit(1);
    throw err;
  }

  const { isSentryEnabled } = await import("@/lib/sentry");
  const { logger } = await import("@/lib/logger");
  logger.info(
    { sentry: isSentryEnabled() ? "enabled" : "disabled (no SENTRY_DSN)" },
    "[startup] environment validated"
  );
}
