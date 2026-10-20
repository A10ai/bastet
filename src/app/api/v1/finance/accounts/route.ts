import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { rpcErrorResponse } from "@/lib/rpc-error";
import { logAudit } from "@/lib/audit";
import { validateBody, formatZodErrors } from "@/lib/validation";
import { DEFAULT_ACCOUNTS } from "@/lib/accounting";

/**
 * Chart of accounts used by the accounting export (migration 00031).
 * GET /api/v1/finance/accounts          the property's accounts (defaults created on first read); manager and above
 * PUT /api/v1/finance/accounts          { accounts: [{ key, code, name }] } rename codes to match the accounting package
 */
const schema = z.object({ accounts: z.array(z.object({ key: z.enum(DEFAULT_ACCOUNTS.map((a) => a.key) as [string, ...string[]]), code: z.string().min(1).max(20), name: z.string().min(1).max(100) })).min(1).max(50) });

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ROLES.MANAGEMENT);
  if (!auth.authenticated) return auth.error!;
  if (!auth.propertyId) return NextResponse.json({ error: "No property for this staff member" }, { status: 400 });
  const supabase = await createServerSupabaseClient();
  await supabase.rpc("ensure_default_gl_accounts", { p_property_id: auth.propertyId });
  const { data, error } = await supabase.from("gl_accounts").select("key, code, name, kind").eq("property_id", auth.propertyId).order("code");
  if (error) return rpcErrorResponse(error, "gl_accounts.select");
  return NextResponse.json({ data });
}

export async function PUT(request: NextRequest) {
  const auth = await requireRole(request, ROLES.MANAGEMENT);
  if (!auth.authenticated) return auth.error!;
  if (!auth.propertyId) return NextResponse.json({ error: "No property for this staff member" }, { status: 400 });
  const validation = validateBody(schema, await request.json().catch(() => null));
  if (!validation.success) return NextResponse.json({ error: "Validation failed", details: formatZodErrors(validation.error) }, { status: 400 });
  const supabase = await createServerSupabaseClient();
  for (const a of validation.data.accounts) {
    const { error } = await supabase.from("gl_accounts").update({ code: a.code, name: a.name }).eq("property_id", auth.propertyId).eq("key", a.key);
    if (error) return rpcErrorResponse(error, "gl_accounts.update");
  }
  await logAudit(supabase, { user_id: auth.userId, user_email: auth.email, action: "finance.accounts_update", category: "finance", resource_type: "gl_accounts", description: `Updated ${validation.data.accounts.length} account code(s)`, new_data: validation.data });
  const { data } = await supabase.from("gl_accounts").select("key, code, name, kind").eq("property_id", auth.propertyId).order("code");
  return NextResponse.json({ data });
}
