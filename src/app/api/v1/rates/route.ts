import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();
    const { searchParams } = request.nextUrl;
    const apartmentTypeId = searchParams.get("apartment_type_id");
    const date = searchParams.get("date");

    let query = supabase
      .from("rates")
      .select("*")
      .eq("is_active", true)
      .order("start_date");

    if (apartmentTypeId) {
      query = query.eq("apartment_type_id", apartmentTypeId);
    }

    if (date) {
      query = query.lte("start_date", date).gte("end_date", date);
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
