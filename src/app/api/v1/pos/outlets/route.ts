import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { validateBody, formatZodErrors, posOutletSchema } from "@/lib/validation";
import { rpcErrorResponse } from "@/lib/rpc-error";
import { logAudit } from "@/lib/audit";

/**
 * POS outlets (migration 00030).
 * GET  /api/v1/pos/outlets?include_inactive=true   outlets with their active items (all staff)
 * POST /api/v1/pos/outlets                          create an outlet (manager and above)
 */
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ROLES.ALL_STAFF);
  if (!auth.authenticated) return auth.error!;
  const supabase = await createServerSupabaseClient();
  const includeInactive = request.nextUrl.searchParams.get("include_inactive") === "true";
  let q = supabase.from("pos_outlets").select("*, items:pos_items(*)").order("name");
  if (auth.propertyId) q = q.eq("property_id", auth.propertyId);
  if (!includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) return rpcErrorResponse(error, "pos_outlets.select");
  const rows = (data || []).map((o) => ({ ...o, items: ((o.items as Array<{ is_active: boolean; name: string }>) || []).filter((i) => includeInactive || i.is_active).sort((a, b) => a.name.localeCompare(b.name)) }));
  return NextResponse.json({ data: rows });
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ROLES.MANAGEMENT);
  if (!auth.authenticated) return auth.error!;
  const body = await request.json().catch(() => null);
  const validation = validateBody(posOutletSchema, body);
  if (!validation.success) return NextResponse.json({ error: "Validation failed", details: formatZodErrors(validation.error) }, { status: 400 });
  const { property_id, ...fields } = validation.data;
  const propertyId = property_id || auth.propertyId;
  if (!propertyId) return NextResponse.json({ error: "No property for this staff member" }, { status: 400 });
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("pos_outlets").insert({ ...fields, code: fields.code.toUpperCase(), property_id: propertyId }).select("*").single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: { code: "DUPLICATE_CODE", message: "An outlet with that code already exists" } }, { status: 409 });
    return rpcErrorResponse(error, "pos_outlets.insert");
  }
  await logAudit(supabase, { user_id: auth.userId, user_email: auth.email, action: "pos.outlet_create", category: "settings", resource_type: "pos_outlet", resource_id: data.id, description: `Created outlet ${data.code} (${data.name})`, new_data: data });
  return NextResponse.json({ data }, { status: 201 });
}
