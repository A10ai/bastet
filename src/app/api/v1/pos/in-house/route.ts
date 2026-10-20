import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { rpcErrorResponse } from "@/lib/rpc-error";

/**
 * GET /api/v1/pos/in-house?room=B416
 *
 * Who is in a room right now, for the till: booking, guest name and folio
 * balance. Operations staff and above (housekeeping posts minibar).
 */
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ROLES.OPERATIONS);
  if (!auth.authenticated) return auth.error!;
  const room = (request.nextUrl.searchParams.get("room") || "").trim();
  if (!room) return NextResponse.json({ error: "room is required" }, { status: 400 });
  const supabase = await createServerSupabaseClient();
  const { data: apt, error: aptError } = await supabase.from("apartments").select("id, number").ilike("number", room).maybeSingle();
  if (aptError) return rpcErrorResponse(aptError, "apartments.select");
  if (!apt) return NextResponse.json({ error: { code: "NOT_FOUND", message: `No room ${room}` } }, { status: 404 });
  const { data: b } = await supabase
    .from("bookings")
    .select("id, reference, check_in, check_out, guest:guests(first_name, last_name)")
    .eq("apartment_id", apt.id)
    .eq("status", "checked_in")
    .order("check_in", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!b) return NextResponse.json({ error: { code: "NOT_IN_HOUSE", message: `Room ${apt.number} has no guest in house` } }, { status: 404 });
  const { data: folio } = await supabase.from("folios").select("id").eq("booking_id", b.id).maybeSingle();
  let balance: number | null = null;
  if (folio) {
    const { data: bal } = await supabase.rpc("folio_balance", { p_folio_id: folio.id });
    balance = bal === null || bal === undefined ? null : Number(bal);
  }
  const g = b.guest as unknown as { first_name: string | null; last_name: string | null } | null;
  return NextResponse.json({ data: { booking_id: b.id, reference: b.reference, room_number: apt.number, guest_name: g ? `${g.first_name ?? ""} ${g.last_name ?? ""}`.trim() || null : null, check_in: b.check_in, check_out: b.check_out, folio_balance_gbp: balance } });
}
