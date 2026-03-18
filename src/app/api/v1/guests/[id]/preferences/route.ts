import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("guest_preferences")
      .select("*")
      .eq("guest_id", params.id)
      .single();

    if (error) {
      return NextResponse.json({ error: "Preferences not found" }, { status: 404 });
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

    // Upsert: update if exists, insert if not
    const { data: existing } = await supabase
      .from("guest_preferences")
      .select("id")
      .eq("guest_id", params.id)
      .single();

    let result;
    if (existing) {
      const { data, error } = await supabase
        .from("guest_preferences")
        .update({ ...body, guest_id: params.id })
        .eq("guest_id", params.id)
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      result = data;
    } else {
      const { data, error } = await supabase
        .from("guest_preferences")
        .insert({ ...body, guest_id: params.id })
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      result = data;
    }

    return NextResponse.json({ data: result });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
