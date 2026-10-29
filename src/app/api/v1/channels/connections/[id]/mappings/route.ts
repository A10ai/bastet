import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { validateBody, formatZodErrors, channelMappingsSchema } from "@/lib/validation";
import { rpcErrorResponse } from "@/lib/rpc-error";
import { logAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/channels/connections/:id/mappings   (front desk and above)
 * PUT /api/v1/channels/connections/:id/mappings   replace the full set (manager and above)
 */
export async function GET(request: NextRequest, ctx: Ctx) {
  const auth = await requireRole(request, ROLES.FRONT_DESK);
  if (!auth.authenticated) return auth.error!;
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("channel_room_mappings").select("id, apartment_type_id, external_room_id, external_rate_plan_id, rate_plan_id, is_active, apartment_type:apartment_types(name)").eq("connection_id", id).order("external_room_id");
  if (error) return rpcErrorResponse(error, "channel_room_mappings.select");
  return NextResponse.json({ data: data || [] });
}

export async function PUT(request: NextRequest, ctx: Ctx) {
  const auth = await requireRole(request, ROLES.MANAGEMENT);
  if (!auth.authenticated) return auth.error!;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const validation = validateBody(channelMappingsSchema, body);
  if (!validation.success) return NextResponse.json({ error: "Validation failed", details: formatZodErrors(validation.error) }, { status: 400 });
  const supabase = await createServerSupabaseClient();
  const { data: conn } = await supabase.from("channel_connections").select("id, property_id, name").eq("id", id).maybeSingle();
  if (!conn) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Connection not found" } }, { status: 404 });
  const keys = new Set<string>();
  for (const m of validation.data.mappings) {
    const k = `${m.external_room_id}|${m.external_rate_plan_id}`;
    if (keys.has(k)) return NextResponse.json({ error: { code: "VALIDATION", message: `Duplicate mapping ${k}` } }, { status: 400 });
    keys.add(k);
  }
  const { error: delErr } = await supabase.from("channel_room_mappings").delete().eq("connection_id", id);
  if (delErr) return rpcErrorResponse(delErr, "channel_room_mappings.delete");
  if (validation.data.mappings.length) {
    const { error: insErr } = await supabase.from("channel_room_mappings").insert(validation.data.mappings.map((m) => ({ ...m, connection_id: id, property_id: conn.property_id })));
    if (insErr) return rpcErrorResponse(insErr, "channel_room_mappings.insert");
  }
  await logAudit(supabase, { user_id: auth.userId, user_email: auth.email, action: "channel.mappings_replaced", category: "settings", resource_type: "channel_connection", resource_id: id, description: `${validation.data.mappings.length} room mapping(s) set on ${conn.name}` });
  const { data } = await supabase.from("channel_room_mappings").select("id, apartment_type_id, external_room_id, external_rate_plan_id, rate_plan_id, is_active").eq("connection_id", id).order("external_room_id");
  return NextResponse.json({ data: data || [] });
}
