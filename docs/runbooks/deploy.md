# Deploy

Production runs on Vercel (app) and a hosted Supabase project (database,
auth, storage). Edge Boxes run the same build in Docker on site.

## Before you deploy

1. CI is green on the commit: `tsc`, lint, unit tests with coverage, the
   `integration` job (deep test against a fresh local Supabase stack) and
   Playwright journeys.
2. `git log --oneline origin/main..HEAD -- supabase/migrations` shows whether
   this release carries migrations. If it does, read the **Migrations** section
   first; migrations go out *before* the code that needs them.
3. Check staging: the same commit has been running on staging for at least one
   night so the night audit cron has run once (see [../STAGING.md](../STAGING.md)).
4. Tell the front desk. Deploys are zero-downtime, but a migration that
   rewrites bookings or folios should not run during check-in (14:00-18:00) or
   check-out (08:00-12:00) local time. Prefer 22:00-02:00, before the 03:00
   night audit, so a bad migration is noticed before the close.

## Migrations

Migrations live in `supabase/migrations/` and are applied in order with the
Supabase CLI against the linked project:

```bash
supabase link --project-ref <prod-ref>          # once per machine
supabase db push --dry-run                       # lists what would run
supabase db push                                 # applies pending migrations
```

Rules:

- Every migration must be safe to run while the previous app version is still
  serving (add columns nullable or with defaults, add functions before routes
  call them, never drop in the same release that stops using something).
- Take a backup first (see [backup-restore.md](backup-restore.md)); Supabase
  Pro has daily backups and PITR, but a manual `supabase db dump` before a
  schema change costs two minutes and removes a conversation later.
- Watch `GET /api/v1/health` after pushing: `checks.database.detail` says
  "missing database functions" if the functions the app expects are not there.

## Application (Vercel)

1. Merge to `main`. Vercel builds and deploys automatically. The build runs
   `next build` with `output: standalone`; environment variables come from the
   Vercel project (see the table in `README.md`, "Security configuration").
2. Wait for the deployment to be *Ready*, then smoke test production:

   ```bash
   curl -s https://app.hospitai.uk/api/v1/health | jq .status     # "healthy"
   curl -s -o /dev/null -w "%{http_code}\n" https://app.hospitai.uk/login   # 200
   curl -s -o /dev/null -w "%{http_code}\n" https://app.hospitai.uk/api/v1/bookings   # 401
   ```

3. Sign in with a staff account, open a booking, confirm the folio panel loads
   and the dashboard shows today's arrivals.
4. Watch Sentry for new issues for 15 minutes. A new issue type after a deploy
   is treated as caused by the deploy until proven otherwise.
5. Record the release in the change log (commit SHA, migrations applied, who
   deployed, time).

### Environment variables that must exist in production

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL` (https), `PII_ENCRYPTION_KEY`,
`CRON_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`,
`SENTRY_DSN`. The health endpoint reports `degraded` when the shared rate
limiter or Sentry is missing, and `unhealthy` (503) when a Supabase variable is.

### Cron jobs

`vercel.json` declares three crons: night audit (03:00 UTC), automations
(05:00 UTC), FX rates (06:15 UTC). Vercel sends `Authorization: Bearer
$CRON_SECRET`. The Vercel **Hobby** plan rejects any cron that runs more than
once a day (the deploy fails with "Hobby accounts are limited to daily cron
jobs"), so the 15-minute automations cadence comes from
`.github/workflows/automations-cron.yml`, a GitHub Actions schedule that calls
`/api/v1/cron/automations` with the repository secret `CRON_SECRET` and the
repository variable `APP_URL`. Create both in GitHub (Settings > Secrets and
variables > Actions) or the workflow skips itself. On the Pro plan you can
instead set the automations schedule back to `*/15 * * * *` and delete the
workflow.

After the first deploy to a new project, confirm in the Vercel dashboard
(Settings > Cron Jobs) that all three are listed and that the first
automations run succeeded; the health check's `scheduler` entry turns `ok`
once a cycle has been recorded within `SCHEDULER_INTERVAL_MINUTES`.

## Edge Box (Docker)

```bash
docker build -t hospitai:<sha> \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=... \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=... .
docker compose up -d app
docker compose ps            # app must become "healthy" (HEALTHCHECK hits /api/v1/health)
```

The container runs the same crons only if something calls the cron routes;
on an Edge Box add a host `crontab` entry per job, e.g.
`0 3 * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/v1/cron/night-audit`.

## If anything in the smoke test fails

Go to [rollback.md](rollback.md). Do not try to fix forward on production
unless the fix is a configuration value.
