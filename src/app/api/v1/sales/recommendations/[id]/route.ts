import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole, ROLES } from "@/lib/api-auth";
import { validateBody, formatZodErrors, recommendationActionSchema } from "@/lib/validation";
import { applyRecommendation, rejectRecommendation } from "@/lib/pricing-agent";
import { logAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/sales/recommendations/:id { action: approve | reject, rate_gbp? }   (manager and above)
 *
 * Approving writes the agent rate for the window (optionally at an edited
 * rate, still inside the band) and records the decision; rejecting closes
 * it. RLS confirms the recommendation belongs to the caller's property.
 */
export async function POST(request: NextRequest, ctx: Ctx) {
  const auth = await requireRole(request, ROLES.MANAGEMENT);
  if (!auth.authenticated) return auth.error!;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const validation = validateBody(recommendationActionSchema, body);
  if (!validation.success) return NextResponse.json({ error: "Validation failed", details: formatZodErrors(validation.error) }, { status: 400 });
  const supabase = await createServerSupabaseClient();
  const { data: rec } = await supabase.from("rate_recommendations").select("id, status, floor_gbp, ceiling_gbp, recommended_rate_gbp, apartment_type_id, stay_from, stay_to").eq("id", id).maybeSingle();
  if (!rec) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Recommendation not found" } }, { status: 404 });
  if (rec.status !== "pending") return NextResponse.json({ error: { code: "INVALID_STATUS", message: `Recommendation is ${rec.status}` } }, { status: 409 });

  const admin = createAdminClient();
  if (validation.data.action === "reject") {
    const r = await rejectRecommendation(admin, id, auth.staffId ?? null);
    if (!r.ok) return NextResponse.json({ error: { code: "INVALID_STATUS", message: r.error } }, { status: 409 });
    await logAudit(supabase, { user_id: auth.userId, user_email: auth.email, action: "pricing.recommendation_rejected", category: "settings", resource_type: "rate_recommendation", resource_id: id, description: `Rejected ${rec.stay_from}..${rec.stay_to} at ${rec.recommended_rate_gbp} GBP` });
    return NextResponse.json({ data: { id, status: "rejected" } });
  }

  if (validation.data.rate_gbp !== undefined) {
    const rate = validation.data.rate_gbp;
    if (rate < Number(rec.floor_gbp) || rate > Number(rec.ceiling_gbp)) {
      return NextResponse.json({ error: { code: "OUT_OF_BAND", message: `Rate must be between ${rec.floor_gbp} and ${rec.ceiling_gbp} GBP` } }, { status: 409 });
    }
    await admin.from("rate_recommendations").update({ recommended_rate_gbp: rate }).eq("id", id);
  }
  const r = await applyRecommendation(admin, id, auth.staffId ?? null, false);
  if (r.error) {
    const code = r.error.split(":")[0];
    return NextResponse.json({ error: { code, message: r.error } }, { status: code === "OUT_OF_BAND" || code === "INVALID_STATUS" ? 409 : 500 });
  }
  await logAudit(supabase, { user_id: auth.userId, user_email: auth.email, action: "pricing.recommendation_approved", category: "settings", resource_type: "rate_recommendation", resource_id: id, description: `Approved ${rec.stay_from}..${rec.stay_to} at ${validation.data.rate_gbp ?? rec.recommended_rate_gbp} GBP (rate ${r.rate_id})` });
  return NextResponse.json({ data: { id, status: "approved", rate_id: r.rate_id } });
}
