import "server-only";

/**
 * Sentry error tracking integration for HospitAI.
 *
 * Lazy-loads @sentry/nextjs only if SENTRY_DSN is configured.
 * If Sentry is not installed or no DSN, functions are no-ops.
 * This avoids hard dependency on Sentry while enabling error tracking in production.
 */

interface SentryHint {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  level?: "fatal" | "error" | "warning" | "info" | "debug";
}

let sentryAvailable = false;
let sentryInitAttempted = false;

function initSentry(): void {
  if (sentryInitAttempted) return;
  sentryInitAttempted = true;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  try {
    // Dynamic require — only loaded if SENTRY_DSN is set
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require("@sentry/nextjs");
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || "development",
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || "0.1"),
      // Don't send PII
      beforeSend(event: { request?: { headers?: Record<string, string> } }) {
        if (event.request?.headers) {
          // Strip auth headers
          delete event.request.headers.authorization;
          delete event.request.headers.cookie;
        }
        return event;
      },
    });
    sentryAvailable = true;
  } catch {
    // @sentry/nextjs not installed — no-op
    sentryAvailable = false;
  }
}

/** Capture an exception with optional context. */
export function captureException(error: Error | unknown, hint?: SentryHint): void {
  initSentry();
  if (!sentryAvailable) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require("@sentry/nextjs");
    Sentry.captureException(error, {
      tags: hint?.tags,
      extra: hint?.extra,
      level: hint?.level || "error",
    });
  } catch {
    // Silent fail — don't break the app for error tracking
  }
}

/** Capture a message (info, warning, etc). */
export function captureMessage(message: string, hint?: SentryHint): void {
  initSentry();
  if (!sentryAvailable) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require("@sentry/nextjs");
    Sentry.captureMessage(message, {
      tags: hint?.tags,
      extra: hint?.extra,
      level: hint?.level || "info",
    });
  } catch {
    // Silent fail
  }
}

/** Check if Sentry is active. */
export function isSentryEnabled(): boolean {
  initSentry();
  return sentryAvailable;
}