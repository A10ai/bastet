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
  // Throws with a readable list of missing variables.
  getEnv();

  const { isSentryEnabled } = await import("@/lib/sentry");
  const { logger } = await import("@/lib/logger");
  logger.info(
    { sentry: isSentryEnabled() ? "enabled" : "disabled (no SENTRY_DSN)" },
    "[startup] environment validated"
  );
}
