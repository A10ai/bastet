import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole, ROLES } from "@/lib/api-auth";
import { validateBody, formatZodErrors, createChannelConnectionSchema } from "@/lib/validation";
import { encryptSecret } from "@/lib/channel-manager";
import { rpcErrorResponse } from "@/lib/rpc-error";
import { logAudit } from "@/lib/audit";

/**
 * GET  /api/v1/channels/connections          connections for the caller's property (front desk and above)
 * POST /api/v1/channels/connections          create one (manager and above)
 *
 * The webhook secret is write-only: it is encrypted at rest and the API only
 * ever reports whether one is set.
 */
const PUBLIC_COLUMNS = "id, property_id, channel_id, provider, name, status, hotel_code, push_url, push_auth_ref, push_days, rate_plan_id, markup_percent, settings, last_inbound_at, last_push_at, last_push_status, last_error, created_at, updated_at, channel:booking_channels(code, name, commission_rate)";

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ROLES.FRONT_DESK);
  if (!auth.authenticated) return auth.error!;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("channel_connections").select(PUBLIC_COLUMNS).order("created_at");
  if (error) return rpcErrorResponse(error, "channel_connections.select");
  // has_webhook_secret needs the service role (column privilege is revoked for staff).
  const admin = createAdminClient();
  const ids = (data || []).map((c) => c.id as string);
  const { data: secrets } = ids.length ? await admin.from("channel_connections").select("id, webhook_secret").in("id", ids) : { data: [] as { id: string; webhook_secret: string | null }[] };
  const withSecret = new Set((secrets || []).filter((s) => s.webhook_secret).map((s) => s.id as string));
  return NextResponse.json({ data: (data || []).map((c) => ({ ...c, has_webhook_secret: withSecret.has(c.id as string) })) });
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ROLES.MANAGEMENT);
  if (!auth.authenticated) return auth.error!;
  const body = await request.json().catch(() => null);
  const validation = validateBody(createChannelConnectionSchema, body);
  if (!validation.success) return NextResponse.json({ error: "Validation failed", details: formatZodErrors(validation.error) }, { status: 400 });
  const input = validation.data;
  const propertyId = input.property_id ?? auth.propertyId;
  if (!propertyId) return NextResponse.json({ error: { code: "VALIDATION", message: "property_id is required" } }, { status: 400 });
  const supabase = await createServerSupabaseClient();
  const { data: channel } = await supabase.from("booking_channels").select("id").eq("code", input.channel_code).maybeSingle();
  if (!channel) return NextResponse.json({ error: { code: "CHANNEL_NOT_FOUND", message: `Channel ${input.channel_code} does not exist` } }, { status: 404 });
  const { webhook_secret, channel_code: _code, property_id: _pid, ...rest } = input;
  void _code; void _pid;
  const { data, error } = await supabase
    .from("channel_connections")
    .insert({ ...rest, property_id: propertyId, channel_id: channel.id, webhook_secret: webhook_secret ? encryptSecret(webhook_secret) : null })
    .select(PUBLIC_COLUMNS)
    .single();
  if (error) return rpcErrorResponse(error, "channel_connections.insert");
  await logAudit(supabase, { user_id: auth.userId, user_email: auth.email, action: "channel.connection_created", category: "settings", resource_type: "channel_connection", resource_id: data.id, description: `Channel connection ${input.name} (${input.channel_code}, ${input.provider}) created` });
  return NextResponse.json({ data: { ...data, has_webhook_secret: Boolean(webhook_secret) } }, { status: 201 });
}
