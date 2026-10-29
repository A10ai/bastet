import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";
import { validateBody, formatZodErrors, createApartmentTypeSchema } from "@/lib/validation";
import { handleDbError } from "@/lib/api-error";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(request, ROLES.ALL_STAFF);
    if (!auth.authenticated) return auth.error!;
    const supabase = await createServerSupabaseClient();
    const propertyId = request.nextUrl.searchParams.get("property_id");

    let query = supabase.from("apartment_types").select("*").order("name");
    if (propertyId) {
      query = query.eq("property_id", propertyId);
    }

    const { data, error } = await query;
    if (error) {
      return handleDbError(error, "apartment-types");
    }
    return NextResponse.json({ data });
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

    const validation = validateBody(createApartmentTypeSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
    }
    const validated = validation.data;

    const { data, error } = await supabase
      .from("apartment_types")
      .insert(validated)
      .select()
      .single();

    if (error) {
      return handleDbError(error, "apartment-types");
    }

    await logAudit(supabase, {
      action: "apartment_type.create",
      category: "settings",
      resource_type: "apartment_type",
      resource_id: data?.id,
      description: `Created apartment type ${data?.name || ""}`,
      new_data: body,
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
