# Environments and staging

| Environment | App | Database | Data | Who |
| --- | --- | --- | --- | --- |
| Local | `npm run dev` on :3000 | Supabase CLI stack (`supabase start`, Postgres :54322, API :54321) | `supabase/seed.sql`: one property, 20 rooms, demo guests and bookings | Developers |
| CI | `next start` in the `integration` job | Fresh Supabase CLI stack per run (`scripts/ci-local-stack.sh`) | Seed | GitHub Actions |
| Staging | Vercel Preview deployment of `main` at `staging.hospitai.uk` | Separate Supabase project `hospitai-staging` | Seed plus synthetic bookings; **never** production guest data | Team, pilot hotel testers |
| Production | Vercel Production at `app.hospitai.uk` | Supabase project `hospitai-prod` (PITR on) | Real | Hotel staff |

Staging and production share nothing: separate Supabase projects, separate
keys, separate `PII_ENCRYPTION_KEY`, separate Upstash database, separate
Sentry environment tag (`SENTRY_ENVIRONMENT=staging`).

## Setting staging up (once)

1. Create the Supabase project `hospitai-staging` in the same region as
   production. Enable TOTP MFA under Auth > Providers (local `config.toml`
   already does this for the CLI stack).
2. Apply the schema and seed:

   ```bash
   supabase link --project-ref <staging-ref>
   supabase db push
   psql "$STAGING_DB_URL" -f supabase/seed.sql
   ```

3. Create the staff accounts in Auth > Users (owner, admin, manager,
   receptionist, housekeeping) and insert the matching `staff` rows; the
   seed file shows the shape. Use `@staging.hospitai.uk` addresses that are
   obviously not real people.
4. In Vercel, add the staging values under the **Preview** environment scope
   (so every preview deployment uses staging, never production):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL=https://staging.hospitai.uk`,
   `PII_ENCRYPTION_KEY` (its own), `CRON_SECRET` (its own),
   `UPSTASH_REDIS_REST_URL/TOKEN` (its own database), `SENTRY_DSN`,
   `SENTRY_ENVIRONMENT=staging`, `MFA_ENFORCE=true`.
5. Assign the domain `staging.hospitai.uk` to the `main` branch's preview.
6. Vercel crons run only on Production. For staging, create a GitHub Actions
   scheduled workflow (or an Upstash QStash schedule) that calls the three
   cron routes with the staging `CRON_SECRET`, so the night audit is
   exercised on staging every night.

## Promotion flow

```
feature branch → PR (CI: tsc, lint, unit+coverage, integration deep test, journeys)
   → merge to main → Preview deploy = staging (automatic)
   → soak at least one night (night audit ran, health "healthy", no new Sentry issues)
   → Promote to Production in Vercel (or merge main → production branch if configured)
   → smoke test (docs/runbooks/deploy.md)
```

Migrations are pushed to staging first (`supabase db push` against the
staging ref) and to production only after the staging soak.

## Running the full test battery against staging

```bash
BASE_URL=https://staging.hospitai.uk MODE=full \
SB_URL=https://<staging-ref>.supabase.co SB_SERVICE=<staging service key> \
ACCOUNTS='{"owner":{"email":"owner@staging.hospitai.uk","password":"..."}, ...}' \
node scripts/deep-test.mjs

E2E_EMAIL=e2e@staging.hospitai.uk E2E_PASSWORD=... PLAYWRIGHT_BASE_URL=https://staging.hospitai.uk npx playwright test --workers=1 --retries=0
# one dedicated account for the journeys: the login limiter allows 5 attempts per account per 15 minutes

BASE_URL=https://staging.hospitai.uk EMAIL=... PASSWORD=... USERS=50 DURATION=60 node scripts/load-test.mjs
```

The deep test in `MODE=full` creates and cancels bookings, posts and refunds
payments and runs a night audit: that is fine on staging and forbidden on
production (use `MODE=readonly` there).

## Refreshing staging data

Reset to the seed with `supabase db reset --linked` against the staging ref
(destroys staging data; never run it linked to production: check `supabase
projects list` shows the staging ref as linked first). Do not copy production
data to staging; if a bug needs real data shapes, reproduce with synthetic
rows or debug on a PITR copy that is deleted the same day.
