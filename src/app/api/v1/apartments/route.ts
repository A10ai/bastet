import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { parsePagination, paginationMeta } from "@/lib/pagination";
import { logAudit } from "@/lib/audit";
import { validateBody, formatZodErrors, createApartmentSchema } from "@/lib/validation";
import { handleDbError } from "@/lib/api-error";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(request, ROLES.ALL_STAFF);
    if (!auth.authenticated) return auth.error!;
    const supabase = await createServerSupabaseClient();
    const { searchParams } = request.nextUrl;
    const propertyId = searchParams.get("property_id");
    const status = searchParams.get("status");
    const buildingId = searchParams.get("building_id");
    const typeId = searchParams.get("type_id");

    let query = supabase
      .from("apartments")
      .select(`
        *,
        building:buildings(id, name, code),
        apartment_type:apartment_types(id, name, slug, bedrooms, max_occupancy, base_weekly_rate_gbp)
      `, { count: "exact" })
      .order("number");

    if (propertyId) query = query.eq("property_id", propertyId);
    if (status) query = query.eq("status", status);
    if (buildingId) query = query.eq("building_id", buildingId);
    if (typeId) query = query.eq("apartment_type_id", typeId);

    const pagination = parsePagination(searchParams);
    query = query.range(pagination.offset, pagination.offset + pagination.limit - 1);
    const { data, error, count } = await query;
    if (error) {
      return handleDbError(error, "apartments");
    }
    return NextResponse.json({ data, meta: paginationMeta(pagination, count, (data || []).length) });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, ROLES.MANAGEMENT);
    if (!auth.authenticated) return auth.error!;
    const supabase = await createServerSupabaseClient();
    const body = await request.json();

    const validation = validateBody(createApartmentSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
    }
    const validated = validation.data;

    const { data, error } = await supabase
      .from("apartments")
      .insert(validated)
      .select()
      .single();

    if (error) {
      return handleDbError(error, "apartments");
    }

    await logAudit(supabase, {
      action: "apartment.create",
      category: "settings",
      resource_type: "apartment",
      resource_id: data?.id,
      description: `Created apartment ${data?.number || ""}`,
      new_data: body,
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
