import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { validateBody, formatZodErrors, updateChannelConnectionSchema } from "@/lib/validation";
import { encryptSecret } from "@/lib/channel-manager";
import { rpcErrorResponse } from "@/lib/rpc-error";
import { logAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };
const PUBLIC_COLUMNS = "id, property_id, channel_id, provider, name, status, hotel_code, push_url, push_auth_ref, push_days, rate_plan_id, markup_percent, settings, last_inbound_at, last_push_at, last_push_status, last_error, created_at, updated_at, channel:booking_channels(code, name, commission_rate)";

/** PATCH /api/v1/channels/connections/:id (manager+), DELETE (manager+). RLS scopes to the property. */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  const auth = await requireRole(request, ROLES.MANAGEMENT);
  if (!auth.authenticated) return auth.error!;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const validation = validateBody(updateChannelConnectionSchema, body);
  if (!validation.success) return NextResponse.json({ error: "Validation failed", details: formatZodErrors(validation.error) }, { status: 400 });
  const { webhook_secret, ...rest } = validation.data;
  const patch: Record<string, unknown> = { ...rest };
  if (webhook_secret !== undefined) patch.webhook_secret = webhook_secret ? encryptSecret(webhook_secret) : null;
  if (rest.status && rest.status !== "error") patch.last_error = null;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("channel_connections").update(patch).eq("id", id).select(PUBLIC_COLUMNS).maybeSingle();
  if (error) return rpcErrorResponse(error, "channel_connections.update");
  if (!data) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Connection not found" } }, { status: 404 });
  await logAudit(supabase, { user_id: auth.userId, user_email: auth.email, action: "channel.connection_updated", category: "settings", resource_type: "channel_connection", resource_id: id, description: `Channel connection ${data.name} updated (${Object.keys(rest).join(", ")}${webhook_secret !== undefined ? ", webhook_secret" : ""})` });
  return NextResponse.json({ data });
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const auth = await requireRole(request, ROLES.MANAGEMENT);
  if (!auth.authenticated) return auth.error!;
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("channel_connections").delete().eq("id", id).select("id, name").maybeSingle();
  if (error) return rpcErrorResponse(error, "channel_connections.delete");
  if (!data) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Connection not found" } }, { status: 404 });
  await logAudit(supabase, { user_id: auth.userId, user_email: auth.email, action: "channel.connection_deleted", category: "settings", resource_type: "channel_connection", resource_id: id, description: `Channel connection ${data.name} deleted` });
  return NextResponse.json({ data: { id } });
}
