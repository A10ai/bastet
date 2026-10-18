# Architecture

HospitAI is a property management system for hotels and aparthotels: a
Next.js 15 application (App Router, React 19) in front of a Supabase
project (PostgreSQL 17, GoTrue auth, PostgREST). The same build runs on
Vercel for the cloud product and in Docker on an on-site Edge Box.

## Request path

```
Browser ──> Next.js middleware (nonce CSP, dashboard auth redirect, MFA step)
        ──> /api/v1/* route handler
              requireRole()      identity (local JWT verify), CSRF, MFA, staff row + role
              validateBody()     Zod schema aligned with the database enums
              supabase client    request-scoped, anon key + user token  ──> PostgREST ──> RLS policies
              rpc(...)           database functions for anything transactional
              logAudit()         audit_log row with the acting user
              emitEvent()        system_events row (idempotent) ──> handlers (workflows, notifications)
        <── JSON envelope { data, meta } | { error: { code, message } }
```

Three rules make this safe:

1. **Identity is verified, never trusted from the cookie** (`src/lib/api-auth.ts`, `src/lib/jwt-verify.ts`; ADR 0002).
2. **The database is the authorisation boundary.** Every table has row-level security; routes add role checks on top (ADR 0001).
3. **Money and state transitions are database functions**: `create_booking`, `checkin_booking`, `checkout_booking`, `post_folio_charge`, `record_folio_payment`, `refund_payment`, `void_folio_line`, `issue_folio_invoice`, `run_night_audit`. The API never writes a folio line directly (ADR 0003, 0004).

## Modules

| Area | Where | Notes |
| --- | --- | --- |
| API routes | `src/app/api/v1/**/route.ts` (83) | Thin: auth, validation, one engine or RPC call, audit. Factories in `src/lib/crud.ts`, `assign-handler.ts`, `guest-subresource.ts` cover the repetitive ones |
| Auth and security | `src/lib/api-auth.ts`, `jwt-verify.ts`, `mfa.ts`, `csrf.ts`, `rate-limit.ts`, `pii-crypto.ts`, `src/middleware.ts` | See README "Security configuration" |
| Domain engines | `src/lib/booking-engine.ts`, `finance-engine.ts`, `revenue-engine.ts`, `reports-engine.ts`, `energy-engine.ts`, `guest-intelligence.ts`, `prediction-model.ts` | Pure-ish functions over a Supabase client; unit tested against `tests/__mocks__/supabase-fake.ts` |
| AI | `src/lib/ai-brain.ts`, `ai-chat.ts`, `ai-engine.ts`, `ai-model.ts`, `pii-anonymizer.ts` | Claude via the Anthropic API; snapshots are anonymised before leaving the system; model id from `ANTHROPIC_MODEL` |
| Automation | `src/lib/event-bus.ts`, `workflow-engine.ts`, `automations-engine.ts`, `scheduled-cycle.ts`, `src/app/api/v1/cron/*` | Cron-driven (ADR 0005), idempotent (ADR 0006) |
| Database | `supabase/migrations/00001..00026`, `supabase/seed.sql`, `supabase/config.toml` | Schema is documented in `docs/DATA-DICTIONARY.md` (generated) |
| UI | `src/app/dashboard/**` pages, `src/components/**`, `src/hooks/use-api.ts` (SWR), `use-realtime.ts` | Pages are shells; sections live in components (ADR 0010) |
| Observability | `src/lib/logger.ts` (pino), `src/lib/sentry.ts`, `src/lib/health.ts` | `GET /api/v1/health` probes DB, auth, cron freshness, night audit |

## Data model in one paragraph

A `property` has `buildings` and `apartments` of an `apartment_type` with
seasonal `rates`. A `guest` makes `bookings` on an apartment (overlaps are
impossible: exclusion constraint). A booking has a `folio` whose
`folio_lines` are the only record of charges, taxes, payments and refunds;
an `invoice` is issued from the folio and frozen. The night audit writes
`daily_closes` and advances the property's business date. Operations run
on `housekeeping_tasks`, `maintenance_requests` and `staff`, with
`staff_properties` deciding who may see which property. Everything a user
does lands in `audit_log`; everything the system does lands in
`system_events`.

## Environments

Local (Supabase CLI stack), CI (fresh stack per run), staging (own Supabase
project, Vercel preview), production. See `docs/STAGING.md`. Secrets per
environment are listed in the README and rotated per
`docs/runbooks/key-rotation.md`.

## Testing pyramid

| Layer | Tool | Count (18 Oct 2026) |
| --- | --- | ---: |
| Unit (engines, libs) | Vitest + in-memory Supabase fake, 70% line threshold | 193 |
| Contract | OpenAPI paths vs route files | 4 |
| Integration | `scripts/deep-test.mjs` against a real local stack (auth, roles, forged tokens, transactions, finance, pages, MFA) | 228 checks |
| End to end | Playwright smoke + authenticated journeys | 12 |
| Load | `scripts/load-test.mjs`, 50 virtual users | p95 budget 1.5 s |

## Decisions

See `docs/adr/` for the eleven decisions that define the system, each with
its context and consequences.
