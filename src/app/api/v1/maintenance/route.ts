import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status");
    const category = searchParams.get("category");
    const priority = searchParams.get("priority");
    const search = searchParams.get("search");

    let query = supabase
      .from("maintenance_requests")
      .select(`
        *,
        apartment:apartments(id, number, floor, building:buildings(id, name, code)),
        assigned_staff:staff!maintenance_requests_assigned_to_fkey(id, first_name, last_name, role)
      `)
      .order("created_at", { ascending: false });

    if (status) query = query.eq("status", status);
    if (category) query = query.eq("category", category);
    if (priority) query = query.eq("priority", priority);
    if (search) {
      query = query.or(
        `title.ilike.%${search}%,description.ilike.%${search}%`
      );
    }

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

    const {
      apartment_id,
      category,
      priority = "normal",
      title,
      description,
      reported_by_staff,
      reported_by_guest,
      estimated_cost_gbp,
    } = body;

    if (!title || !description || !category) {
      return NextResponse.json(
        { error: "Missing required fields: title, description, category" },
        { status: 400 }
      );
    }

    // Get property_id
    let propertyId: string | null = null;
    if (apartment_id) {
      const { data: apartment } = await supabase
        .from("apartments")
        .select("property_id")
        .eq("id", apartment_id)
        .single();
      propertyId = apartment?.property_id || null;
    }
    if (!propertyId) {
      const { data: prop } = await supabase
        .from("properties")
        .select("id")
        .limit(1)
        .single();
      propertyId = prop?.id || null;
    }

    const { data, error } = await supabase
      .from("maintenance_requests")
      .insert({
        property_id: propertyId,
        apartment_id: apartment_id || null,
        category,
        priority,
        status: "open",
        title,
        description,
        reported_by_staff: reported_by_staff || null,
        reported_by_guest: reported_by_guest || null,
        estimated_cost_gbp: estimated_cost_gbp || null,
      })
      .select(`
        *,
        apartment:apartments(id, number, floor, building:buildings(id, name, code)),
        assigned_staff:staff!maintenance_requests_assigned_to_fkey(id, first_name, last_name, role)
      `)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // If urgent/emergency, set apartment to maintenance
    if (apartment_id && (priority === "urgent" || priority === "emergency")) {
      await supabase
        .from("apartments")
        .update({ status: "maintenance" })
        .eq("id", apartment_id);
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
