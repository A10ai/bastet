import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";
import { validateBody, formatZodErrors, createHousekeepingTaskSchema } from "@/lib/validation";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("housekeeping_tasks")
      .select(`
        *,
        apartment:apartments(id, number, floor, status, building:buildings(id, name, code)),
        assigned_staff:staff!housekeeping_tasks_assigned_to_fkey(id, first_name, last_name, role, email, phone)
      `)
      .eq("id", params.id)
      .single();

    if (error) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    return NextResponse.json({ data });
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

    const validation = validateBody(createHousekeepingTaskSchema.partial(), body);
    if (!validation.success) {
      return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
    }
    const validated = validation.data;

    const allowedFields = ["priority", "notes", "scheduled_date", "type"];
    const updates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in validated) updates[key] = (validated as Record<string, unknown>)[key];
    }

    const { data, error } = await supabase
      .from("housekeeping_tasks")
      .update(updates)
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

    await logAudit(supabase, {
      action: "housekeeping.update",
      category: "housekeeping",
      resource_type: "housekeeping_task",
      resource_id: data?.id || params.id,
      description: `Updated housekeeping task ${params.id}`,
      new_data: body,
    });

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
