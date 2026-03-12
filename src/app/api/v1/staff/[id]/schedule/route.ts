import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerSupabaseClient();
    const { searchParams } = request.nextUrl;
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");

    let query = supabase
      .from("staff_schedules")
      .select("*")
      .eq("staff_id", params.id)
      .order("date", { ascending: true });

    if (dateFrom) query = query.gte("date", dateFrom);
    if (dateTo) query = query.lte("date", dateTo);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerSupabaseClient();
    const body = await request.json();

    const { date, shift_start, shift_end, shift_type = "regular", notes } = body;

    if (!date || !shift_start || !shift_end) {
      return NextResponse.json(
        { error: "Missing required fields: date, shift_start, shift_end" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("staff_schedules")
      .insert({
        staff_id: params.id,
        date,
        shift_start,
        shift_end,
        shift_type,
        status: "scheduled",
        notes: notes || null,
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
