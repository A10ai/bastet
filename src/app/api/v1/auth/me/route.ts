import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";

/**
 * GET /api/v1/auth/me — the signed-in staff member's own record.
 * Goes through requireRole so disabled accounts, users without a staff
 * record and MFA-pending sessions are refused like everywhere else.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ROLES.ALL_STAFF);
  if (!auth.authenticated) return auth.error!;
  try {
    const supabase = await createServerSupabaseClient();
    const { data: staff, error: staffError } = await supabase
      .from("staff")
      .select("id, auth_user_id, property_id, first_name, last_name, email, phone, role, department, language, is_active, hire_date, created_at, updated_at")
      .eq("auth_user_id", auth.userId!)
      .single();

    if (staffError || !staff) {
      return NextResponse.json({ error: { code: "STAFF_NOT_FOUND", message: "Staff profile not found" } }, { status: 404 });
    }

    return NextResponse.json({
      data: {
        user: { id: auth.userId, email: auth.email },
        staff,
      },
    });
  } catch {
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } }, { status: 500 });
  }
}
