import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { validateBody, formatZodErrors, salesContactSchema } from "@/lib/validation";
import { rpcErrorResponse } from "@/lib/rpc-error";

type Ctx = { params: Promise<{ id: string }> };

/** POST a contact on an account; DELETE ?contact_id= removes one. Front desk and above. */
export async function POST(request: NextRequest, ctx: Ctx) {
  const auth = await requireRole(request, ROLES.FRONT_DESK);
  if (!auth.authenticated) return auth.error!;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const validation = validateBody(salesContactSchema, body);
  if (!validation.success) return NextResponse.json({ error: "Validation failed", details: formatZodErrors(validation.error) }, { status: 400 });
  const supabase = await createServerSupabaseClient();
  const { data: account } = await supabase.from("sales_accounts").select("id, property_id").eq("id", id).maybeSingle();
  if (!account) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Account not found" } }, { status: 404 });
  if (validation.data.is_primary) await supabase.from("sales_contacts").update({ is_primary: false }).eq("account_id", id);
  const { data, error } = await supabase.from("sales_contacts").insert({ ...validation.data, account_id: id, property_id: account.property_id }).select("*").single();
  if (error) return rpcErrorResponse(error, "sales_contacts.insert");
  return NextResponse.json({ data }, { status: 201 });
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const auth = await requireRole(request, ROLES.FRONT_DESK);
  if (!auth.authenticated) return auth.error!;
  const { id } = await ctx.params;
  const contactId = request.nextUrl.searchParams.get("contact_id");
  if (!contactId) return NextResponse.json({ error: { code: "VALIDATION", message: "contact_id is required" } }, { status: 400 });
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("sales_contacts").delete().eq("id", contactId).eq("account_id", id).select("id").maybeSingle();
  if (error) return rpcErrorResponse(error, "sales_contacts.delete");
  if (!data) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Contact not found" } }, { status: 404 });
  return NextResponse.json({ data: { id: contactId } });
}
