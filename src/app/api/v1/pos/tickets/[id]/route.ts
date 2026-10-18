import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { validateBody, formatZodErrors, voidPosTicketSchema } from "@/lib/validation";
import { rpcErrorResponse } from "@/lib/rpc-error";
import { logAudit } from "@/lib/audit";

/**
 * One ticket.
 * GET    /api/v1/pos/tickets/:id              ticket with its lines (all staff)
 * DELETE /api/v1/pos/tickets/:id { reason }   void: reverses every folio line it posted (manager and above)
 */
type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  const auth = await requireRole(request, ROLES.ALL_STAFF);
  if (!auth.authenticated) return auth.error!;
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("pos_tickets").select("*, outlet:pos_outlets(name, type), booking:bookings(reference, apartment:apartments(number))").eq("id", id).maybeSingle();
  if (error) return rpcErrorResponse(error, "pos_tickets.select");
  if (!data) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Ticket not found" } }, { status: 404 });
  return NextResponse.json({ data });
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const auth = await requireRole(request, ROLES.MANAGEMENT);
  if (!auth.authenticated) return auth.error!;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const validation = validateBody(voidPosTicketSchema, body);
  if (!validation.success) return NextResponse.json({ error: "Validation failed", details: formatZodErrors(validation.error) }, { status: 400 });
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("void_pos_ticket", { p_ticket_id: id, p_reason: validation.data.reason, p_actor: auth.email ?? "manager" });
  if (error) return rpcErrorResponse(error, "void_pos_ticket");
  await logAudit(supabase, { user_id: auth.userId, user_email: auth.email, action: "pos.ticket_void", category: "finance", resource_type: "pos_ticket", resource_id: id, description: `Voided ticket: ${validation.data.reason}`, new_data: data });
  return NextResponse.json({ data });
}
