import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: staff, error: staffError } = await supabase
      .from("staff")
      .select("*")
      .eq("auth_user_id", user.id)
      .single();

    if (staffError || !staff) {
      return NextResponse.json({ error: "Staff profile not found" }, { status: 404 });
    }

    return NextResponse.json({
      data: {
        user: { id: user.id, email: user.email },
        staff,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
