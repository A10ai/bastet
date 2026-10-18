# 0001 Supabase with row-level security as the authorisation boundary

Date: 2026-10-18. Status: accepted.

## Context

The October 2026 audit found 70 of 75 API routes without a role check and
tables with `USING (true)` policies. Authorisation lived, when it lived at
all, in route code; anyone with the anon key and a forged cookie could read
staff and guest data.

## Decision

Two layers, both mandatory:

1. Every API route calls `requireRole(request, ROLES.<group>)` from
   `src/lib/api-auth.ts`, which verifies identity, CSRF and MFA and returns
   the staff row. The role groups (`ALL_STAFF`, `OPERATIONS`, `FRONT_DESK`,
   `MANAGEMENT`, `ADMIN`, `OWNER`) are the only vocabulary routes use.
2. Every table has row-level security with policies written in terms of the
   database helpers `get_staff_id()`, `staff_role_level()`,
   `role_at_least(n)` and `can_access_property(id)` (membership through
   `staff_properties`). The service-role key is used only by cron routes,
   health probes and admin backfills, never in request handling for users.

## Consequences

- A route bug cannot expose another property's or another role's rows: the
  database refuses them.
- Policies must be written for `INSERT ... RETURNING` too (see the
  notification broadcast defect fixed on 18 Oct 2026).
- Adding a table means adding policies in the same migration; the data
  dictionary marks tables with RLS off so the gap is visible.
