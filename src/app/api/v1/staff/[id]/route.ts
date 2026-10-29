import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES, canManageRole } from "@/lib/api-auth";
import { getByIdHandler } from "@/lib/crud";
import { logAudit } from "@/lib/audit";
import { revokeStaffAccess } from "@/lib/staff-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { validatePatchBody, formatZodErrors, updateStaffSchema } from "@/lib/validation";

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

    const validation = validatePatchBody(updateStaffSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
    }
    const validated = validation.data;

    // Same rules as /api/v1/admin/users: only accounts and roles below your own.
    const { data: target } = await supabase.from("staff").select("id, role, is_active, auth_user_id").eq("id", params.id).maybeSingle();
    if (!target) return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
    const self = target.id === auth.staffId;
    if (self && (validated.role !== undefined || validated.is_active !== undefined)) {
      return NextResponse.json({ error: "You cannot change your own role or active status" }, { status: 403 });
    }
    if (!self && !canManageRole(auth.role, target.role as string)) {
      return NextResponse.json({ error: "You can only manage accounts with a role below your own" }, { status: 403 });
    }
    if (validated.role !== undefined && !canManageRole(auth.role, validated.role)) {
      return NextResponse.json({ error: "You can only assign roles below your own" }, { status: 403 });
    }

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

    // Deactivation ends the person's access now, not when their token expires.
    if (validated.is_active === false && target.is_active && target.auth_user_id) {
      await revokeStaffAccess(createAdminClient(), target.auth_user_id as string);
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
