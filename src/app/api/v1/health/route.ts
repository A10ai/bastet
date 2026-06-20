import { NextResponse } from "next/server";

/**
 * Health check endpoint for Docker, load balancers, and monitoring.
 * Returns 200 if the app is running, 503 if critical dependencies fail.
 *
 * Used by:
 * - Dockerfile HEALTHCHECK
 * - docker-compose depends_on healthcheck
 * - Kubernetes liveness/readiness probes (future)
 * - Uptime monitoring (future)
 */
export async function GET() {
  const checks: Record<string, "ok" | "fail"> = {
    app: "ok",
  };

  // Check if Supabase env vars are configured
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    checks.supabase = "fail";
  } else {
    checks.supabase = "ok";
  }

  // Check if critical env vars are set
  const hasPropertyId = !!process.env.PROPERTY_ID;
  checks.config = hasPropertyId ? "ok" : "fail";

  const allOk = Object.values(checks).every((v) => v === "ok");

  return NextResponse.json(
    {
      status: allOk ? "healthy" : "degraded",
      checks,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "unknown",
    },
    { status: allOk ? 200 : 503 }
  );
}