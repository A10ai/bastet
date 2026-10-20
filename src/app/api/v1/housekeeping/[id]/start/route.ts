import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";
import { validateBody, formatZodErrors, simpleSchema } from "@/lib/validation";

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await requireRole(request, ROLES.OPERATIONS);
    if (!auth.authenticated) return auth.error!;
    const supabase = await createServerSupabaseClient();
    const body = await request.json().catch(() => ({}));

    const validation = validateBody(simpleSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
    }

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
