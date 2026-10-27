import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { validateBody, validatePatchBody, formatZodErrors, posItemSchema, updatePosItemSchema } from "@/lib/validation";
import { rpcErrorResponse } from "@/lib/rpc-error";
import { logAudit } from "@/lib/audit";

/**
 * Outlet catalogue.
 * GET   /api/v1/pos/outlets/:id/items                 items (all staff)
 * POST  /api/v1/pos/outlets/:id/items                 add an item (manager and above)
 * PATCH /api/v1/pos/outlets/:id/items  { id, ...fields }  update price, name, availability (manager and above)
 */
type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  const auth = await requireRole(request, ROLES.ALL_STAFF);
  if (!auth.authenticated) return auth.error!;
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("pos_items").select("*").eq("outlet_id", id).order("category").order("name");
  if (error) return rpcErrorResponse(error, "pos_items.select");
  return NextResponse.json({ data: data || [] });
}

export async function POST(request: NextRequest, ctx: Ctx) {
  const auth = await requireRole(request, ROLES.MANAGEMENT);
  if (!auth.authenticated) return auth.error!;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const validation = validateBody(posItemSchema, body);
  if (!validation.success) return NextResponse.json({ error: "Validation failed", details: formatZodErrors(validation.error) }, { status: 400 });
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("pos_items").insert({ ...validation.data, outlet_id: id }).select("*").single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: { code: "DUPLICATE_ITEM", message: "This outlet already sells an item with that name" } }, { status: 409 });
    return rpcErrorResponse(error, "pos_items.insert");
  }
  await logAudit(supabase, { user_id: auth.userId, user_email: auth.email, action: "pos.item_create", category: "settings", resource_type: "pos_item", resource_id: data.id, description: `Added ${data.name} at ${data.unit_price_gbp} GBP`, new_data: data });
  return NextResponse.json({ data }, { status: 201 });
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const auth = await requireRole(request, ROLES.MANAGEMENT);
  if (!auth.authenticated) return auth.error!;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id) return NextResponse.json({ error: "item id is required" }, { status: 400 });
  const { id: itemId, ...rest } = body;
  const validation = validatePatchBody(updatePosItemSchema, rest);
  if (!validation.success) return NextResponse.json({ error: "Validation failed", details: formatZodErrors(validation.error) }, { status: 400 });
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("pos_items").update(validation.data).eq("id", itemId).eq("outlet_id", id).select("*").single();
  if (error) return rpcErrorResponse(error, "pos_items.update");
  await logAudit(supabase, { user_id: auth.userId, user_email: auth.email, action: "pos.item_update", category: "settings", resource_type: "pos_item", resource_id: itemId, description: `Updated ${data.name}`, new_data: validation.data });
  return NextResponse.json({ data });
}
