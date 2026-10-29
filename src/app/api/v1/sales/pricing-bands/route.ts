import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { validateBody, formatZodErrors, pricingBandSchema } from "@/lib/validation";
import { rpcErrorResponse } from "@/lib/rpc-error";
import { logAudit } from "@/lib/audit";

/**
 * GET /api/v1/sales/pricing-bands   (all staff)   bands for the property; apartment_type_id null = default
 * PUT /api/v1/sales/pricing-bands   (manager+)    create or replace one band
 *
 * The band is the owner's control over the agent: floor, ceiling, premium
 * target over competitors, maximum move per day and whether the agent may
 * apply rates without approval.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ROLES.ALL_STAFF);
  if (!auth.authenticated) return auth.error!;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("pricing_bands").select("*, apartment_type:apartment_types(name)").order("apartment_type_id", { nullsFirst: true });
  if (error) return rpcErrorResponse(error, "pricing_bands.select");
  return NextResponse.json({ data: data || [] });
}

export async function PUT(request: NextRequest) {
  const auth = await requireRole(request, ROLES.MANAGEMENT);
  if (!auth.authenticated) return auth.error!;
  const body = await request.json().catch(() => null);
  const validation = validateBody(pricingBandSchema, body);
  if (!validation.success) return NextResponse.json({ error: "Validation failed", details: formatZodErrors(validation.error) }, { status: 400 });
  const input = validation.data;
  const propertyId = input.property_id ?? auth.propertyId;
  if (!propertyId) return NextResponse.json({ error: { code: "VALIDATION", message: "property_id is required" } }, { status: 400 });
  const supabase = await createServerSupabaseClient();
  const { property_id: _p, ...rest } = input;
  void _p;
  let existing = supabase.from("pricing_bands").select("id").eq("property_id", propertyId);
  existing = rest.apartment_type_id ? existing.eq("apartment_type_id", rest.apartment_type_id) : existing.is("apartment_type_id", null);
  const { data: found } = await existing.maybeSingle();
  const payload = { ...rest, property_id: propertyId, apartment_type_id: rest.apartment_type_id ?? null };
  const { data, error } = found
    ? await supabase.from("pricing_bands").update(payload).eq("id", found.id).select("*").single()
    : await supabase.from("pricing_bands").insert(payload).select("*").single();
  if (error) return rpcErrorResponse(error, "pricing_bands.upsert");
  await logAudit(supabase, { user_id: auth.userId, user_email: auth.email, action: "pricing.band_set", category: "settings", resource_type: "pricing_band", resource_id: data.id, description: `Pricing band ${rest.apartment_type_id ? "for type " + rest.apartment_type_id : "(default)"}: ${rest.floor_gbp}-${rest.ceiling_gbp} GBP, +${rest.target_premium_percent}% vs comp, max ${rest.max_daily_change_percent}%/day, auto_apply=${rest.auto_apply}` });
  return NextResponse.json({ data }, { status: found ? 200 : 201 });
}
