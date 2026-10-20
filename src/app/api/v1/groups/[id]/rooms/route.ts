import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { validateBody, formatZodErrors, addGroupRoomsSchema } from "@/lib/validation";
import { rpcErrorResponse } from "@/lib/rpc-error";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

/**
 * POST /api/v1/groups/:id/rooms  { apartment_ids, guest_ids?, adults?, rate_plan_id? }
 *
 * Block rooms for the group in one transaction: every room is priced by the
 * group's rate plan for the group's dates; if any room overlaps an existing
 * stay nothing is created (409 DOUBLE_BOOKING). Front desk and above.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(request, ROLES.FRONT_DESK);
  if (!auth.authenticated) return auth.error!;
  const { id } = await ctx.params;
  try {
    const body = await request.json();
    const validation = validateBody(addGroupRoomsSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: "Validation failed", details: formatZodErrors(validation.error) }, { status: 400 });
    }
    const input = validation.data;
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("add_group_rooms", {
      p_group_id: id,
      p_apartment_ids: input.apartment_ids,
      p_guest_ids: input.guest_ids ?? null,
      p_adults: input.adults,
      p_rate_plan_id: input.rate_plan_id ?? null,
    });
    if (error) return rpcErrorResponse(error, "add_group_rooms");
    await logAudit(supabase, {
      user_id: auth.userId,
      user_email: auth.email,
      action: "group.add_rooms",
      category: "booking",
      resource_type: "booking_group",
      resource_id: id,
      description: `Blocked ${input.apartment_ids.length} room(s) for group ${id}`,
      new_data: data,
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    logger.error({ err: String(err) }, "[groups/rooms] POST failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
