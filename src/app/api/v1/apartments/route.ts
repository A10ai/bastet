import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
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
      `)
      .order("number");

    if (propertyId) query = query.eq("property_id", propertyId);
    if (status) query = query.eq("status", status);
    if (buildingId) query = query.eq("building_id", buildingId);
    if (typeId) query = query.eq("apartment_type_id", typeId);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const body = await request.json();

    const { data, error } = await supabase
      .from("apartments")
      .insert(body)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
