import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { validateBody, formatZodErrors, updateGroupSchema, cancelGroupSchema } from "@/lib/validation";
import { rpcErrorResponse } from "@/lib/rpc-error";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

/**
 * One group.
 *
 * GET    /api/v1/groups/:id   statement: group, rooms with folio balances, totals (all staff)
 * PATCH  /api/v1/groups/:id   update details or confirm/complete (front desk and above)
 * DELETE /api/v1/groups/:id   cancel the group and every room not yet in house; body { reason } (front desk and above)
 */
type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  const auth = await requireRole(request, ROLES.ALL_STAFF);
  if (!auth.authenticated) return auth.error!;
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("group_statement", { p_group_id: id });
  if (error) return rpcErrorResponse(error, "group_statement");
  return NextResponse.json({ data });
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const auth = await requireRole(request, ROLES.FRONT_DESK);
  if (!auth.authenticated) return auth.error!;
  const { id } = await ctx.params;
  try {
    const body = await request.json();
    const validation = validateBody(updateGroupSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: "Validation failed", details: formatZodErrors(validation.error) }, { status: 400 });
    }
    const updates = validation.data;
    if (Object.keys(updates).length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    const supabase = await createServerSupabaseClient();
    const { data: before } = await supabase.from("booking_groups").select("*").eq("id", id).maybeSingle();
    if (!before) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Group not found" } }, { status: 404 });
    if (before.status === "cancelled") return NextResponse.json({ error: { code: "GROUP_CLOSED", message: "A cancelled group cannot be edited" } }, { status: 409 });
    if ((updates.check_in || updates.check_out)) {
      const { count } = await supabase.from("bookings").select("id", { count: "exact", head: true }).eq("group_id", id).not("status", "in", "(cancelled,no_show)");
      if ((count ?? 0) > 0) return NextResponse.json({ error: { code: "ROOMS_BLOCKED", message: "Dates cannot change while rooms are blocked; cancel or move the rooms first" } }, { status: 409 });
    }
    const { data, error } = await supabase.from("booking_groups").update(updates).eq("id", id).select("*").single();
    if (error) return rpcErrorResponse(error, "booking_groups.update");
    if (updates.status === "confirmed" && before.status !== "confirmed") {
      await supabase.from("bookings").update({ status: "confirmed" }).eq("group_id", id).eq("status", "pending");
    }
    await logAudit(supabase, {
      user_id: auth.userId,
      user_email: auth.email,
      action: "group.update",
      category: "booking",
      resource_type: "booking_group",
      resource_id: id,
      description: `Updated group ${data.reference}`,
      old_data: before,
      new_data: updates,
    });
    return NextResponse.json({ data });
  } catch (err) {
    logger.error({ err: String(err) }, "[groups] PATCH failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const auth = await requireRole(request, ROLES.FRONT_DESK);
  if (!auth.authenticated) return auth.error!;
  const { id } = await ctx.params;
  try {
    const body = await request.json().catch(() => ({}));
    const validation = validateBody(cancelGroupSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: "Validation failed", details: formatZodErrors(validation.error) }, { status: 400 });
    }
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("cancel_group", { p_group_id: id, p_reason: validation.data.reason });
    if (error) return rpcErrorResponse(error, "cancel_group");
    await logAudit(supabase, {
      user_id: auth.userId,
      user_email: auth.email,
      action: "group.cancel",
      category: "booking",
      resource_type: "booking_group",
      resource_id: id,
      description: `Cancelled group ${id}: ${validation.data.reason}`,
      new_data: data,
    });
    return NextResponse.json({ data });
  } catch (err) {
    logger.error({ err: String(err) }, "[groups] DELETE failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
