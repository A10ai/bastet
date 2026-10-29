import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { emitEvent } from "@/lib/event-bus";
import { logAudit } from "@/lib/audit";
import { validateBody, formatZodErrors, completeSchema } from "@/lib/validation";
import { handleDbError } from "@/lib/api-error";

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await requireRole(request, ROLES.OPERATIONS);
    if (!auth.authenticated) return auth.error!;
    const supabase = await createServerSupabaseClient();
    const body = await request.json().catch(() => ({}));

    const validation = validateBody(completeSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
    }
    // validation successful — notes/rating available if provided

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
      return handleDbError(error, "housekeeping.id.complete");
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

    await logAudit(supabase, {
      action: "housekeeping.complete",
      category: "housekeeping",
      resource_type: "housekeeping_task",
      resource_id: data?.id || params.id,
      description: `Completed housekeeping task ${params.id}`,
      new_data: { status: "completed" },
    });

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
