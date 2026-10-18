import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { getByIdHandler } from "@/lib/crud";
import { logAudit } from "@/lib/audit";
import { validateBody, formatZodErrors, updateStaffSchema } from "@/lib/validation";

export const GET = getByIdHandler({
  table: "staff",
  roles: ROLES.MANAGEMENT,
  label: "Staff member",
});

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await requireRole(request, ROLES.ADMIN);
    if (!auth.authenticated) return auth.error!;
    const supabase = await createServerSupabaseClient();
    const body = await request.json();

    const validation = validateBody(updateStaffSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
    }
    const validated = validation.data;

    const allowedFields = [
      "first_name",
      "last_name",
      "email",
      "phone",
      "role",
      "department",
      "is_active",
      "language",
      "hire_date",
    ];
    const updates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in validated) {
        updates[key] = (validated as Record<string, unknown>)[key];
      }
    }

    const { data, error } = await supabase
      .from("staff")
      .update(updates)
      .eq("id", params.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await logAudit(supabase, {
      action: "staff.update",
      category: "settings",
      resource_type: "staff",
      resource_id: data?.id || params.id,
      description: `Updated staff member ${params.id}`,
      new_data: body,
    });

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
