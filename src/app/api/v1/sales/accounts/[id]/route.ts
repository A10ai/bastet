import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { validateBody, formatZodErrors, updateSalesAccountSchema } from "@/lib/validation";
import { rpcErrorResponse } from "@/lib/rpc-error";
import { logAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/** GET one account with contacts and activities; PATCH fields (a stage change is logged); DELETE (manager+). */
export async function GET(request: NextRequest, ctx: Ctx) {
  const auth = await requireRole(request, ROLES.FRONT_DESK);
  if (!auth.authenticated) return auth.error!;
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("sales_accounts").select("*, contacts:sales_contacts(*), activities:sales_activities(id, kind, summary, body, happened_at, contact_id, staff:staff(first_name, last_name))").eq("id", id).maybeSingle();
  if (error) return rpcErrorResponse(error, "sales_accounts.select");
  if (!data) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Account not found" } }, { status: 404 });
  return NextResponse.json({ data });
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const auth = await requireRole(request, ROLES.FRONT_DESK);
  if (!auth.authenticated) return auth.error!;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const validation = validateBody(updateSalesAccountSchema, body);
  if (!validation.success) return NextResponse.json({ error: "Validation failed", details: formatZodErrors(validation.error) }, { status: 400 });
  const supabase = await createServerSupabaseClient();
  const { data: before } = await supabase.from("sales_accounts").select("id, property_id, stage, name").eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Account not found" } }, { status: 404 });
  const { data, error } = await supabase.from("sales_accounts").update(validation.data).eq("id", id).select("*").single();
  if (error) return rpcErrorResponse(error, "sales_accounts.update");
  if (validation.data.stage && validation.data.stage !== before.stage) {
    await supabase.from("sales_activities").insert({ account_id: id, property_id: before.property_id, kind: "stage_change", summary: `Stage ${before.stage} -> ${validation.data.stage}`, staff_id: auth.staffId ?? null });
  }
  await logAudit(supabase, { user_id: auth.userId, user_email: auth.email, action: "sales.account_updated", category: "settings", resource_type: "sales_account", resource_id: id, description: `Sales account ${before.name} updated (${Object.keys(validation.data).join(", ")})` });
  return NextResponse.json({ data });
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const auth = await requireRole(request, ROLES.MANAGEMENT);
  if (!auth.authenticated) return auth.error!;
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("sales_accounts").delete().eq("id", id).select("id, name").maybeSingle();
  if (error) return rpcErrorResponse(error, "sales_accounts.delete");
  if (!data) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Account not found" } }, { status: 404 });
  await logAudit(supabase, { user_id: auth.userId, user_email: auth.email, action: "sales.account_deleted", category: "settings", resource_type: "sales_account", resource_id: id, description: `Sales account ${data.name} deleted` });
  return NextResponse.json({ data: { id } });
}
