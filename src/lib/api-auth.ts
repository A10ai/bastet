import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * HospitAI Role Hierarchy
 * owner > admin > manager > receptionist > housekeeping > maintenance > readonly
 */
export type StaffRole =
  | "owner"
  | "admin"
  | "manager"
  | "receptionist"
  | "housekeeping"
  | "maintenance"
  | "readonly";

const ROLE_LEVELS: Record<StaffRole, number> = {
  owner: 100,
  admin: 90,
  manager: 70,
  receptionist: 50,
  housekeeping: 30,
  maintenance: 30,
  readonly: 10,
};

/**
 * Verify that the request has a valid Supabase auth session.
 * Always validates via supabase.auth.getSession() — no shortcuts.
 *
 * Usage:
 *   const auth = await requireAuth(request);
 *   if (!auth.authenticated) return auth.error!;
 */
export async function requireAuth(
  request: NextRequest
): Promise<{ authenticated: boolean; error?: NextResponse }> {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value;
          },
          set(_name: string, _value: string, _options: CookieOptions) {},
          remove(_name: string, _options: CookieOptions) {},
        },
      }
    );

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return {
        authenticated: false,
        error: NextResponse.json(
          { error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
          { status: 401 }
        ),
      };
    }

    return { authenticated: true };
  } catch {
    return {
      authenticated: false,
      error: NextResponse.json(
        { error: { code: "AUTH_FAILED", message: "Authentication check failed" } },
        { status: 401 }
      ),
    };
  }
}

/**
 * Verify the request has a valid session AND the user has one of the allowed roles.
 * Uses the admin client to look up the staff record by auth_user_id (bypasses RLS
 * for the role check — necessary because RLS policies themselves depend on the role).
 *
 * Usage:
 *   const auth = await requireRole(request, ["owner", "admin"]);
 *   if (!auth.authenticated) return auth.error!;
 *
 * @param request - NextRequest
 * @param allowedRoles - Array of StaffRole strings that are permitted
 */
export async function requireRole(
  request: NextRequest,
  allowedRoles: StaffRole[]
): Promise<{ authenticated: boolean; error?: NextResponse; role?: StaffRole; userId?: string }> {
  // First check basic auth
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth;

  try {
    // Get the session to extract user ID
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value;
          },
          set(_name: string, _value: string, _options: CookieOptions) {},
          remove(_name: string, _options: CookieOptions) {},
        },
      }
    );

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user?.id) {
      return {
        authenticated: false,
        error: NextResponse.json(
          { error: { code: "NO_SESSION", message: "No active session" } },
          { status: 401 }
        ),
      };
    }

    // Look up staff record by auth_user_id to get role
    const admin = createAdminClient();
    const { data: staff, error: staffError } = await admin
      .from("staff")
      .select("role, is_active")
      .eq("auth_user_id", session.user.id)
      .single();

    if (staffError || !staff) {
      return {
        authenticated: false,
        error: NextResponse.json(
          { error: { code: "STAFF_NOT_FOUND", message: "Staff record not found" } },
          { status: 403 }
        ),
      };
    }

    if (!staff.is_active) {
      return {
        authenticated: false,
        error: NextResponse.json(
          { error: { code: "ACCOUNT_DISABLED", message: "Account is disabled" } },
          { status: 403 }
        ),
      };
    }

    const userRole = staff.role as StaffRole;

    // Check if user's role level is sufficient for any of the allowed roles
    const minRequiredLevel = Math.min(
      ...allowedRoles.map((r) => ROLE_LEVELS[r] ?? 0)
    );
    const userLevel = ROLE_LEVELS[userRole] ?? 0;

    if (userLevel < minRequiredLevel) {
      return {
        authenticated: false,
        error: NextResponse.json(
          {
            error: {
              code: "FORBIDDEN",
              message: `Requires role: ${allowedRoles.join(" or ")}. Your role: ${userRole}`,
            },
          },
          { status: 403 }
        ),
      };
    }

    return { authenticated: true, role: userRole, userId: session.user.id };
  } catch {
    return {
      authenticated: false,
      error: NextResponse.json(
        { error: { code: "AUTH_CHECK_FAILED", message: "Authorization check failed" } },
        { status: 500 }
      ),
    };
  }
}

/**
 * Get the authenticated user's staff role without enforcing specific roles.
 * Returns null if not authenticated or no staff record found.
 */
export async function getUserRole(
  request: NextRequest
): Promise<StaffRole | null> {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value;
          },
          set(_name: string, _value: string, _options: CookieOptions) {},
          remove(_name: string, _options: CookieOptions) {},
        },
      }
    );

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user?.id) return null;

    const admin = createAdminClient();
    const { data: staff } = await admin
      .from("staff")
      .select("role")
      .eq("auth_user_id", session.user.id)
      .single();

    return (staff?.role as StaffRole) ?? null;
  } catch {
    return null;
  }
}