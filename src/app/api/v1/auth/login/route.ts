import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Verify the user exists in the staff table
    const { data: staffMember, error: staffError } = await supabase
      .from("staff")
      .select("*")
      .eq("email", email)
      .eq("is_active", true)
      .single();

    if (staffError || !staffMember) {
      return NextResponse.json(
        { error: "Invalid credentials or inactive account" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      data: {
        staff: {
          id: staffMember.id,
          first_name: staffMember.first_name,
          last_name: staffMember.last_name,
          role: staffMember.role,
          property_id: staffMember.property_id,
        },
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
