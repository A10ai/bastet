import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/api-auth";
import { apiError, handleDbError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit";

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ["owner", "admin"]);
  if (!auth.authenticated) return auth.error!;

  try {
    // Use admin client for staff listing (RLS would scope to single property)
    const supabase = createAdminClient();

    const { data: staffList, error } = await supabase
      .from("staff")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return handleDbError(error, "admin-users-list");
    }

    // Get auth users list (requires service role)
    const authUsers: Record<string, unknown> = {};
    try {
      const { data: authData } = await supabase.auth.admin.listUsers();
      if (authData?.users) {
        for (const u of authData.users) {
          authUsers[u.id] = {
            email: u.email,
            last_sign_in_at: u.last_sign_in_at,
            created_at: u.created_at,
            email_confirmed_at: u.email_confirmed_at,
            banned_until: u.banned_until,
          };
        }
      }
    } catch {
      // Auth admin API may not be available
    }

    // Merge auth info into staff records
    const enriched = (staffList || []).map((s: any) => ({
      ...s,
      auth_info: s.auth_user_id ? authUsers[s.auth_user_id] || null : null,
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
  const auth = await requireRole(request, ["owner", "admin"]);
  if (!auth.authenticated) return auth.error!;

  try {
    const supabase = createAdminClient();
    const body = await request.json();
    const {
      first_name,
      last_name,
      email,
      password,
      phone,
      role,
      department,
    } = body;

    if (!first_name || !last_name || !email || !role || !password) {
      return NextResponse.json(
        {
          error:
            "Required: first_name, last_name, email, password, role",
        },
        { status: 400 }
      );
    }

    // Create auth user
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (authError) {
      return NextResponse.json(
        { error: `Auth error: ${authError.message}` },
        { status: 400 }
      );
    }

    // Get default property
    const { data: prop } = await supabase
      .from("properties")
      .select("id")
      .limit(1)
      .single();

    // Create staff record linked to auth user
    const { data: staffData, error: staffError } = await supabase
      .from("staff")
      .insert({
        property_id: prop?.id,
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
      return NextResponse.json(
        { error: `Staff error: ${staffError.message}` },
        { status: 400 }
      );
    }

    await logAudit(supabase, {
      action: "admin.user.create",
      category: "settings",
      resource_type: "staff",
      resource_id: staffData?.id,
      description: `Created staff user ${email}`,
      new_data: body,
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
  const auth = await requireRole(request, ["owner", "admin"]);
  if (!auth.authenticated) return auth.error!;

  try {
    const supabase = createAdminClient();
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return apiError("VALIDATION_ERROR", "Staff id is required", 400);
    }

    // Validate updates against allowlist schema (prevents mass-assignment of role/is_active/property_id)
    const { validateBody, formatZodErrors, updateStaffSchema } = await import("@/lib/validation");
    const validation = validateBody(updateStaffSchema, updates);
    if (!validation.success) {
      return apiError("VALIDATION_ERROR", formatZodErrors(validation.error), 400);
    }

    const { data, error } = await supabase
      .from("staff")
      .update(validation.data)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return handleDbError(error, "admin-users-update");
    }

    await logAudit(supabase, {
      action: "admin.user.update",
      category: "settings",
      resource_type: "staff",
      resource_id: data?.id || id,
      description: `Updated staff user ${id}`,
      new_data: body,
    });

    return NextResponse.json({ data });
  } catch {
    return apiError("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireRole(request, ["owner", "admin"]);
  if (!auth.authenticated) return auth.error!;

  try {
    const supabase = createAdminClient();
    const { searchParams } = request.nextUrl;
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Staff id is required" },
        { status: 400 }
      );
    }

    // Disable the staff member rather than hard delete
    const { data: staffRecord } = await supabase
      .from("staff")
      .select("auth_user_id")
      .eq("id", id)
      .single();

    // Deactivate staff
    const { error } = await supabase
      .from("staff")
      .update({ is_active: false })
      .eq("id", id);

    if (error) {
      return handleDbError(error, "admin-users-delete");
    }

    // Ban auth user if exists
    if (staffRecord?.auth_user_id) {
      try {
        await supabase.auth.admin.updateUserById(staffRecord.auth_user_id, {
          ban_duration: "876000h", // ~100 years
        });
      } catch {
        // Auth admin may not be available
      }
    }

    await logAudit(supabase, {
      action: "admin.user.deactivate",
      category: "settings",
      resource_type: "staff",
      resource_id: id,
      description: `Deactivated staff user ${id}`,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}