import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { validatePatchBody, formatZodErrors, updateRatePlanSchema } from "@/lib/validation";
import { rpcErrorResponse } from "@/lib/rpc-error";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

/**
 * One rate plan.
 *
 * GET    /api/v1/rate-plans/:id   plan (all staff)
 * PATCH  /api/v1/rate-plans/:id   update fields (manager and above); sold bookings keep their snapshot
 * DELETE /api/v1/rate-plans/:id   retire: sets is_active=false; a plan that priced a booking is never removed
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(request, ROLES.ALL_STAFF);
  if (!auth.authenticated) return auth.error!;
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("rate_plans").select("*").eq("id", id).maybeSingle();
  if (error) return rpcErrorResponse(error, "rate_plans.select");
  if (!data) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Rate plan not found" } }, { status: 404 });
  return NextResponse.json({ data });
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(request, ROLES.MANAGEMENT);
  if (!auth.authenticated) return auth.error!;
  const { id } = await ctx.params;
  try {
    const body = await request.json();
    const validation = validatePatchBody(updateRatePlanSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: "Validation failed", details: formatZodErrors(validation.error) }, { status: 400 });
    }
    const { property_id: _ignored, ...updates } = validation.data;
    void _ignored;
    if (updates.code) updates.code = updates.code.toUpperCase();
    if (Object.keys(updates).length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

    const supabase = await createServerSupabaseClient();
    const { data: before } = await supabase.from("rate_plans").select("*").eq("id", id).maybeSingle();
    if (!before) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Rate plan not found" } }, { status: 404 });
    if (before.is_default && updates.is_default === false) {
      return NextResponse.json({ error: { code: "DEFAULT_REQUIRED", message: "Make another plan the default first" } }, { status: 409 });
    }
    const { data, error } = await supabase.from("rate_plans").update(updates).eq("id", id).select("*").single();
    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: { code: "DUPLICATE_CODE", message: "A rate plan with that code already exists" } }, { status: 409 });
      return rpcErrorResponse(error, "rate_plans.update");
    }
    await logAudit(supabase, {
      user_id: auth.userId,
      user_email: auth.email,
      action: "rate_plan.update",
      category: "settings",
      resource_type: "rate_plan",
      resource_id: id,
      description: `Updated rate plan ${data.code}`,
      old_data: before,
      new_data: updates,
    });
    return NextResponse.json({ data });
  } catch (err) {
    logger.error({ err: String(err) }, "[rate-plans] PATCH failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(request, ROLES.MANAGEMENT);
  if (!auth.authenticated) return auth.error!;
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const { data: plan } = await supabase.from("rate_plans").select("id, code, is_default").eq("id", id).maybeSingle();
  if (!plan) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Rate plan not found" } }, { status: 404 });
  if (plan.is_default) return NextResponse.json({ error: { code: "DEFAULT_REQUIRED", message: "The default plan cannot be retired; make another plan the default first" } }, { status: 409 });
  const { error } = await supabase.from("rate_plans").update({ is_active: false }).eq("id", id);
  if (error) return rpcErrorResponse(error, "rate_plans.retire");
  await logAudit(supabase, {
    user_id: auth.userId,
    user_email: auth.email,
    action: "rate_plan.retire",
    category: "settings",
    resource_type: "rate_plan",
    resource_id: id,
    description: `Retired rate plan ${plan.code}`,
  });
  return NextResponse.json({ data: { id, is_active: false } });
}
