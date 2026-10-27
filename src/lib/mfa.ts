import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StaffRole } from "@/lib/api-auth";

/**
 * Multi-factor authentication policy.
 *
 * Supabase Auth tracks an Authenticator Assurance Level per session:
 *   aal1 = password only, aal2 = password + verified TOTP factor.
 *
 * Rules:
 *  - A user who has enrolled a factor must verify it every session before
 *    reaching anything protected (enrolled, but the session is aal1).
 *  - Roles listed in MFA_REQUIRED_ROLES (default "owner,admin") must have a
 *    verified factor; without one they get MFA_ENROLMENT_REQUIRED and can
 *    only reach the security settings page to enrol. Set MFA_ENFORCE=false to
 *    make enrolment optional during rollout.
 *
 * SECURITY: both inputs come from verified sources, never from the session
 * cookie. The level is the `aal` claim of the signature-checked access token;
 * whether the user has a verified factor comes from the auth server (or from
 * the user object the auth server returned for this request). The cookie's
 * `user.factors` is client-controlled: trusting it let a manager whose
 * password leaked strip the factor list and skip the second factor (Oct 2026
 * deep test). `getAuthenticatorAssuranceLevel()` without a token reads exactly
 * that cookie, so it is not used here.
 */
export type MfaStatus =
  | { ok: true; level: "aal1" | "aal2"; enrolled: boolean }
  | {
      ok: false;
      code: "MFA_REQUIRED" | "MFA_ENROLMENT_REQUIRED" | "MFA_CHECK_UNAVAILABLE";
      message: string;
      enrolled: boolean;
    };

export interface MfaContext {
  /** Verified auth user id (cache key for the factor lookup). */
  userId: string;
  /** The `aal` claim of the verified access token. */
  aal?: string;
  /** The verified access token, used to ask the auth server for factors. */
  accessToken?: string;
  /** Known from a user object the auth server returned on this request. */
  hasVerifiedFactor?: boolean;
}

const ENFORCE = process.env.MFA_ENFORCE !== "false";
const REQUIRED_ROLES = (process.env.MFA_REQUIRED_ROLES || "owner,admin")
  .split(",")
  .map((r) => r.trim())
  .filter(Boolean) as StaffRole[];

export function mfaRequiredForRole(role: StaffRole | undefined): boolean {
  return ENFORCE && !!role && REQUIRED_ROLES.includes(role);
}

/** True when an auth-server user object lists a verified factor. */
export function userHasVerifiedFactor(user: { factors?: { status?: string }[] | null } | null | undefined): boolean {
  return (user?.factors || []).some((f) => f.status === "verified");
}

// Factor lookups for aal1 sessions go to the auth server; cache the answer
// briefly so a dashboard firing ten requests costs one round trip. A factor
// enrolled meanwhile upgrades the session to aal2, which needs no lookup.
const FACTOR_CACHE_MS = 60_000;
const factorCache = new Map<string, { enrolled: boolean; until: number }>();

/** Test hook. */
export function resetMfaCache(): void {
  factorCache.clear();
}

async function lookupEnrolled(supabase: SupabaseClient, ctx: MfaContext): Promise<boolean | null> {
  if (ctx.hasVerifiedFactor !== undefined) return ctx.hasVerifiedFactor;
  const cached = factorCache.get(ctx.userId);
  if (cached && cached.until > Date.now()) return cached.enrolled;
  if (!ctx.accessToken) return null;
  try {
    const { data, error } = await supabase.auth.getUser(ctx.accessToken);
    if (error || !data?.user || data.user.id !== ctx.userId) return null;
    const enrolled = userHasVerifiedFactor(data.user);
    factorCache.set(ctx.userId, { enrolled, until: Date.now() + FACTOR_CACHE_MS });
    return enrolled;
  } catch {
    return null;
  }
}

export async function checkMfa(supabase: SupabaseClient, role: StaffRole | undefined, ctx: MfaContext): Promise<MfaStatus> {
  // A verified aal2 token proves a factor was verified this session.
  if (ctx.aal === "aal2") return { ok: true, level: "aal2", enrolled: true };

  const enrolled = await lookupEnrolled(supabase, ctx);
  if (enrolled === null) {
    // Fail closed: without the factor list we cannot tell an enrolled user
    // on an aal1 session from one who never enrolled.
    return {
      ok: false,
      code: "MFA_CHECK_UNAVAILABLE",
      message: "Could not confirm two-factor status. Please try again shortly.",
      enrolled: false,
    };
  }
  if (enrolled) {
    return {
      ok: false,
      code: "MFA_REQUIRED",
      message: "Verify your authenticator code to continue",
      enrolled,
    };
  }
  if (mfaRequiredForRole(role)) {
    return {
      ok: false,
      code: "MFA_ENROLMENT_REQUIRED",
      message: "Owners and admins must enrol an authenticator app (Settings > Security)",
      enrolled,
    };
  }
  return { ok: true, level: "aal1", enrolled };
}
