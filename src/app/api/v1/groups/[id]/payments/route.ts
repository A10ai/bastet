import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { validateBody, formatZodErrors, groupPaymentSchema } from "@/lib/validation";
import { rpcErrorResponse } from "@/lib/rpc-error";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

/**
 * POST /api/v1/groups/:id/payments  { amount_gbp, method, reference?, notes? }
 *
 * One payment from the organiser, allocated across the rooms that owe money
 * (largest balance first). Each allocation is a normal folio payment line, so
 * refunds, invoices and reports see nothing special. Front desk and above.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(request, ROLES.FRONT_DESK);
  if (!auth.authenticated) return auth.error!;
  const { id } = await ctx.params;
  try {
    const body = await request.json();
    const validation = validateBody(groupPaymentSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: "Validation failed", details: formatZodErrors(validation.error) }, { status: 400 });
    }
    const input = validation.data;
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("record_group_payment", {
      p_group_id: id,
      p_amount_gbp: input.amount_gbp,
      p_method: input.method,
      p_reference: input.reference ?? null,
      p_received_by: auth.staffId ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) return rpcErrorResponse(error, "record_group_payment");
    await logAudit(supabase, {
      user_id: auth.userId,
      user_email: auth.email,
      action: "group.payment",
      category: "finance",
      resource_type: "booking_group",
      resource_id: id,
      description: `Group payment ${input.amount_gbp} GBP by ${input.method}`,
      new_data: data,
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    logger.error({ err: String(err) }, "[groups/payments] POST failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
