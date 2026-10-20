import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { validateBody, formatZodErrors, createGroupSchema } from "@/lib/validation";
import { rpcErrorResponse } from "@/lib/rpc-error";
import { parsePagination, paginationMeta } from "@/lib/pagination";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

/**
 * Group bookings (migration 00028).
 *
 * GET  /api/v1/groups?status=&from=&to=      groups with room counts and balances (all staff)
 * POST /api/v1/groups                        create a group, optionally blocking rooms at once (front desk and above)
 */
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ROLES.ALL_STAFF);
  if (!auth.authenticated) return auth.error!;
  try {
    const supabase = await createServerSupabaseClient();
    const q = request.nextUrl.searchParams;
    const pagination = parsePagination(q);
    const { limit, offset } = pagination;
    let query = supabase.from("booking_groups").select("*", { count: "exact" }).order("check_in", { ascending: false }).range(offset, offset + limit - 1);
    if (auth.propertyId) query = query.eq("property_id", auth.propertyId);
    if (q.get("status")) query = query.eq("status", q.get("status")!);
    if (q.get("from")) query = query.gte("check_out", q.get("from")!);
    if (q.get("to")) query = query.lte("check_in", q.get("to")!);
    const { data, error, count } = await query;
    if (error) return rpcErrorResponse(error, "booking_groups.select");

    const ids = (data || []).map((g) => g.id);
    const counts: Record<string, { rooms: number; contract: number }> = {};
    if (ids.length) {
      const { data: rooms } = await supabase.from("bookings").select("group_id, total_amount_gbp, status").in("group_id", ids).not("status", "in", "(cancelled,no_show)");
      for (const r of rooms || []) {
        const c = (counts[r.group_id as string] ||= { rooms: 0, contract: 0 });
        c.rooms += 1;
        c.contract += Number(r.total_amount_gbp || 0);
      }
    }
    const enriched = (data || []).map((g) => ({ ...g, rooms_blocked: counts[g.id]?.rooms ?? 0, contract_total_gbp: Math.round((counts[g.id]?.contract ?? 0) * 100) / 100 }));
    return NextResponse.json({ data: enriched, meta: paginationMeta(pagination, count ?? null, enriched.length) });
  } catch (err) {
    logger.error({ err: String(err) }, "[groups] GET failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ROLES.FRONT_DESK);
  if (!auth.authenticated) return auth.error!;
  try {
    const body = await request.json();
    const validation = validateBody(createGroupSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: "Validation failed", details: formatZodErrors(validation.error) }, { status: 400 });
    }
    const { apartment_ids, adults, property_id, ...fields } = validation.data;
    const propertyId = property_id || auth.propertyId;
    if (!propertyId) return NextResponse.json({ error: "No property for this staff member" }, { status: 400 });

    const supabase = await createServerSupabaseClient();
    const { data: ref, error: refError } = await supabase.rpc("next_group_reference");
    if (refError) return rpcErrorResponse(refError, "next_group_reference");
    const { data: group, error } = await supabase
      .from("booking_groups")
      .insert({ ...fields, property_id: propertyId, reference: ref, created_by: auth.staffId ?? null })
      .select("*")
      .single();
    if (error) return rpcErrorResponse(error, "booking_groups.insert");

    let rooms: unknown = null;
    if (apartment_ids && apartment_ids.length) {
      const { data: added, error: addError } = await supabase.rpc("add_group_rooms", {
        p_group_id: group.id,
        p_apartment_ids: apartment_ids,
        p_guest_ids: null,
        p_adults: adults,
        p_rate_plan_id: null,
      });
      if (addError) {
        // The group shell is useless without its rooms: remove it so the caller can retry cleanly.
        await supabase.from("booking_groups").delete().eq("id", group.id);
        return rpcErrorResponse(addError, "add_group_rooms");
      }
      rooms = added;
    }

    await logAudit(supabase, {
      user_id: auth.userId,
      user_email: auth.email,
      action: "group.create",
      category: "booking",
      resource_type: "booking_group",
      resource_id: group.id,
      description: `Created group ${group.reference} (${group.name}) ${group.check_in} to ${group.check_out}`,
      new_data: { ...group, rooms },
    });
    return NextResponse.json({ data: { ...group, rooms } }, { status: 201 });
  } catch (err) {
    logger.error({ err: String(err) }, "[groups] POST failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
