import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole, ROLES } from "@/lib/api-auth";
import { validateBody, formatZodErrors, reviewRespondSchema } from "@/lib/validation";
import { draftReviewReply } from "@/lib/sales-ops";
import { rpcErrorResponse } from "@/lib/rpc-error";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST  /api/v1/sales/reviews/:id   draft a reply (Claude, template fallback)   (front desk+)
 * PATCH /api/v1/sales/reviews/:id   { response } publish the reply              (front desk+)
 */
export async function POST(request: NextRequest, ctx: Ctx) {
  const auth = await requireRole(request, ROLES.FRONT_DESK);
  if (!auth.authenticated) return auth.error!;
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const { data: review } = await supabase.from("reviews").select("id, property_id").eq("id", id).maybeSingle();
  if (!review) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Review not found" } }, { status: 404 });
  try {
    const { data: prop } = await supabase.from("properties").select("name").eq("id", review.property_id).maybeSingle();
    const r = await draftReviewReply(createAdminClient(), id, prop?.name ?? "the property");
    return NextResponse.json({ data: r });
  } catch (err) {
    logger.error({ err: String(err) }, "[sales/reviews] draft failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const auth = await requireRole(request, ROLES.FRONT_DESK);
  if (!auth.authenticated) return auth.error!;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const validation = validateBody(reviewRespondSchema, body);
  if (!validation.success) return NextResponse.json({ error: "Validation failed", details: formatZodErrors(validation.error) }, { status: 400 });
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("reviews").update({ response: validation.data.response, responded_at: new Date().toISOString() }).eq("id", id).select("id, source, response, responded_at").maybeSingle();
  if (error) return rpcErrorResponse(error, "reviews.update");
  if (!data) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Review not found" } }, { status: 404 });
  await logAudit(supabase, { user_id: auth.userId, user_email: auth.email, action: "reviews.responded", category: "guest", resource_type: "review", resource_id: id, description: `Reply published for ${data.source} review${data.source !== "portal" && data.source !== "direct" ? " (copy it to the OTA extranet)" : ""}` });
  return NextResponse.json({ data });
}
