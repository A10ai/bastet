import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMutatingMethod, validateCsrfToken, CSRF_HEADER_NAME, CSRF_COOKIE_NAME } from "@/lib/csrf";

/**
 * HospitAI Role Hierarchy
 * owner > admin > manager > receptionist > housekeeping = maintenance > readonly
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
 * Named role groups used by the route authorisation policy.
 * `requireRole` is hierarchical: a caller passes if their level is at least
 * the lowest level in the group, so each group only needs its floor.
 */
export const ROLES = {
  /** Any active staff member, including read-only accounts. */
  ALL_STAFF: ["readonly"] as StaffRole[],
  /** Operational staff who act on rooms: housekeeping, maintenance and above. */
  OPERATIONS: ["housekeeping", "maintenance"] as StaffRole[],
  /** Front desk: receptionist and above. Guest PII, bookings, payments. */
  FRONT_DESK: ["receptionist"] as StaffRole[],
  /** Manager and above. Finance, reports, staff, configuration. */
  MANAGEMENT: ["manager"] as StaffRole[],
  /** Admin and owner. User management, AI control, property settings. */
  ADMIN: ["admin"] as StaffRole[],
  /** Owner only. */
  OWNER: ["owner"] as StaffRole[],
} as const;

export interface AuthContext {
  authenticated: boolean;
  error?: NextResponse;
  /** Verified Supabase auth user id. */
  userId?: string;
  /** Verified email from the auth user. */
  email?: string;
  /** Staff row id, role and property, when the user has an active staff record. */
  staffId?: string;
  role?: StaffRole;
  propertyId?: string;
}

function requestScopedClient(request: NextRequest) {
  return createServerClient(
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
}

function deny(code: string, message: string, status: number): AuthContext {
  return {
    authenticated: false,
    error: NextResponse.json({ error: { code, message } }, { status }),
  };
}

/**
 * Verify the caller's identity against Supabase Auth.
 *
 * SECURITY: this uses `auth.getUser()`, which sends the access token to the
 * Auth server and verifies its signature. `auth.getSession()` only decodes the
 * cookie and must never be used to establish identity on the server.
 */
export async function getVerifiedUser(
  request: NextRequest
): Promise<{ id: string; email?: string } | null> {
  try {
    const supabase = requestScopedClient(request);
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) return null;
    return { id: user.id, email: user.email ?? undefined };
  } catch {
    return null;
  }
}

/**
 * Verify the request carries a valid, signed Supabase session and (for
 * mutating methods) a valid CSRF token.
 *
 * Usage:
 *   const auth = await requireAuth(request);
 *   if (!auth.authenticated) return auth.error!;
 */
export async function requireAuth(request: NextRequest): Promise<AuthContext> {
  // CSRF check: mutating requests (POST/PUT/DELETE/PATCH) must send a valid
  // X-CSRF-Token header matching the hospitai-csrf cookie. GET requests are
  // never CSRF-validated.
  if (isMutatingMethod(request.method)) {
    if (!validateCsrfToken(request)) {
      return deny(
        "CSRF_TOKEN_INVALID",
        `Missing or invalid CSRF token. Send the ${CSRF_HEADER_NAME} header matching the ${CSRF_COOKIE_NAME} cookie.`,
        403
      );
    }
  }

  const user = await getVerifiedUser(request);
  if (!user) {
    return deny("UNAUTHORIZED", "Unauthorized", 401);
  }

  return { authenticated: true, userId: user.id, email: user.email };
}

/**
 * Verify the request has a valid session AND the user has an active staff
 * record whose role meets the floor of `allowedRoles`.
 *
 * Uses the admin client to look up the staff record by the VERIFIED auth user
 * id (bypasses RLS for the role check — necessary because RLS policies
 * themselves depend on the role).
 *
 * Usage:
 *   const auth = await requireRole(request, ROLES.MANAGEMENT);
 *   if (!auth.authenticated) return auth.error!;
 */
export async function requireRole(
  request: NextRequest,
  allowedRoles: readonly StaffRole[]
): Promise<AuthContext> {
  const auth = await requireAuth(request);
  if (!auth.authenticated || !auth.userId) return auth;

  try {
    const admin = createAdminClient();
    const { data: staff, error: staffError } = await admin
      .from("staff")
      .select("id, role, is_active, property_id")
      .eq("auth_user_id", auth.userId)
      .single();

    if (staffError || !staff) {
      return deny("STAFF_NOT_FOUND", "Staff record not found", 403);
    }

    if (!staff.is_active) {
      return deny("ACCOUNT_DISABLED", "Account is disabled", 403);
    }

    const userRole = staff.role as StaffRole;
    const minRequiredLevel = Math.min(...allowedRoles.map((r) => ROLE_LEVELS[r] ?? 0));
    const userLevel = ROLE_LEVELS[userRole] ?? 0;

    if (userLevel < minRequiredLevel) {
      return deny(
        "FORBIDDEN",
        `Requires role: ${allowedRoles.join(" or ")}. Your role: ${userRole}`,
        403
      );
    }

    return {
      authenticated: true,
      userId: auth.userId,
      email: auth.email,
      staffId: staff.id as string,
      role: userRole,
      propertyId: staff.property_id as string,
    };
  } catch {
    return deny("AUTH_CHECK_FAILED", "Authorization check failed", 500);
  }
}

/**
 * True when `role` is at least as privileged as `floor`.
 */
export function roleAtLeast(role: StaffRole | undefined, floor: StaffRole): boolean {
  if (!role) return false;
  return (ROLE_LEVELS[role] ?? 0) >= (ROLE_LEVELS[floor] ?? 0);
}

/**
 * Get the authenticated user's staff role without enforcing specific roles.
 * Returns null if not authenticated or no staff record found.
 */
export async function getUserRole(request: NextRequest): Promise<StaffRole | null> {
  const user = await getVerifiedUser(request);
  if (!user) return null;
  try {
    const admin = createAdminClient();
    const { data: staff } = await admin
      .from("staff")
      .select("role")
      .eq("auth_user_id", user.id)
      .single();
    return (staff?.role as StaffRole) ?? null;
  } catch {
    return null;
  }
}
