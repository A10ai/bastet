# HospitAI

AI-native property management system for aparthotels and hotels. First deployment: Bastet Aparthotels, Hurghada (270 units). Live at [app.hospitai.uk](https://app.hospitai.uk).

## Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 14 (App Router), React 18, TypeScript strict |
| Database and auth | Supabase (PostgreSQL 17, Row Level Security, GoTrue) |
| Styling | Tailwind CSS 3 |
| Validation | Zod |
| Logging | pino (`src/lib/logger.ts`); Sentry when `SENTRY_DSN` is set |
| AI | Claude API (`src/lib/ai-brain.ts`, `src/lib/ai-chat.ts`) with PII anonymisation |
| Tests | Vitest (unit), Playwright (end-to-end) |
| Hosting | Vercel (`lhr1`); Dockerfile for self-hosted / Edge Box |

## Getting started

```bash
nvm use                      # Node 20 (see .nvmrc)
npm ci
cp .env.example .env.local   # fill in Supabase keys
npm run dev                  # http://localhost:3000
```

Required environment variables are validated at server start by `src/lib/env.ts` (wired through `src/instrumentation.ts`). Blank lines copied from `.env.example` count as unset. `next start` and Docker refuse to start with a readable list of what is missing or malformed; on Vercel, where there is no process to stop, every request fails with that list in the function logs.

## Database

Schema lives in `supabase/migrations/` (numbered, apply in order). Apply with the Supabase SQL editor or `supabase db push`. Migrations `00019` to `00034` (October 2026 audit, grade-A programme and deep test) must be applied to production before deploying the current branch:

- `00019_security_hardening.sql`: `audit_log` table, tenant-scoped RLS, RLS on four previously open tables, `guests.property_id`
- `00020_booking_integrity.sql`: exclusion constraint against double bookings, `checkin_booking`, `checkout_booking`, `record_invoice_payment` functions
- `00021_property_vat.sql`: `properties.vat_rate_percent`
- `00022_grants.sql`, `00023_collision_safe_references.sql`: role grants, collision-safe references
- `00024_pii_and_property_membership.sql`: encrypted passport column, `staff_properties`
- `00025_night_audit_and_idempotency.sql`: `daily_closes`, `run_night_audit()`, event idempotency, workflow versions
- `00026_folio_ledger.sql`: `folios`, append-only `folio_lines`, `refunds`, `department_budgets`, room charges per night, invoices issued from the folio and frozen, `revenue_by_stay_date()`
- `00027_rate_plans.sql`: `rate_plans` with a single-default trigger, `bookings.rate_plan_id` and `rate_plan_snapshot`, `quote_stay()` per-night pricing; seeds a BAR plan per property
- `00031_gl_accounts.sql`: `gl_accounts` chart of accounts per property with defaults, used by the accounting export
- `00030_pos.sql`: `pos_outlets`, `pos_items`, `pos_tickets`, `post_pos_ticket()` (outlet ticket to the in-house folio as charge and VAT lines), `void_pos_ticket()`
- `00029_guest_portal.sql`: `booking_access_tokens` (hashed, expiring, revocable guest links), `bookings.precheckin` and `precheckin_completed_at`
- `00028_group_bookings.sql`: `booking_groups`, `bookings.group_id`, `add_group_rooms()` (atomic room blocks), `group_statement()`, `record_group_payment()` (one payment allocated across room folios), `cancel_group()`
- `00032_guests_property_backfill.sql`: attaches guests with no property to the single property (single-property databases) and makes `guests.property_id` NOT NULL when nothing violates it
- `00033_tenant_isolation.sql`: active staff only; tenant checks and role floors on every policy; `property_id` on notifications, system events and audit log; channel credentials server-only; no self-granted property membership; `search_path` pinned on SECURITY DEFINER functions; no TRUNCATE for app roles
- `00034_ledger_integrity.sql`: ledger tables written only through functions that check property and role; invoice payments post to the folio; issued invoices cannot be reverted or deleted; night audit only for ended days; POS ticket idempotency; one open checkout clean per unit and day

Re-running an older migration after `00033`/`00034` reinstates superseded definitions; re-run `00033` and `00034` afterwards. `npm run test:db` applies every migration to a throwaway PostgreSQL (server binaries required, `PG_BIN` to override) and runs the RLS and ledger regression tests in `tests/db/`.

## Authorisation model

Every API route under `src/app/api/v1` calls `requireRole(request, ROLES.<group>)` from `src/lib/api-auth.ts`. Identity is verified with `auth.getUser()` (never `getSession()`). Role groups, in ascending privilege: `ALL_STAFF`, `OPERATIONS`, `FRONT_DESK`, `MANAGEMENT`, `ADMIN`, `OWNER`. Row Level Security enforces property scoping and role floors a second time in the database.

Mutating requests also require the CSRF double-submit token (`GET /api/v1/csrf`, then `X-CSRF-Token` header).

## Security configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `PII_ENCRYPTION_KEY` | Production | 32 random bytes, base64 (`openssl rand -base64 32`). Encrypts passport numbers at rest (AES-256-GCM, `src/lib/pii-crypto.ts`). Run `POST /api/v1/admin/encrypt-pii` once after setting it to encrypt rows created earlier. |
| `SUPABASE_JWT_SECRET` | Recommended | Verifies session tokens locally (`src/lib/jwt-verify.ts`) instead of one auth-server call per API request. Projects on asymmetric signing keys need nothing: the JWKS is used. Without either, routes fall back to `auth.getUser()`. |
| `PII_ENCRYPTION_KEY_PREVIOUS` | During rotation | The key being retired; see `docs/runbooks/key-rotation.md`. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Production on Vercel | Shared rate limiting for login, password reset and AI endpoints. Without them the limiter is per-instance and the server logs a warning. |
| `TRUST_PROXY_HEADERS` | Self-hosted behind a proxy | `true` when a reverse proxy in front overwrites `X-Forwarded-For`/`X-Real-IP`. On Vercel they are trusted automatically; elsewhere they are ignored, so per-IP limits cannot be dodged by rotating the header (per-account limits still apply). |
| `SUPABASE_JWT_ISSUER` | Optional | Expected `iss` of access tokens when it is not `<NEXT_PUBLIC_SUPABASE_URL>/auth/v1` on a `*.supabase.co` project. |
| `MFA_ENFORCE` | Optional, default `true` | Owners and admins must enrol an authenticator app (Settings > Security) before using the system. Set `false` during rollout. |
| `MFA_REQUIRED_ROLES` | Optional, default `owner,admin` | Roles that must enrol when `MFA_ENFORCE` is on. Every enrolled user, whatever their role, must verify the code each session. |
| `AUTO_PRICING_ENABLED` | Optional, default off | Lets the pricing automation write rates (one change per type per day, ±30% drift limit). |
| `SENTRY_DSN` | Recommended | Error reporting, initialised in `src/instrumentation.ts`. |
| `CRON_SECRET` | Production | Bearer token sent to `/api/v1/cron/*` by Vercel Cron (night audit 03:00 UTC, automations 05:00 UTC, FX rates 06:15 UTC) and by the GitHub Actions scheduler in `.github/workflows/automations-cron.yml`, which calls the automations route every 15 minutes because Vercel's Hobby plan only allows daily crons. Vercel Cron sends GET: a GET with the secret runs the job (`?status=1` only reports), POST does the same for other schedulers. Admins can also trigger these by hand, scoped to their own properties. |
| `SCHEDULER_INTERVAL_MINUTES` | Optional, default `15` | How often the automations route is expected to run; the health check reports `scheduler` degraded after twice this interval (minimum 60 min). Set `1440` on an environment that relies on the daily Vercel cron alone. |
| `ANTHROPIC_MODEL` | Optional, default `claude-sonnet-5-5` | Claude model for the AI brain and chat (`src/lib/ai-model.ts`). |
| `OPEN_EXCHANGE_RATES_APP_ID` | Optional | Exchange-rate provider; without it ECB reference rates (frankfurter.app) are used. |

Content-Security-Policy is generated per request in `src/middleware.ts` with a nonce; scripts never run from `unsafe-inline`. The CSRF cookie uses the `__Host-` prefix on https deployments.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build (`output: standalone`) |
| `npm run lint` | ESLint (`next lint`) |
| `npm test` | Vitest unit tests |
| `npm run test:coverage` | Unit tests with v8 coverage |
| `npm run test:e2e` | Playwright smoke tests and authenticated journeys (`E2E_EMAIL`/`E2E_PASSWORD`) |
| `npm run test:db` | Migrations, row-level security and ledger tests against a throwaway PostgreSQL |
| `node scripts/deep-test.mjs` | End-to-end API battery against a running server (see `docs/STAGING.md`) |
| `npm run test:load` | Load test: 50 virtual users on dashboard, availability, bookings and a booking write path |
| `npm run drill:backup` | Backup and restore drill against the local Supabase stack |

## Docker

```bash
docker build -t hospitai \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=... \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=... .
docker run -p 3000:3000 --env-file .env.production hospitai
```

`docker-compose.yml` adds a PostgreSQL and an MQTT container for the Edge Box prototype. It does not run the Supabase auth stack, so point `NEXT_PUBLIC_SUPABASE_URL` at a hosted or locally running Supabase project.

## Guest portal

Front desk creates a link per booking (`POST /api/v1/bookings/:id/portal-link`); the guest opens `/stay/<token>` without logging in and sees the stay, the rate plan terms and the folio, and completes online check-in (arrival time, party size, requests, consent). Only the SHA-256 of the token is stored, links expire a week after check-out and can be revoked, public routes are rate limited per address, and the page never shows identity documents or internal notes.

## Money flow

Outlets (restaurant, bars, spa, minibar) post tickets to the in-house guest's folio from the till at `/dashboard/pos`: items come from the outlet catalogue (`pos_items`), each item becomes a charge line with its VAT line through `post_folio_charge`, the ticket is kept in `pos_tickets` for outlet reporting, and a manager void (`void_pos_ticket`) reverses every line. Prices come from `quote_stay`: the seasonal rate per night (`rates`, Best Available Rate) adjusted by the booking's rate plan (`rate_plans`: percent off, markup, fixed nightly, with cancellation terms, minimum nights, validity and channel restrictions). The booking stores the plan id and a snapshot, so editing a plan never changes a sold stay. A group booking (`booking_groups`) owns several room bookings blocked atomically for the same dates; each room keeps its own folio and the organiser can pay in one go, allocated across the rooms (`record_group_payment`). Every stay has a folio (`folios`, opened at check-in or by a deposit). The night audit posts the room charge, VAT and tourism levy for each night; the front desk posts extras and payments through `POST /api/v1/bookings/:id/folio`. Ledger lines are append-only: a mistake is voided with a reversing line, a payment is reversed with a refund, both need a manager and a reason. Check-out requires a zero balance unless a manager overrides. An invoice is issued from the folio and frozen by a database trigger once issued. Revenue reports (`/api/v1/finance/revenue`, finance summary) recognise room revenue by stay date; budgets come from `department_budgets`. The accounting export (`/api/v1/finance/export`, see `docs/ACCOUNTING-EXPORT.md`) turns the ledger into a balanced double-entry journal mapped to the property's chart of accounts (`gl_accounts`).

## Operations

`GET /api/v1/health` probes the database, the schema level, the auth server, cron freshness and the last night-audit close, and returns 503 when a hard dependency is down. Runbooks for deploy, rollback, key rotation, incident response, the night audit and backup/restore are in `docs/runbooks/`; environments and promotion in `docs/STAGING.md`; alert rules and on-call in `docs/ALERTING.md`.

## Documentation

`docs/README.md` is the index: architecture, generated data dictionary, architecture decision records, runbooks, staging, alerting and the load-test baseline. `CONTRIBUTING.md` lists the rules reviewers enforce.

## Known gaps

See the October 2026 code audit for the full list. Not yet built: channel manager integration (OTA sync), card payments (Stripe), email and SMS delivery (all three need provider credentials; the seams are described in `docs/INTEGRATIONS.md`), door-lock and BMS integration. Screens that show sample or modelled data carry a visible "Demo data" or "Modelled estimate" banner.

## Project layout

```
src/app/api/v1/      75 API routes (auth, bookings, guests, housekeeping, finance, AI ...)
src/app/dashboard/   49 dashboard pages
src/lib/             engines and shared server code (auth, booking, finance, event bus, AI)
src/components/      UI components
supabase/migrations/ schema, RLS policies, database functions
tests/               unit (tests/lib) and end-to-end (tests/e2e)
```
