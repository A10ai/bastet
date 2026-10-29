import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCronOrAdmin } from "@/lib/cron-auth";
import { requireRole, ROLES } from "@/lib/api-auth";
import { validateBody, formatZodErrors, channelPushSchema } from "@/lib/validation";
import { buildAriPayload, computeAri, connectionByCode, listMappings, pushAri } from "@/lib/channel-manager";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET  /api/v1/channels/:code/push?from=&to=   preview the ARI payload (manager and above)
 * POST /api/v1/channels/:code/push {from?,to?} push it now (cron secret or admin)
 *
 * Without a push_url the connection is a dry run: the payload is computed
 * and logged, nothing leaves the building.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const auth = await requireRole(request, ROLES.MANAGEMENT);
  if (!auth.authenticated) return auth.error!;
  const { code } = await ctx.params;
  try {
    const q = request.nextUrl.searchParams;
    const validation = validateBody(channelPushSchema, { from: q.get("from") || undefined, to: q.get("to") || undefined });
    if (!validation.success) return NextResponse.json({ error: "Validation failed", details: formatZodErrors(validation.error) }, { status: 400 });
    const admin = createAdminClient();
    const connection = await connectionByCode(admin, code, auth.propertyId ?? null);
    if (!connection) return NextResponse.json({ error: { code: "NOT_FOUND", message: "No connection for this channel" } }, { status: 404 });
    const from = validation.data.from ?? new Date().toISOString().slice(0, 10);
    const to = validation.data.to ?? new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const [rows, mappings] = await Promise.all([computeAri(admin, connection.property_id, from, to, connection.rate_plan_id), listMappings(admin, connection.id)]);
    return NextResponse.json({ data: buildAriPayload(rows, mappings, connection, from, to) });
  } catch (err) {
    logger.error({ err: String(err), code }, "[channels/push] preview failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const gate = await requireCronOrAdmin(request);
  if (!gate.ok) return gate.error;
  const { code } = await ctx.params;
  try {
    const body = await request.json().catch(() => ({}));
    const validation = validateBody(channelPushSchema, body ?? {});
    if (!validation.success) return NextResponse.json({ error: "Validation failed", details: formatZodErrors(validation.error) }, { status: 400 });
    const admin = createAdminClient();
    const connection = await connectionByCode(admin, code, gate.auth?.propertyId ?? null);
    if (!connection) return NextResponse.json({ error: { code: "NOT_FOUND", message: "No connection for this channel" } }, { status: 404 });
    const result = await pushAri(admin, connection, { from: validation.data.from, to: validation.data.to });
    await logAudit(admin, { user_id: gate.auth?.userId, user_email: gate.auth?.email, action: "channel.push", category: "settings", resource_type: "channel_connection", resource_id: connection.id, description: `ARI push to ${connection.name}: ${result.status}${result.error ? ` (${result.error})` : ""}`, metadata: result as unknown as Record<string, unknown> });
    return NextResponse.json({ data: result }, { status: result.status === "failed" ? 502 : 200 });
  } catch (err) {
    logger.error({ err: String(err), code }, "[channels/push] failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
