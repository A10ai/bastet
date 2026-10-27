import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { getByIdHandler } from "@/lib/crud";
import { logAudit } from "@/lib/audit";
import { validatePatchBody, formatZodErrors, createHousekeepingTaskSchema } from "@/lib/validation";

export const GET = getByIdHandler({
  table: "housekeeping_tasks",
  roles: ROLES.ALL_STAFF,
  select: `
        *,
        apartment:apartments(id, number, floor, status, building:buildings(id, name, code)),
        assigned_staff:staff!housekeeping_tasks_assigned_to_fkey(id, first_name, last_name, role, email, phone)
      `,
  label: "Housekeeping task",
});

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await requireRole(request, ROLES.MANAGEMENT);
    if (!auth.authenticated) return auth.error!;
    const supabase = await createServerSupabaseClient();
    const body = await request.json();

    const validation = validatePatchBody(createHousekeepingTaskSchema.partial(), body);
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
