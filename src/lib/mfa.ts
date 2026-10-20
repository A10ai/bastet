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
 *    reaching anything protected (nextLevel aal2 but currentLevel aal1).
 *  - Roles listed in MFA_REQUIRED_ROLES (default "owner,admin") must have a
 *    verified factor; without one they get MFA_ENROLMENT_REQUIRED and can
 *    only reach the security settings page to enrol. Set MFA_ENFORCE=false to
 *    make enrolment optional during rollout.
 */
export type MfaStatus =
  | { ok: true; level: "aal1" | "aal2"; enrolled: boolean }
  | { ok: false; code: "MFA_REQUIRED" | "MFA_ENROLMENT_REQUIRED"; message: string; enrolled: boolean };

const ENFORCE = process.env.MFA_ENFORCE !== "false";
const REQUIRED_ROLES = (process.env.MFA_REQUIRED_ROLES || "owner,admin")
  .split(",")
  .map((r) => r.trim())
  .filter(Boolean) as StaffRole[];

export function mfaRequiredForRole(role: StaffRole | undefined): boolean {
  return ENFORCE && !!role && REQUIRED_ROLES.includes(role);
}

export async function checkMfa(supabase: SupabaseClient, role: StaffRole | undefined): Promise<MfaStatus> {
  let currentLevel: "aal1" | "aal2" | null = null;
  let nextLevel: "aal1" | "aal2" | null = null;
  try {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    currentLevel = (data?.currentLevel as "aal1" | "aal2" | null) ?? null;
    nextLevel = (data?.nextLevel as "aal1" | "aal2" | null) ?? null;
  } catch {
    // Auth server unreachable: treat as aal1 with no factors; role checks
    // below decide whether that is acceptable.
  }
  const enrolled = nextLevel === "aal2";

  if (enrolled && currentLevel !== "aal2") {
    return {
      ok: false,
      code: "MFA_REQUIRED",
      message: "Verify your authenticator code to continue",
      enrolled,
    };
  }
  if (!enrolled && mfaRequiredForRole(role)) {
    return {
      ok: false,
      code: "MFA_ENROLMENT_REQUIRED",
      message: "Owners and admins must enrol an authenticator app (Settings > Security)",
      enrolled,
    };
  }
  return { ok: true, level: currentLevel === "aal2" ? "aal2" : "aal1", enrolled };
}
