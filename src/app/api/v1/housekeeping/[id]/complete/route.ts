import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";
import { emitEvent } from "@/lib/event-bus";

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
      .select("id, status, apartment_id")
      .eq("id", params.id)
      .single();

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    if (task.status !== "in_progress") {
      return NextResponse.json(
        { error: `Cannot complete task with status: ${task.status}. Must be in_progress.` },
        { status: 400 }
      );
    }

    // Update task
    const { data, error } = await supabase
      .from("housekeeping_tasks")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", params.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Set apartment to available
    await supabase
      .from("apartments")
      .update({ status: "available" })
      .eq("id", task.apartment_id);

    // Emit event bus event
    await emitEvent("housekeeping.completed", "housekeeping", {
      task_id: params.id,
      apartment_id: task.apartment_id,
    }, supabase);

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
