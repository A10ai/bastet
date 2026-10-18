import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { RATE_LIMIT_BACKEND } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

/**
 * Dependency probes behind GET /api/v1/health. Kept out of the route file so
 * they can be unit tested (Next.js route modules may only export handlers).
 */
export type CheckStatus = "ok" | "degraded" | "fail";
export interface Check { status: CheckStatus; latency_ms?: number; detail?: string }

const EXPECTED_MIGRATION_OBJECTS = ["folio_balance", "run_night_audit", "checkin_booking", "property_business_date"];

async function timed<T>(fn: () => Promise<T>, ms = 4000): Promise<{ result?: T; error?: string; latency_ms: number }> {
  const start = Date.now();
  try {
    const result = await Promise.race([fn(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
    return { result, latency_ms: Date.now() - start };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err), latency_ms: Date.now() - start };
  }
}

/**
 * GET /api/v1/health
 *
 * Public, unauthenticated. Returns 200 when the app can serve traffic and 503
 * when a hard dependency (database or auth) is down. Soft problems (stale
 * cron, missing night audit, per-instance rate limiting) mark the check
 * "degraded" but keep 200 so a slow dependency does not take the site out
 * of rotation. Details are deliberately coarse: no error text reaches callers.
 *
 * Used by: Dockerfile HEALTHCHECK, docker-compose, uptime monitors (see
 * docs/ALERTING.md), and the deploy runbook's smoke step.
 */
export type HealthBody = { status: string; checks: Record<string, Check>; timestamp: string; version: string; commit: string | null };

export async function runHealthChecks(): Promise<{ body: HealthBody; status: number }> {
  const checks: Record<string, Check> = { app: { status: "ok" } };

  // Configuration present
  const requiredEnv = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
  const missingEnv = requiredEnv.filter((k) => !process.env[k]);
  checks.config = missingEnv.length ? { status: "fail", detail: `${missingEnv.length} required variable(s) missing` } : { status: "ok" };

  if (missingEnv.length === 0) {
    const admin = createAdminClient();

    // Database reachable and the schema is at the expected level
    const db = await timed(async () => {
      const { error } = await admin.from("properties").select("id", { count: "exact", head: true });
      if (error) throw new Error(error.code || "query failed");
      const { error: fnErr } = await admin.rpc("folio_balance", { p_folio_id: "00000000-0000-0000-0000-000000000000" });
      return { migrated: !fnErr || fnErr.code !== "PGRST202" };
    });
    if (db.error) logger.error({ err: db.error, latency_ms: db.latency_ms }, "[health] database probe failed");
    checks.database = db.error
      ? { status: "fail", latency_ms: db.latency_ms, detail: db.error === "timeout" ? "timeout" : "unreachable" }
      : db.result?.migrated
        ? { status: "ok", latency_ms: db.latency_ms }
        : { status: "degraded", latency_ms: db.latency_ms, detail: `missing database functions: ${EXPECTED_MIGRATION_OBJECTS.join(", ")} (apply migrations)` };

    // Auth server reachable
    const auth = await timed(async () => {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`, {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
        signal: AbortSignal.timeout(3500),
      });
      if (!res.ok) throw new Error(String(res.status));
      return true;
    });
    if (auth.error) logger.error({ err: auth.error, latency_ms: auth.latency_ms }, "[health] auth probe failed");
    checks.auth = auth.error ? { status: "fail", latency_ms: auth.latency_ms, detail: "unreachable" } : { status: "ok", latency_ms: auth.latency_ms };

    // Scheduled work is actually running (cron freshness) and the day has been closed
    if (!db.error) {
      const jobs = await timed(async () => {
        const [{ data: cycle }, { data: close }] = await Promise.all([
          admin.from("system_events").select("created_at").eq("type", "scheduler.cycle_completed").order("created_at", { ascending: false }).limit(1).maybeSingle(),
          admin.from("daily_closes").select("business_date").order("business_date", { ascending: false }).limit(1).maybeSingle(),
        ]);
        return { lastCycle: cycle?.created_at as string | undefined, lastClose: close?.business_date as string | undefined };
      });
      const cycleAgeMin = jobs.result?.lastCycle ? (Date.now() - Date.parse(jobs.result.lastCycle)) / 60000 : null;
      checks.scheduler = cycleAgeMin === null
        ? { status: "degraded", detail: "no automation cycle recorded yet" }
        : cycleAgeMin > 60
          ? { status: "degraded", detail: `last cycle ${Math.round(cycleAgeMin)} min ago (expected every 15)` }
          : { status: "ok", detail: `last cycle ${Math.round(cycleAgeMin)} min ago` };
      const closeAgeDays = jobs.result?.lastClose ? Math.floor((Date.now() - Date.parse(jobs.result.lastClose)) / 86400000) : null;
      checks.night_audit = closeAgeDays === null
        ? { status: "degraded", detail: "no day closed yet" }
        : closeAgeDays > 2
          ? { status: "degraded", detail: `last close ${closeAgeDays} days ago` }
          : { status: "ok", detail: `last business date closed ${jobs.result?.lastClose}` };
    }
  }

  checks.rate_limiter = RATE_LIMIT_BACKEND === "upstash"
    ? { status: "ok", detail: "shared (Upstash)" }
    : process.env.VERCEL
      ? { status: "degraded", detail: "in-memory on a serverless platform: limits are per instance" }
      : { status: "ok", detail: "in-memory (single instance)" };
  checks.error_tracking = process.env.SENTRY_DSN ? { status: "ok" } : { status: "degraded", detail: "SENTRY_DSN not set" };

  const hardFail = ["config", "database", "auth"].some((k) => checks[k]?.status === "fail");
  const degraded = Object.values(checks).some((c) => c.status !== "ok");
  const status = hardFail ? "unhealthy" : degraded ? "degraded" : "healthy";

  return {
    body: { status, checks, timestamp: new Date().toISOString(), version: process.env.npm_package_version || "0.2.0", commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || null },
    status: hardFail ? 503 : 200,
  };
}
