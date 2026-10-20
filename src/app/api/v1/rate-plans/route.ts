import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { validateBody, formatZodErrors, ratePlanSchema } from "@/lib/validation";
import { rpcErrorResponse } from "@/lib/rpc-error";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

/**
 * Rate plans (migration 00027).
 *
 * GET  /api/v1/rate-plans?include_inactive=true   every plan the caller's property sells (all staff)
 * POST /api/v1/rate-plans                          create a plan (manager and above)
 */
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ROLES.ALL_STAFF);
  if (!auth.authenticated) return auth.error!;
  try {
    const supabase = await createServerSupabaseClient();
    const includeInactive = request.nextUrl.searchParams.get("include_inactive") === "true";
    let query = supabase.from("rate_plans").select("*").order("is_default", { ascending: false }).order("name");
    if (auth.propertyId) query = query.eq("property_id", auth.propertyId);
    if (!includeInactive) query = query.eq("is_active", true);
    const { data, error } = await query;
    if (error) return rpcErrorResponse(error, "rate_plans.select");
    return NextResponse.json({ data: data || [] });
  } catch (err) {
    logger.error({ err: String(err) }, "[rate-plans] GET failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ROLES.MANAGEMENT);
  if (!auth.authenticated) return auth.error!;
  try {
    const body = await request.json();
    const validation = validateBody(ratePlanSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: "Validation failed", details: formatZodErrors(validation.error) }, { status: 400 });
    }
    const input = validation.data;
    const propertyId = input.property_id || auth.propertyId;
    if (!propertyId) return NextResponse.json({ error: "No property for this staff member" }, { status: 400 });

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("rate_plans")
      .insert({ ...input, property_id: propertyId, code: input.code.toUpperCase() })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: { code: "DUPLICATE_CODE", message: `A rate plan with code ${input.code.toUpperCase()} already exists` } }, { status: 409 });
      return rpcErrorResponse(error, "rate_plans.insert");
    }

    await logAudit(supabase, {
      user_id: auth.userId,
      user_email: auth.email,
      action: "rate_plan.create",
      category: "settings",
      resource_type: "rate_plan",
      resource_id: data.id,
      description: `Created rate plan ${data.code} (${data.name})`,
      new_data: data,
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    logger.error({ err: String(err) }, "[rate-plans] POST failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
