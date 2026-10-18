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

Required environment variables are validated at server start by `src/lib/env.ts` (wired through `src/instrumentation.ts`). The server refuses to start with a readable list of what is missing.

## Database

Schema lives in `supabase/migrations/` (numbered, apply in order). Apply with the Supabase SQL editor or `supabase db push`. Migrations `00019` to `00021` (October 2026 audit) must be applied to production before deploying the current `main`:

- `00019_security_hardening.sql`: `audit_log` table, tenant-scoped RLS, RLS on four previously open tables, `guests.property_id`
- `00020_booking_integrity.sql`: exclusion constraint against double bookings, `checkin_booking`, `checkout_booking`, `record_invoice_payment` functions
- `00021_property_vat.sql`: `properties.vat_rate_percent`

## Authorisation model

Every API route under `src/app/api/v1` calls `requireRole(request, ROLES.<group>)` from `src/lib/api-auth.ts`. Identity is verified with `auth.getUser()` (never `getSession()`). Role groups, in ascending privilege: `ALL_STAFF`, `OPERATIONS`, `FRONT_DESK`, `MANAGEMENT`, `ADMIN`, `OWNER`. Row Level Security enforces property scoping and role floors a second time in the database.

Mutating requests also require the CSRF double-submit token (`GET /api/v1/csrf`, then `X-CSRF-Token` header).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build (`output: standalone`) |
| `npm run lint` | ESLint (`next lint`) |
| `npm test` | Vitest unit tests |
| `npm run test:coverage` | Unit tests with v8 coverage |
| `npm run test:e2e` | Playwright smoke tests |

## Docker

```bash
docker build -t hospitai \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=... \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=... .
docker run -p 3000:3000 --env-file .env.production hospitai
```

`docker-compose.yml` adds a PostgreSQL and an MQTT container for the Edge Box prototype. It does not run the Supabase auth stack, so point `NEXT_PUBLIC_SUPABASE_URL` at a hosted or locally running Supabase project.

## Known gaps

See the October 2026 code audit for the full list. Not yet built: guest folio and ledger, night audit, channel manager integration, card payments, refunds, email and SMS delivery, door-lock and BMS integration. Screens that show sample or modelled data carry a visible "Demo data" or "Modelled estimate" banner.

## Project layout

```
src/app/api/v1/      75 API routes (auth, bookings, guests, housekeeping, finance, AI ...)
src/app/dashboard/   49 dashboard pages
src/lib/             engines and shared server code (auth, booking, finance, event bus, AI)
src/components/      UI components
supabase/migrations/ schema, RLS policies, database functions
tests/               unit (tests/lib) and end-to-end (tests/e2e)
```
