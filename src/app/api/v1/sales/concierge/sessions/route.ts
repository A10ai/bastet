import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { parsePagination, paginationMeta } from "@/lib/pagination";
import { rpcErrorResponse } from "@/lib/rpc-error";

/**
 * GET /api/v1/sales/concierge/sessions?status=&session=   (front desk and above)
 * Recent concierge conversations for the property; with ?session= the
 * scrubbed transcript of one. Staff never see the encrypted WhatsApp number.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ROLES.FRONT_DESK);
  if (!auth.authenticated) return auth.error!;
  const supabase = await createServerSupabaseClient();
  const q = request.nextUrl.searchParams;
  const sessionId = q.get("session");
  if (sessionId) {
    const { data: session, error } = await supabase.from("concierge_sessions").select("id, channel, locale, status, booking_id, message_count, last_message_at, created_at").eq("id", sessionId).maybeSingle();
    if (error) return rpcErrorResponse(error, "concierge_sessions.select");
    if (!session) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Session not found" } }, { status: 404 });
    const { data: messages } = await supabase.from("concierge_messages").select("role, content, tool_calls, model, input_tokens, output_tokens, stop_reason, created_at").eq("session_id", sessionId).order("created_at");
    return NextResponse.json({ data: { session, messages: messages || [] } });
  }
  let query = supabase.from("concierge_sessions").select("id, channel, locale, status, booking_id, message_count, last_message_at, created_at", { count: "exact" }).order("last_message_at", { ascending: false, nullsFirst: false });
  if (q.get("status")) query = query.eq("status", q.get("status")!);
  const pagination = parsePagination(q);
  query = query.range(pagination.offset, pagination.offset + pagination.limit - 1);
  const { data, error, count } = await query;
  if (error) return rpcErrorResponse(error, "concierge_sessions.select");
  return NextResponse.json({ data: data || [], meta: paginationMeta(pagination, count, (data || []).length) });
}
