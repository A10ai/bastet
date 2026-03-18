import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
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

    if (!["housekeeping", "manager"].includes(staffMember.role)) {
      return NextResponse.json(
        { error: "Only housekeeping or manager roles can be assigned to housekeeping tasks" },
        { status: 400 }
      );
    }

    if (!staffMember.is_active) {
      return NextResponse.json({ error: "Staff member is inactive" }, { status: 400 });
    }

    // Get current task
    const { data: task } = await supabase
      .from("housekeeping_tasks")
      .select("id, status")
      .eq("id", params.id)
      .single();

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    if (!["pending", "assigned"].includes(task.status)) {
      return NextResponse.json(
        { error: `Cannot assign task with status: ${task.status}` },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("housekeeping_tasks")
      .update({ assigned_to: staff_id, status: "assigned" })
      .eq("id", params.id)
      .select(`
        *,
        apartment:apartments(id, number, building:buildings(id, name, code)),
        assigned_staff:staff!housekeeping_tasks_assigned_to_fkey(id, first_name, last_name, role)
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
