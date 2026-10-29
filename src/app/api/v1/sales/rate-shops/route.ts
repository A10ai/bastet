import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { parsePagination, paginationMeta } from "@/lib/pagination";
import { validateBody, formatZodErrors, rateShopBatchSchema } from "@/lib/validation";
import { rpcErrorResponse } from "@/lib/rpc-error";
import { logAudit } from "@/lib/audit";

/**
 * GET  /api/v1/sales/rate-shops?from=&to=&competitor=&apartment_type_id=   (all staff)
 * POST /api/v1/sales/rate-shops { shops: [...] }                           (manager and above)
 *
 * Competitor rates by stay date. Entered by hand from the OTA sites today;
 * a scraper or rate-shopping feed posts the same shape later.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ROLES.ALL_STAFF);
  if (!auth.authenticated) return auth.error!;
  const supabase = await createServerSupabaseClient();
  const q = request.nextUrl.searchParams;
  let query = supabase.from("rate_shops").select("*, apartment_type:apartment_types(name)", { count: "exact" }).order("stay_date").order("shopped_at", { ascending: false });
  if (q.get("from")) query = query.gte("stay_date", q.get("from")!);
  if (q.get("to")) query = query.lt("stay_date", q.get("to")!);
  if (q.get("competitor")) query = query.ilike("competitor", `%${q.get("competitor")!.replace(/[%_]/g, "")}%`);
  if (q.get("apartment_type_id")) query = query.eq("apartment_type_id", q.get("apartment_type_id")!);
  const pagination = parsePagination(q);
  query = query.range(pagination.offset, pagination.offset + pagination.limit - 1);
  const { data, error, count } = await query;
  if (error) return rpcErrorResponse(error, "rate_shops.select");
  return NextResponse.json({ data: data || [], meta: paginationMeta(pagination, count, (data || []).length) });
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ROLES.MANAGEMENT);
  if (!auth.authenticated) return auth.error!;
  const body = await request.json().catch(() => null);
  const validation = validateBody(rateShopBatchSchema, body);
  if (!validation.success) return NextResponse.json({ error: "Validation failed", details: formatZodErrors(validation.error) }, { status: 400 });
  const propertyId = validation.data.property_id ?? auth.propertyId;
  if (!propertyId) return NextResponse.json({ error: { code: "VALIDATION", message: "property_id is required" } }, { status: 400 });
  const supabase = await createServerSupabaseClient();
  const rows = validation.data.shops.map((s) => ({ ...s, property_id: propertyId, created_by: auth.staffId ?? null }));
  const { data, error } = await supabase.from("rate_shops").insert(rows).select("id");
  if (error) return rpcErrorResponse(error, "rate_shops.insert");
  await logAudit(supabase, { user_id: auth.userId, user_email: auth.email, action: "pricing.rate_shops_added", category: "settings", resource_type: "rate_shops", description: `${rows.length} competitor rate(s) recorded` });
  return NextResponse.json({ data: { inserted: (data || []).length } }, { status: 201 });
}
