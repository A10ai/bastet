import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";
import { validateBody, formatZodErrors, createApartmentTypeSchema } from "@/lib/validation";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("apartment_types")
      .select("*")
      .eq("id", params.id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();
    const body = await request.json();

    // Validate as partial of createApartmentTypeSchema
    const validation = validateBody(createApartmentTypeSchema.partial(), body);
    if (!validation.success) {
      return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
    }
    const validated = validation.data;

    // Only allow updating specific rate fields for safety
    const allowedFields = [
      "name",
      "base_rate_gbp",
      "base_weekly_rate_gbp",
      "base_rate",
      "base_weekly_rate",
      "max_occupancy",
      "description",
    ];
    const updates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if ((validated as Record<string, unknown>)[key] !== undefined) {
        updates[key] = (validated as Record<string, unknown>)[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("apartment_types")
      .update(updates)
      .eq("id", params.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await logAudit(supabase, {
      action: "apartment_type.update",
      category: "settings",
      resource_type: "apartment_type",
      resource_id: data?.id || params.id,
      description: `Updated apartment type ${params.id}`,
      new_data: body,
    });

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
