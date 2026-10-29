import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { parsePagination, paginationMeta } from "@/lib/pagination";
import { validateBody, formatZodErrors, importReviewsSchema } from "@/lib/validation";
import { rpcErrorResponse } from "@/lib/rpc-error";
import { logAudit } from "@/lib/audit";

/**
 * GET  /api/v1/sales/reviews?unanswered=1&source=     (all staff)
 * POST /api/v1/sales/reviews { reviews: [...] }      import OTA reviews, idempotent on (source, external_id) (manager+)
 */
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ROLES.ALL_STAFF);
  if (!auth.authenticated) return auth.error!;
  const supabase = await createServerSupabaseClient();
  const q = request.nextUrl.searchParams;
  let query = supabase.from("reviews").select("id, booking_id, source, external_id, reviewer_name, overall_rating, cleanliness_rating, location_rating, service_rating, value_rating, title, body, language, response, responded_at, reply_draft, reply_drafted_at, is_public, created_at", { count: "exact" }).order("created_at", { ascending: false });
  if (q.get("unanswered") === "1") query = query.is("response", null);
  if (q.get("source")) query = query.eq("source", q.get("source")!);
  const pagination = parsePagination(q);
  query = query.range(pagination.offset, pagination.offset + pagination.limit - 1);
  const { data, error, count } = await query;
  if (error) return rpcErrorResponse(error, "reviews.select");
  return NextResponse.json({ data: data || [], meta: paginationMeta(pagination, count, (data || []).length) });
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ROLES.MANAGEMENT);
  if (!auth.authenticated) return auth.error!;
  const body = await request.json().catch(() => null);
  const validation = validateBody(importReviewsSchema, body);
  if (!validation.success) return NextResponse.json({ error: "Validation failed", details: formatZodErrors(validation.error) }, { status: 400 });
  const propertyId = validation.data.property_id ?? auth.propertyId;
  if (!propertyId) return NextResponse.json({ error: { code: "VALIDATION", message: "property_id is required" } }, { status: 400 });
  const supabase = await createServerSupabaseClient();
  const rows = validation.data.reviews.map((r) => ({ ...r, property_id: propertyId, is_public: true, responded_at: r.response ? new Date().toISOString() : null }));
  const { data, error } = await supabase.from("reviews").upsert(rows, { onConflict: "source,external_id", ignoreDuplicates: true }).select("id");
  if (error) return rpcErrorResponse(error, "reviews.upsert");
  await logAudit(supabase, { user_id: auth.userId, user_email: auth.email, action: "reviews.imported", category: "guest", resource_type: "reviews", description: `${(data || []).length} review(s) imported (${rows.length} submitted)` });
  return NextResponse.json({ data: { imported: (data || []).length, submitted: rows.length } }, { status: 201 });
}
