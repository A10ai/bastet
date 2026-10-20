# 0008 TOTP MFA enforced for owner and admin, server-side

Date: 2026-10-18. Status: accepted.

## Context

Owner and admin accounts can read every guest, change rates and export
data. A password alone is not enough for that blast radius.

## Decision

TOTP enrolment and verification run through `/api/v1/auth/mfa` on the
server (browser-side Supabase MFA calls were unreliable). `checkMfa`
inside `requireRole` returns `MFA_ENROLMENT_REQUIRED` or `MFA_REQUIRED`
for roles listed in `MFA_REQUIRED_ROLES` when `MFA_ENFORCE` is on (default
true). Any user who has enrolled must verify every session regardless of
role. The dashboard middleware redirects to the MFA step.

## Consequences

- Rolling out to an existing team needs `MFA_ENFORCE=false` for the
  enrolment window, then on.
- Losing an authenticator is an admin reset (incident runbook).
