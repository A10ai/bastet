import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerSupabaseClient();
    const body = await request.json();
    const { staff_id } = body;

    if (!staff_id) {
      return NextResponse.json({ error: "Missing staff_id" }, { status: 400 });
    }

    // Validate staff role
    const { data: staffMember } = await supabase
      .from("staff")
      .select("id, role, is_active")
      .eq("id", staff_id)
      .single();

    if (!staffMember) {
      return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
    }

    if (!["maintenance", "manager"].includes(staffMember.role)) {
      return NextResponse.json(
        { error: "Only maintenance or manager roles can be assigned to maintenance requests" },
        { status: 400 }
      );
    }

    if (!staffMember.is_active) {
      return NextResponse.json({ error: "Staff member is inactive" }, { status: 400 });
    }

    // Get current request
    const { data: req } = await supabase
      .from("maintenance_requests")
      .select("id, status")
      .eq("id", params.id)
      .single();

    if (!req) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    if (!["open", "assigned", "on_hold"].includes(req.status)) {
      return NextResponse.json(
        { error: `Cannot assign request with status: ${req.status}` },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("maintenance_requests")
      .update({
        assigned_to: staff_id,
        status: "assigned",
      })
      .eq("id", params.id)
      .select(`
        *,
        apartment:apartments(id, number, building:buildings(id, name, code)),
        assigned_staff:staff!maintenance_requests_assigned_to_fkey(id, first_name, last_name, role)
      `)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
