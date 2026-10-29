import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { validateBody, formatZodErrors, salesActivitySchema } from "@/lib/validation";
import { rpcErrorResponse } from "@/lib/rpc-error";

type Ctx = { params: Promise<{ id: string }> };

/** GET / POST activities (notes, emails, calls, meetings, proposals) on an account. Front desk and above. */
export async function GET(request: NextRequest, ctx: Ctx) {
  const auth = await requireRole(request, ROLES.FRONT_DESK);
  if (!auth.authenticated) return auth.error!;
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("sales_activities").select("id, kind, summary, body, happened_at, contact_id, staff:staff(first_name, last_name)").eq("account_id", id).order("happened_at", { ascending: false }).limit(200);
  if (error) return rpcErrorResponse(error, "sales_activities.select");
  return NextResponse.json({ data: data || [] });
}

export async function POST(request: NextRequest, ctx: Ctx) {
  const auth = await requireRole(request, ROLES.FRONT_DESK);
  if (!auth.authenticated) return auth.error!;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const validation = validateBody(salesActivitySchema, body);
  if (!validation.success) return NextResponse.json({ error: "Validation failed", details: formatZodErrors(validation.error) }, { status: 400 });
  const supabase = await createServerSupabaseClient();
  const { data: account } = await supabase.from("sales_accounts").select("id, property_id").eq("id", id).maybeSingle();
  if (!account) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Account not found" } }, { status: 404 });
  const { data, error } = await supabase.from("sales_activities").insert({ ...validation.data, account_id: id, property_id: account.property_id, staff_id: auth.staffId ?? null }).select("*").single();
  if (error) return rpcErrorResponse(error, "sales_activities.insert");
  await supabase.from("sales_accounts").update({ updated_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ data }, { status: 201 });
}
