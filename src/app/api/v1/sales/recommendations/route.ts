import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole, ROLES } from "@/lib/api-auth";
import { parsePagination, paginationMeta } from "@/lib/pagination";
import { validateBody, formatZodErrors, recommendationsRunSchema } from "@/lib/validation";
import { generateRecommendations } from "@/lib/pricing-agent";
import { rpcErrorResponse } from "@/lib/rpc-error";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

export const maxDuration = 120;

/**
 * GET  /api/v1/sales/recommendations?status=pending   (all staff) the agent's queue
 * POST /api/v1/sales/recommendations {action:"generate"} (manager+) run the agent now
 */
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ROLES.ALL_STAFF);
  if (!auth.authenticated) return auth.error!;
  const supabase = await createServerSupabaseClient();
  const q = request.nextUrl.searchParams;
  const status = q.get("status") || "pending";
  let query = supabase.from("rate_recommendations").select("*, apartment_type:apartment_types(name)", { count: "exact" }).order("stay_from").order("apartment_type_id");
  if (status !== "all") query = query.eq("status", status);
  if (q.get("apartment_type_id")) query = query.eq("apartment_type_id", q.get("apartment_type_id")!);
  const pagination = parsePagination(q);
  query = query.range(pagination.offset, pagination.offset + pagination.limit - 1);
  const { data, error, count } = await query;
  if (error) return rpcErrorResponse(error, "rate_recommendations.select");
  return NextResponse.json({ data: data || [], meta: paginationMeta(pagination, count, (data || []).length) });
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ROLES.MANAGEMENT);
  if (!auth.authenticated) return auth.error!;
  const body = await request.json().catch(() => null);
  const validation = validateBody(recommendationsRunSchema, body);
  if (!validation.success) return NextResponse.json({ error: "Validation failed", details: formatZodErrors(validation.error) }, { status: 400 });
  const propertyId = validation.data.property_id ?? auth.propertyId;
  if (!propertyId) return NextResponse.json({ error: { code: "VALIDATION", message: "property_id is required" } }, { status: 400 });
  try {
    // The agent reads across tables and writes rates: it runs with the service role, scoped to the caller's property.
    const admin = createAdminClient();
    if (validation.data.property_id && validation.data.property_id !== auth.propertyId && !["owner", "admin"].includes(auth.role ?? "")) {
      return NextResponse.json({ error: { code: "PROPERTY_FORBIDDEN", message: "Not your property" } }, { status: 403 });
    }
    const result = await generateRecommendations(admin, propertyId, { actor: auth.email ?? auth.userId ?? null });
    await logAudit(admin, { user_id: auth.userId, user_email: auth.email, action: "pricing.agent_run", category: "settings", resource_type: "property", resource_id: propertyId, description: `Pricing agent run ${result.batch_id}: ${result.pending} pending, ${result.auto_applied} auto-applied, ${result.unchanged} unchanged`, metadata: result as unknown as Record<string, unknown> });
    return NextResponse.json({ data: result });
  } catch (err) {
    logger.error({ err: String(err) }, "[sales/recommendations] generate failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
