import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole, ROLES, canManageRole, type AuthContext } from "@/lib/api-auth";
import { getActivePropertyId } from "@/lib/api-property";
import { apiError, handleDbError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit";
import { validateBody, formatZodErrors, updateStaffSchema, adminCreateUserSchema } from "@/lib/validation";

/**
 * User administration on the service-role client (it creates auth users).
 *
 * SECURITY: the service role bypasses RLS, so every query here is scoped to
 * the caller's active property, and staff management follows canManageRole:
 * an actor only creates, changes or deactivates accounts below their own
 * level and only hands out roles below their own level.
 */

async function scope(request: NextRequest): Promise<string | null> {
  return (await getActivePropertyId(request)) ?? null;
}

const actor = (auth: AuthContext) => ({ user_id: auth.userId, user_email: auth.email });

async function loadTarget(supabase: ReturnType<typeof createAdminClient>, id: string, propertyId: string) {
  const { data } = await supabase
    .from("staff")
    .select("id, role, property_id, auth_user_id")
    .eq("id", id)
    .eq("property_id", propertyId)
    .maybeSingle();
  return data as { id: string; role: string; property_id: string; auth_user_id: string | null } | null;
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ROLES.ADMIN);
  if (!auth.authenticated) return auth.error!;

  try {
    const propertyId = await scope(request);
    if (!propertyId) return apiError("FORBIDDEN", "No property access", 403);
    const supabase = createAdminClient();

    const { data: staffList, error } = await supabase
      .from("staff")
      .select("*")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false });

    if (error) {
      return handleDbError(error, "admin-users-list");
    }

    // Auth details for this property's staff only (requires service role)
    const wanted = new Set((staffList || []).map((s: Record<string, unknown>) => s.auth_user_id).filter(Boolean));
    const authUsers: Record<string, unknown> = {};
    try {
      const { data: authData } = await supabase.auth.admin.listUsers();
      for (const u of authData?.users || []) {
        if (!wanted.has(u.id)) continue;
        authUsers[u.id] = {
          email: u.email,
          last_sign_in_at: u.last_sign_in_at,
          created_at: u.created_at,
          email_confirmed_at: u.email_confirmed_at,
          banned_until: u.banned_until,
        };
      }
    } catch {
      // Auth admin API may not be available
    }

    const enriched = (staffList || []).map((s: Record<string, unknown>) => ({
      ...s,
      auth_info: s.auth_user_id ? authUsers[s.auth_user_id as string] || null : null,
    }));

    return NextResponse.json({ data: enriched });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ROLES.ADMIN);
  if (!auth.authenticated) return auth.error!;

  try {
    const propertyId = await scope(request);
    if (!propertyId) return apiError("FORBIDDEN", "No property access", 403);
    const body = await request.json().catch(() => null);
    const validation = validateBody(adminCreateUserSchema, body);
    if (!validation.success) {
      return apiError("VALIDATION_ERROR", formatZodErrors(validation.error), 400);
    }
    const { first_name, last_name, email, password, phone, role, department } = validation.data;
    if (!canManageRole(auth.role, role)) {
      return apiError("FORBIDDEN", "You can only create accounts with a role below your own", 403);
    }

    const supabase = createAdminClient();
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (authError || !authData?.user) {
      return apiError("VALIDATION_ERROR", `Auth error: ${authError?.message ?? "user not created"}`, 400);
    }

    const { data: staffData, error: staffError } = await supabase
      .from("staff")
      .insert({
        property_id: propertyId,
        auth_user_id: authData.user.id,
        first_name,
        last_name,
        email,
        phone: phone || null,
        role,
        department: department || null,
        is_active: true,
        hire_date: new Date().toISOString().split("T")[0],
      })
      .select()
      .single();

    if (staffError) {
      // Cleanup auth user if staff creation fails
      await supabase.auth.admin.deleteUser(authData.user.id);
      return apiError("VALIDATION_ERROR", `Staff error: ${staffError.message}`, 400);
    }

    await logAudit(supabase, {
      ...actor(auth),
      action: "admin.user.create",
      category: "settings",
      resource_type: "staff",
      resource_id: staffData?.id,
      description: `Created staff user ${email}`,
      // Never the password.
      new_data: { first_name, last_name, email, phone, role, department, property_id: propertyId },
      // Service-role insert: the property cannot be inferred from the session
      metadata: { property_id: propertyId },
    });

    return NextResponse.json({ data: staffData }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireRole(request, ROLES.ADMIN);
  if (!auth.authenticated) return auth.error!;

  try {
    const propertyId = await scope(request);
    if (!propertyId) return apiError("FORBIDDEN", "No property access", 403);
    const supabase = createAdminClient();
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const { id, ...updates } = body || {};

    if (!id || typeof id !== "string") {
      return apiError("VALIDATION_ERROR", "Staff id is required", 400);
    }

    // Allowlist schema: no property_id, no auth_user_id.
    const validation = validateBody(updateStaffSchema, updates);
    if (!validation.success) {
      return apiError("VALIDATION_ERROR", formatZodErrors(validation.error), 400);
    }

    const target = await loadTarget(supabase, id, propertyId);
    if (!target) return apiError("NOT_FOUND", "Staff member not found", 404);

    const self = target.id === auth.staffId;
    if (self) {
      if (validation.data.role !== undefined || validation.data.is_active !== undefined) {
        return apiError("FORBIDDEN", "You cannot change your own role or active status", 403);
      }
    } else if (!canManageRole(auth.role, target.role)) {
      return apiError("FORBIDDEN", "You can only manage accounts with a role below your own", 403);
    }
    if (validation.data.role !== undefined && !canManageRole(auth.role, validation.data.role)) {
      return apiError("FORBIDDEN", "You can only assign roles below your own", 403);
    }

    const { data, error } = await supabase
      .from("staff")
      .update(validation.data)
      .eq("id", id)
      .eq("property_id", propertyId)
      .select()
      .single();

    if (error) {
      return handleDbError(error, "admin-users-update");
    }

    await logAudit(supabase, {
      ...actor(auth),
      action: "admin.user.update",
      category: "settings",
      resource_type: "staff",
      resource_id: data?.id || id,
      description: `Updated staff user ${id}`,
      new_data: validation.data,
      metadata: { property_id: propertyId },
    });

    return NextResponse.json({ data });
  } catch {
    return apiError("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireRole(request, ROLES.ADMIN);
  if (!auth.authenticated) return auth.error!;

  try {
    const propertyId = await scope(request);
    if (!propertyId) return apiError("FORBIDDEN", "No property access", 403);
    const supabase = createAdminClient();
    const id = request.nextUrl.searchParams.get("id");

    if (!id) {
      return apiError("VALIDATION_ERROR", "Staff id is required", 400);
    }

    const target = await loadTarget(supabase, id, propertyId);
    if (!target) return apiError("NOT_FOUND", "Staff member not found", 404);
    if (target.id === auth.staffId) {
      return apiError("FORBIDDEN", "You cannot deactivate your own account", 403);
    }
    if (!canManageRole(auth.role, target.role)) {
      return apiError("FORBIDDEN", "You can only manage accounts with a role below your own", 403);
    }

    // Disable the staff member rather than hard delete
    const { error } = await supabase
      .from("staff")
      .update({ is_active: false })
      .eq("id", id)
      .eq("property_id", propertyId);

    if (error) {
      return handleDbError(error, "admin-users-delete");
    }

    // Ban auth user if exists
    if (target.auth_user_id) {
      try {
        await supabase.auth.admin.updateUserById(target.auth_user_id, {
          ban_duration: "876000h", // ~100 years
        });
      } catch {
        // Auth admin may not be available
      }
    }

    await logAudit(supabase, {
      ...actor(auth),
      action: "admin.user.deactivate",
      category: "settings",
      resource_type: "staff",
      resource_id: id,
      description: `Deactivated staff user ${id}`,
      metadata: { property_id: propertyId },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
