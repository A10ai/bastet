import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();

    const { data: task } = await supabase
      .from("housekeeping_tasks")
      .select("id, status, assigned_to")
      .eq("id", params.id)
      .single();

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    if (task.status !== "assigned") {
      return NextResponse.json(
        { error: `Cannot start task with status: ${task.status}. Must be assigned.` },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("housekeeping_tasks")
      .update({
        status: "in_progress",
        started_at: new Date().toISOString(),
      })
      .eq("id", params.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logAudit(supabase, {
      action: "housekeeping.start",
      category: "housekeeping",
      resource_type: "housekeeping_task",
      resource_id: data?.id || params.id,
      description: `Started housekeeping task ${params.id}`,
      new_data: { status: "in_progress" },
    });

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
