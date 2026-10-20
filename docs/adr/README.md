# Architecture decision records

One file per decision that shaped the system and would be expensive to
reverse. Format: context, decision, consequences. New decisions get the
next number; superseded ones stay and point to their replacement.

| ADR | Decision | Date |
| --- | --- | --- |
| [0001](0001-supabase-rls-as-authorisation-boundary.md) | Supabase with row-level security as the authorisation boundary | 2026-10-18 |
| [0002](0002-local-jwt-verification.md) | Verify session tokens locally; auth server only as fallback | 2026-10-18 |
| [0003](0003-append-only-folio-ledger.md) | Append-only folio ledger; corrections are reversing lines | 2026-10-18 |
| [0004](0004-night-audit-and-business-date.md) | Night audit closes a business date; revenue recognised by stay date | 2026-10-18 |
| [0005](0005-cron-over-in-process-timers.md) | Scheduled work runs from platform cron, never in-process timers | 2026-10-18 |
| [0006](0006-idempotent-event-bus.md) | Event bus with idempotency keys and optimistic locking on workflows | 2026-10-18 |
| [0007](0007-field-level-pii-encryption.md) | Field-level encryption for identity documents with a two-key rotation | 2026-10-18 |
| [0008](0008-mfa-for-privileged-roles.md) | TOTP MFA enforced for owner and admin, server-side | 2026-10-18 |
| [0009](0009-brand-neutral-multi-property.md) | No customer identity in code; property data comes from the database | 2026-10-18 |
| [0010](0010-swr-data-layer.md) | SWR hooks as the client data layer | 2026-10-18 |
| [0011](0011-demo-data-must-be-labelled.md) | Sample or modelled data is always labelled on screen and in the API | 2026-10-18 |
