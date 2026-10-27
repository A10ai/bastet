import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMutatingMethod, validateCsrfToken, CSRF_HEADER_NAME, CSRF_COOKIE_NAME } from "@/lib/csrf";
import { checkMfa, userHasVerifiedFactor } from "@/lib/mfa";
import { verifyAccessToken } from "@/lib/jwt-verify";

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
  /** Verified identity details, carried from requireAuth into requireRole. */
  verified?: VerifiedUser;
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

export function requestScopedClient(request: NextRequest) {
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

export interface VerifiedUser {
  id: string;
  email?: string;
  /** `aal` claim of the verified access token ("aal1" | "aal2"). */
  aal?: string;
  /** The verified access token (for the server-side factor lookup). */
  accessToken?: string;
  /** Set when the auth server returned the user object on this request. */
  hasVerifiedFactor?: boolean;
}

/** Decode a JWT payload without checking it. Only for tokens already verified. */
function decodePayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    return part ? (JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Verify the caller's identity against Supabase Auth.
 *
 * SECURITY: the token's signature is verified (locally when key material is
 * configured, see `src/lib/jwt-verify.ts`, otherwise with `auth.getUser()`, which sends the access token to the
 * Auth server and verifies its signature. `auth.getSession()` only decodes the
 * cookie and must never be used to establish identity on the server.
 */
export async function getVerifiedUser(request: NextRequest): Promise<VerifiedUser | null> {
  try {
    const supabase = requestScopedClient(request);
    // Fast path: verify the access token's signature locally (SUPABASE_JWT_SECRET
    // or the project JWKS). getSession() only reads the cookie here; it does
    // not trust it, and we never use its user object.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      const verified = await verifyAccessToken(session.access_token);
      if (verified.ok) {
        return {
          id: verified.claims.sub,
          email: verified.claims.email,
          aal: verified.claims.aal,
          accessToken: session.access_token,
        };
      }
      if (verified.reason === "invalid") return null;
    }
    // No local key material: ask the auth server (one network call). The user
    // object it returns is authoritative, including its factor list.
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) return null;
    // getUser() just verified the session's access token, so its claims can be read.
    const claims = session?.access_token ? decodePayload(session.access_token) : null;
    const sameUser = claims?.sub === user.id;
    return {
      id: user.id,
      email: user.email ?? undefined,
      aal: sameUser && typeof claims?.aal === "string" ? claims.aal : undefined,
      accessToken: sameUser ? session?.access_token : undefined,
      hasVerifiedFactor: userHasVerifiedFactor(user),
    };
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

  return { authenticated: true, userId: user.id, email: user.email, verified: user };
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
  allowedRoles: readonly StaffRole[],
  options?: { /** Allow an aal1 session (only the MFA enrolment endpoints need this). */ skipMfa?: boolean }
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

    // Second factor: enrolled users must have verified it this session;
    // privileged roles must be enrolled at all (see src/lib/mfa.ts).
    if (!options?.skipMfa) {
      const v = auth.verified;
      const mfa = await checkMfa(requestScopedClient(request), userRole, {
        userId: auth.userId,
        aal: v?.aal,
        accessToken: v?.accessToken,
        hasVerifiedFactor: v?.hasVerifiedFactor,
      });
      if (!mfa.ok) return deny(mfa.code, mfa.message, mfa.code === "MFA_CHECK_UNAVAILABLE" ? 503 : 403);
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

/** Numeric privilege level of a role (0 for unknown roles). */
export function roleLevel(role: string | undefined | null): number {
  return role ? (ROLE_LEVELS[role as StaffRole] ?? 0) : 0;
}

/**
 * Staff management rule: an actor may only create, change or deactivate
 * accounts strictly below their own level, and only hand out roles strictly
 * below their own level. Owners are therefore never created or promoted
 * through the API, and an admin cannot touch another admin or an owner.
 */
export function canManageRole(actorRole: StaffRole | undefined, targetRole: string | undefined | null): boolean {
  if (!actorRole || !targetRole) return false;
  return roleLevel(targetRole) > 0 && roleLevel(targetRole) < roleLevel(actorRole);
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
