import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { getByIdHandler } from "@/lib/crud";
import { logAudit } from "@/lib/audit";
import { validatePatchBody, formatZodErrors, createMaintenanceRequestSchema } from "@/lib/validation";

export const GET = getByIdHandler({
  table: "maintenance_requests",
  roles: ROLES.ALL_STAFF,
  select: `
        *,
        apartment:apartments(id, number, floor, status, building:buildings(id, name, code)),
        assigned_staff:staff!maintenance_requests_assigned_to_fkey(id, first_name, last_name, role, email, phone)
      `,
  label: "Maintenance request",
});

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await requireRole(request, ROLES.OPERATIONS);
    if (!auth.authenticated) return auth.error!;
    const supabase = await createServerSupabaseClient();
    const body = await request.json();

    const validation = validatePatchBody(createMaintenanceRequestSchema.partial(), body);
    if (!validation.success) {
      return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
    }
    const validated = validation.data;

    const allowedFields = [
      "priority",
      "category",
      "title",
      "description",
      "estimated_cost_gbp",
      "status",
    ];
    const updates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in validated) updates[key] = (validated as Record<string, unknown>)[key];
    }

    // Handle on_hold status transition
    if (updates.status === "on_hold") {
      const { data: current } = await supabase
        .from("maintenance_requests")
        .select("status")
        .eq("id", params.id)
        .single();
      if (!current || !["assigned", "in_progress"].includes(current.status)) {
        return NextResponse.json(
          { error: "Can only put on hold from assigned or in_progress" },
          { status: 400 }
        );
      }
    }

    const { data, error } = await supabase
      .from("maintenance_requests")
      .update(updates)
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

    await logAudit(supabase, {
      action: "maintenance.update",
      category: "maintenance",
      resource_type: "maintenance_request",
      resource_id: data?.id || params.id,
      description: `Updated maintenance request ${params.id}`,
      new_data: body,
    });

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
