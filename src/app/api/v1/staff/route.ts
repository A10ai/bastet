import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const { searchParams } = request.nextUrl;
    const role = searchParams.get("role");
    const search = searchParams.get("search");
    const isActive = searchParams.get("is_active");

    let query = supabase
      .from("staff")
      .select("*")
      .order("created_at", { ascending: false });

    if (role) query = query.eq("role", role);
    if (isActive !== null && isActive !== undefined && isActive !== "") {
      query = query.eq("is_active", isActive === "true");
    }
    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`
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
      property_id,
      first_name,
      last_name,
      email,
      phone,
      role,
      department,
      language = "en",
      hire_date,
    } = body;

    if (!first_name || !last_name || !email || !role) {
      return NextResponse.json(
        { error: "Missing required fields: first_name, last_name, email, role" },
        { status: 400 }
      );
    }

    // Get default property if not provided
    let resolvedPropertyId = property_id;
    if (!resolvedPropertyId) {
      const { data: prop } = await supabase
        .from("properties")
        .select("id")
        .limit(1)
        .single();
      resolvedPropertyId = prop?.id;
    }

    const { data, error } = await supabase
      .from("staff")
      .insert({
        property_id: resolvedPropertyId,
        first_name,
        last_name,
        email,
        phone: phone || null,
        role,
        department: department || null,
        language,
        is_active: true,
        hire_date: hire_date || null,
      })
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
