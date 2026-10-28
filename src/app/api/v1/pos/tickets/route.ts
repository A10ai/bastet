import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { validateBody, formatZodErrors, posTicketSchema } from "@/lib/validation";
import { rpcErrorResponse } from "@/lib/rpc-error";
import { parsePagination, paginationMeta } from "@/lib/pagination";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

/**
 * POS tickets.
 * GET  /api/v1/pos/tickets?outlet_id=&date=&booking_id=   tickets for reporting (all staff)
 * POST /api/v1/pos/tickets                                 post a ticket to the in-house guest's folio (operations and above)
 *   { outlet_id, room_number | booking_id, items: [{ item_id, quantity } | { name, unit_price_gbp, quantity, tax_rate_percent? }], ticket_reference? }
 */
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ROLES.ALL_STAFF);
  if (!auth.authenticated) return auth.error!;
  const q = request.nextUrl.searchParams;
  const pagination = parsePagination(q);
  const supabase = await createServerSupabaseClient();
  let query = supabase.from("pos_tickets").select("*, outlet:pos_outlets(name, type), booking:bookings(reference, apartment:apartments(number))", { count: "exact" }).order("created_at", { ascending: false }).range(pagination.offset, pagination.offset + pagination.limit - 1);
  if (q.get("outlet_id")) query = query.eq("outlet_id", q.get("outlet_id")!);
  if (q.get("booking_id")) query = query.eq("booking_id", q.get("booking_id")!);
  if (q.get("date")) query = query.eq("business_date", q.get("date")!);
  const { data, error, count } = await query;
  if (error) return rpcErrorResponse(error, "pos_tickets.select");
  return NextResponse.json({ data: data || [], meta: paginationMeta(pagination, count ?? null, (data || []).length) });
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ROLES.OPERATIONS);
  if (!auth.authenticated) return auth.error!;
  try {
    const body = await request.json().catch(() => null);
    const validation = validateBody(posTicketSchema, body);
    if (!validation.success) return NextResponse.json({ error: "Validation failed", details: formatZodErrors(validation.error) }, { status: 400 });
    const input = validation.data;
    const supabase = await createServerSupabaseClient();

    let bookingId = input.booking_id ?? null;
    if (!bookingId && input.room_number) {
      const { data: apt } = await supabase.from("apartments").select("id, number").ilike("number", input.room_number).maybeSingle();
      if (!apt) return NextResponse.json({ error: { code: "NOT_FOUND", message: `No room ${input.room_number}` } }, { status: 404 });
      const { data: b } = await supabase.from("bookings").select("id").eq("apartment_id", apt.id).eq("status", "checked_in").order("check_in", { ascending: false }).limit(1).maybeSingle();
      if (!b) return NextResponse.json({ error: { code: "NOT_IN_HOUSE", message: `Room ${apt.number} has no guest in house` } }, { status: 409 });
      bookingId = b.id;
    }
    const { data, error } = await supabase.rpc("post_pos_ticket", {
      p_outlet_id: input.outlet_id,
      p_booking_id: bookingId,
      p_items: input.items,
      p_ticket_reference: input.ticket_reference ?? null,
      p_posted_by: auth.staffId ?? null,
      p_posted_by_name: auth.email ?? "pos",
    });
    if (error) return rpcErrorResponse(error, "post_pos_ticket");
    // A retried ticket reference returns the original ticket (00034); it was
    // charged and audited the first time.
    if (data?.duplicate) return NextResponse.json({ data }, { status: 200 });
    await logAudit(supabase, {
      user_id: auth.userId,
      user_email: auth.email,
      action: "pos.ticket_post",
      category: "finance",
      resource_type: "pos_ticket",
      resource_id: data.ticket_id,
      description: `${data.outlet}: ${data.total_gbp} GBP posted to ${data.reference}`,
      new_data: data,
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    logger.error({ err: String(err) }, "[pos/tickets] POST failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
