import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCronOrAdmin } from "@/lib/cron-auth";
import { rpcErrorResponse } from "@/lib/rpc-error";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/cron/night-audit
 *
 * Closes the previous business day for every active property:
 * marks no-shows, snapshots occupancy and revenue into daily_closes and
 * rolls last_business_date forward. Idempotent per property and date.
 * Scheduled in vercel.json (03:00 UTC = 05:00 Cairo); admins may also call it.
 * Optional body: { "property_id": "...", "business_date": "YYYY-MM-DD" }.
 */
export async function POST(request: NextRequest) {
  const gate = await requireCronOrAdmin(request);
  if (!gate.ok) return gate.error;

  try {
    const body = (await request.json().catch(() => ({}))) as { property_id?: string; business_date?: string };
    const admin = createAdminClient();

    let propertyIds: string[] = [];
    if (body.property_id) {
      propertyIds = [body.property_id];
    } else {
      const { data } = await admin.from("properties").select("id").neq("status", "closed");
      propertyIds = (data || []).map((p: { id: string }) => p.id);
    }

    const closes: unknown[] = [];
    for (const propertyId of propertyIds) {
      const { data, error } = await admin.rpc("run_night_audit", {
        p_property_id: propertyId,
        p_business_date: body.business_date ?? null,
        p_actor: gate.actor,
      });
      if (error) return rpcErrorResponse(error, "run_night_audit");
      closes.push({ property_id: propertyId, ...(data as Record<string, unknown>) });
    }

    await logAudit(admin, {
      user_id: gate.auth?.userId ?? "system",
      user_email: gate.auth?.email ?? "cron@hospitai.uk",
      action: "night_audit.run",
      category: "system",
      resource_type: "daily_close",
      description: `Night audit closed ${closes.length} propert${closes.length === 1 ? "y" : "ies"}`,
      metadata: { actor: gate.actor, business_date: body.business_date ?? "previous" },
    });

    return NextResponse.json({ data: { closes } });
  } catch (err) {
    logger.error({ err: String(err) }, "[cron/night-audit] unhandled");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** GET returns the latest close per property (admin dashboards, monitoring). */
export async function GET(request: NextRequest) {
  const gate = await requireCronOrAdmin(request);
  if (!gate.ok) return gate.error;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("daily_closes")
    .select("*")
    .order("business_date", { ascending: false })
    .limit(30);
  if (error) return rpcErrorResponse(error, "daily_closes.list");
  return NextResponse.json({ data });
}
