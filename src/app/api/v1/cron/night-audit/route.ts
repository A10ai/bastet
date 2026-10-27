import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCronOrAdmin, type CronGate } from "@/lib/cron-auth";
import { listAccessiblePropertyIds } from "@/lib/api-property";
import { rpcErrorResponse } from "@/lib/rpc-error";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { validateBody, formatZodErrors } from "@/lib/validation";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    property_id: z.string().uuid().optional(),
    business_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").optional(),
  })
  .strict();

type OkGate = Extract<CronGate, { ok: true }>;

/** Today's date (YYYY-MM-DD) in a property's timezone. */
function businessToday(timezone: string | null | undefined): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone || "Africa/Cairo" }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());
  }
}

/** Properties this caller may audit: all for the scheduler, memberships for an admin. */
async function allowedProperties(gate: OkGate): Promise<string[] | "all"> {
  if (!gate.auth) return "all";
  return listAccessiblePropertyIds(gate.auth.staffId!, gate.auth.propertyId);
}

/**
 * Closes the previous business day for every active property:
 * marks no-shows, snapshots occupancy and revenue into daily_closes and
 * rolls last_business_date forward. Idempotent per property and date.
 * Optional body: { "property_id": "...", "business_date": "YYYY-MM-DD" };
 * a business date must be before the property's current business day, or the
 * audit would mark today's and future arrivals as no-shows.
 */
async function runAudit(gate: OkGate, body: z.infer<typeof bodySchema>) {
  const admin = createAdminClient();
  const allowed = await allowedProperties(gate);

  let properties: { id: string; timezone?: string | null }[] = [];
  if (body.property_id) {
    if (allowed !== "all" && !allowed.includes(body.property_id)) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "No access to that property" } }, { status: 403 });
    }
    const { data } = await admin.from("properties").select("id, timezone").eq("id", body.property_id);
    properties = (data || []) as typeof properties;
  } else {
    let query = admin.from("properties").select("id, timezone").neq("status", "closed");
    if (allowed !== "all") query = query.in("id", allowed);
    const { data } = await query;
    properties = (data || []) as typeof properties;
  }

  if (body.business_date) {
    for (const p of properties) {
      if (body.business_date >= businessToday(p.timezone)) {
        return NextResponse.json(
          { error: { code: "INVALID_BUSINESS_DATE", message: "Only a past business day can be closed" } },
          { status: 400 }
        );
      }
    }
  }

  const closes: unknown[] = [];
  for (const property of properties) {
    const { data, error } = await admin.rpc("run_night_audit", {
      p_property_id: property.id,
      p_business_date: body.business_date ?? null,
      p_actor: gate.actor,
    });
    if (error) return rpcErrorResponse(error, "run_night_audit");
    closes.push({ property_id: property.id, ...(data as Record<string, unknown>) });
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
}

/** POST /api/v1/cron/night-audit: the GitHub Actions scheduler or an admin. */
export async function POST(request: NextRequest) {
  const gate = await requireCronOrAdmin(request);
  if (!gate.ok) return gate.error;

  try {
    const raw = await request.json().catch(() => ({}));
    const validation = validateBody(bodySchema, raw ?? {});
    if (!validation.success) {
      return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
    }
    return await runAudit(gate, validation.data);
  } catch (err) {
    logger.error({ err: String(err) }, "[cron/night-audit] unhandled");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * GET /api/v1/cron/night-audit
 *  - Vercel Cron (GET with the cron secret, scheduled in vercel.json at
 *    03:00 UTC = 05:00 Cairo): runs the audit. `?status=1` only reports.
 *  - Admin session: the latest closes of the admin's own properties.
 */
export async function GET(request: NextRequest) {
  const gate = await requireCronOrAdmin(request);
  if (!gate.ok) return gate.error;

  try {
    if (!gate.auth && request.nextUrl.searchParams.get("status") !== "1") {
      return await runAudit(gate, {});
    }
    const allowed = await allowedProperties(gate);
    const admin = createAdminClient();
    let query = admin.from("daily_closes").select("*");
    if (allowed !== "all") query = query.in("property_id", allowed);
    const { data, error } = await query.order("business_date", { ascending: false }).limit(30);
    if (error) return rpcErrorResponse(error, "daily_closes.list");
    return NextResponse.json({ data });
  } catch (err) {
    logger.error({ err: String(err) }, "[cron/night-audit] GET unhandled");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
