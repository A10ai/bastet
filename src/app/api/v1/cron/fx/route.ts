import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCronOrAdmin } from "@/lib/cron-auth";
import { refreshFxRates } from "@/lib/fx";

export const dynamic = "force-dynamic";

/** POST /api/v1/cron/fx — daily exchange-rate refresh (vercel.json). */
export async function POST(request: NextRequest) {
  const gate = await requireCronOrAdmin(request);
  if (!gate.ok) return gate.error;
  const result = await refreshFxRates(createAdminClient());
  if ("error" in result) return NextResponse.json({ error: { code: "FX_UNAVAILABLE", message: result.error } }, { status: 502 });
  return NextResponse.json({ data: result });
}
