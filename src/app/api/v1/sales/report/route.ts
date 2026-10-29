import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole, ROLES } from "@/lib/api-auth";
import { validateBody, formatZodErrors, salesReportQuerySchema, salesReportSnapshotSchema } from "@/lib/validation";
import { computeProof, isoWeekBounds, proofNarrative, snapshotProof, isoDay } from "@/lib/sales-ops";
import { rpcErrorResponse } from "@/lib/rpc-error";
import { logger } from "@/lib/logger";

/**
 * GET  /api/v1/sales/report?from=&to=       live proof metrics for a period (default: this week so far) + stored weekly snapshots
 * POST /api/v1/sales/report {action:"snapshot", week_start?}   store a week's report (manager+)
 */
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ROLES.ALL_STAFF);
  if (!auth.authenticated) return auth.error!;
  if (!auth.propertyId) return NextResponse.json({ error: { code: "NO_PROPERTY", message: "No property on this account" } }, { status: 400 });
  const q = request.nextUrl.searchParams;
  const validation = validateBody(salesReportQuerySchema, { from: q.get("from") || undefined, to: q.get("to") || undefined });
  if (!validation.success) return NextResponse.json({ error: "Validation failed", details: formatZodErrors(validation.error) }, { status: 400 });
  try {
    const week = isoWeekBounds(new Date());
    const from = validation.data.from ?? week.start;
    const to = validation.data.to ?? isoDay(new Date(Date.now() + 86_400_000));
    const supabase = await createServerSupabaseClient();
    const { data: metrics, error } = await supabase.rpc("sales_weekly_proof", { p_property_id: auth.propertyId, p_from: from, p_to: to });
    if (error) return rpcErrorResponse(error, "sales_weekly_proof");
    const prevFrom = isoDay(new Date(Date.parse(`${from}T00:00:00Z`) - (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`))));
    const { data: previous } = await supabase.rpc("sales_weekly_proof", { p_property_id: auth.propertyId, p_from: prevFrom, p_to: from });
    const { data: snapshots } = await supabase.from("sales_reports").select("id, period_start, period_end, kind, narrative, metrics, created_at").order("period_start", { ascending: false }).limit(12);
    return NextResponse.json({ data: { metrics, previous: previous ?? null, narrative: proofNarrative(metrics as never, (previous as never) ?? null), snapshots: snapshots || [] } });
  } catch (err) {
    logger.error({ err: String(err) }, "[sales/report] failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ROLES.MANAGEMENT);
  if (!auth.authenticated) return auth.error!;
  if (!auth.propertyId) return NextResponse.json({ error: { code: "NO_PROPERTY", message: "No property on this account" } }, { status: 400 });
  const body = await request.json().catch(() => null);
  const validation = validateBody(salesReportSnapshotSchema, body);
  if (!validation.success) return NextResponse.json({ error: "Validation failed", details: formatZodErrors(validation.error) }, { status: 400 });
  try {
    const admin = createAdminClient();
    const start = validation.data.week_start ? isoWeekBounds(new Date(`${validation.data.week_start}T00:00:00Z`)).start : isoWeekBounds(new Date(Date.now() - 7 * 86_400_000)).start;
    const end = isoDay(new Date(Date.parse(`${start}T00:00:00Z`) + 7 * 86_400_000));
    void computeProof;
    const r = await snapshotProof(admin, auth.propertyId, start, end);
    return NextResponse.json({ data: r }, { status: r.created ? 201 : 200 });
  } catch (err) {
    logger.error({ err: String(err) }, "[sales/report] snapshot failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
