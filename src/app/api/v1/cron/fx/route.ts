import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCronOrAdmin } from "@/lib/cron-auth";
import { refreshFxRates } from "@/lib/fx";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

async function refresh() {
  const result = await refreshFxRates(createAdminClient());
  if ("error" in result) return NextResponse.json({ error: { code: "FX_UNAVAILABLE", message: result.error } }, { status: 502 });
  // Currencies the provider did not quote (e.g. EGP on the ECB fallback):
  // their stored rates were not refreshed, so say so instead of "ok".
  const missing = ((result as { missing?: string[] }).missing ?? []) as string[];
  if (missing.length) logger.warn({ missing }, "[cron/fx] provider returned no rate for some currencies");
  return NextResponse.json({ data: { ...result, missing, status: missing.length ? "degraded" : "ok" } });
}

/** POST /api/v1/cron/fx — exchange-rate refresh (schedulers and admins). */
export async function POST(request: NextRequest) {
  const gate = await requireCronOrAdmin(request);
  if (!gate.ok) return gate.error;
  return refresh();
}

/**
 * GET: Vercel Cron (daily 06:15 UTC, vercel.json) calls with GET and the cron
 * secret, which refreshes the rates. An admin session (or `?status=1`) only
 * reads the stored rates: a GET from a browser session must not change data.
 */
export async function GET(request: NextRequest) {
  const gate = await requireCronOrAdmin(request);
  if (!gate.ok) return gate.error;
  if (!gate.auth && request.nextUrl.searchParams.get("status") !== "1") return refresh();
  const { data, error } = await createAdminClient().from("currency_rates").select("*").limit(50);
  if (error) return NextResponse.json({ error: "Could not read rates" }, { status: 500 });
  return NextResponse.json({ data });
}
