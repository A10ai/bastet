/**
 * Client-side view of the MFA policy (see src/lib/mfa.ts for the server rule).
 * Kept free of server-only imports so the dashboard shell can use it.
 */
export const MFA_SETTINGS_PATH = "/dashboard/settings/security";

export interface MfaStatusView {
  enrolled: boolean;
  enrolment_required?: boolean;
  verification_required?: boolean;
}

/**
 * Where the dashboard should send a signed-in user whose session cannot use
 * the API yet, or null when they may stay where they are.
 *
 *  - verification pending  -> /login?step=mfa (the middleware does the same
 *    for page loads; this covers a session that expired mid-visit)
 *  - enrolment required    -> Settings > Security, unless already there
 */
export function mfaRedirectFor(status: MfaStatusView | null | undefined, pathname: string): string | null {
  if (!status) return null;
  if (status.verification_required) {
    return `/login?step=mfa&redirect=${encodeURIComponent(pathname)}`;
  }
  if (status.enrolment_required && !status.enrolled && !pathname.startsWith(MFA_SETTINGS_PATH)) {
    return MFA_SETTINGS_PATH;
  }
  return null;
}
