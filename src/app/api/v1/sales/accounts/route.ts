import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { parsePagination, paginationMeta } from "@/lib/pagination";
import { validateBody, formatZodErrors, salesAccountSchema } from "@/lib/validation";
import { rpcErrorResponse } from "@/lib/rpc-error";
import { logAudit } from "@/lib/audit";

/**
 * GET  /api/v1/sales/accounts?stage=&kind=&market=&search=   (front desk+)
 * POST /api/v1/sales/accounts                                (front desk+)
 * The inbound operator pipeline: tour operators, bed banks, corporates.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ROLES.FRONT_DESK);
  if (!auth.authenticated) return auth.error!;
  const supabase = await createServerSupabaseClient();
  const q = request.nextUrl.searchParams;
  let query = supabase.from("sales_accounts").select("*, contacts:sales_contacts(id, name, role, email, is_primary), owner:staff(id, first_name, last_name)", { count: "exact" }).order("priority").order("next_action_at", { ascending: true, nullsFirst: false }).order("updated_at", { ascending: false });
  for (const k of ["stage", "kind", "market"]) if (q.get(k)) query = query.eq(k, q.get(k)!);
  if (q.get("search")) query = query.ilike("name", `%${q.get("search")!.replace(/[%_]/g, "")}%`);
  const pagination = parsePagination(q);
  query = query.range(pagination.offset, pagination.offset + pagination.limit - 1);
  const { data, error, count } = await query;
  if (error) return rpcErrorResponse(error, "sales_accounts.select");
  return NextResponse.json({ data: data || [], meta: paginationMeta(pagination, count, (data || []).length) });
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ROLES.FRONT_DESK);
  if (!auth.authenticated) return auth.error!;
  const body = await request.json().catch(() => null);
  const validation = validateBody(salesAccountSchema, body);
  if (!validation.success) return NextResponse.json({ error: "Validation failed", details: formatZodErrors(validation.error) }, { status: 400 });
  const propertyId = validation.data.property_id ?? auth.propertyId;
  if (!propertyId) return NextResponse.json({ error: { code: "VALIDATION", message: "property_id is required" } }, { status: 400 });
  const supabase = await createServerSupabaseClient();
  const { property_id: _p, ...rest } = validation.data;
  void _p;
  const { data, error } = await supabase.from("sales_accounts").insert({ ...rest, property_id: propertyId, owner_staff_id: auth.staffId ?? null }).select("*").single();
  if (error) return rpcErrorResponse(error, "sales_accounts.insert");
  await supabase.from("sales_activities").insert({ account_id: data.id, property_id: propertyId, kind: "stage_change", summary: `Account created at stage ${rest.stage}`, staff_id: auth.staffId ?? null });
  await logAudit(supabase, { user_id: auth.userId, user_email: auth.email, action: "sales.account_created", category: "settings", resource_type: "sales_account", resource_id: data.id, description: `Sales account ${rest.name} (${rest.kind}, ${rest.market ?? "?"}) created` });
  return NextResponse.json({ data }, { status: 201 });
}
