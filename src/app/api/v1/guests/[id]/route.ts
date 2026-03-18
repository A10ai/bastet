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

    const { data: guest, error } = await supabase
      .from("guests")
      .select(`
        *,
        segment:guest_segments(id, name, code, description)
      `)
      .eq("id", params.id)
      .single();

    if (error) {
      return NextResponse.json({ error: "Guest not found" }, { status: 404 });
    }

    // Fetch preferences
    const { data: preferences } = await supabase
      .from("guest_preferences")
      .select("*")
      .eq("guest_id", params.id)
      .single();

    // Fetch recent bookings
    const { data: bookings } = await supabase
      .from("bookings")
      .select(`
        id, reference, status, check_in, check_out, nights, total_amount_gbp,
        apartment:apartments(id, number, building:buildings(name))
      `)
      .eq("guest_id", params.id)
      .order("check_in", { ascending: false })
      .limit(10);

    return NextResponse.json({
      data: {
        ...guest,
        preferences: preferences || null,
        bookings: bookings || [],
      },
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();
    const body = await request.json();

    const allowedFields = [
      "first_name", "last_name", "email", "phone", "date_of_birth",
      "nationality", "language", "preferred_currency", "passport_number",
      "address_line1", "address_line2", "city", "country", "postcode",
      "vip_status", "notes", "marketing_consent", "segment_id",
    ];

    const updates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in body) {
        updates[key] = body[key];
      }
    }

    const { data, error } = await supabase
      .from("guests")
      .update(updates)
      .eq("id", params.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
