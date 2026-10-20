# Rollback

Decide within five minutes. A rollback is cheap; an hour of a broken front
desk is not.

## Application rollback (Vercel)

1. Vercel dashboard > Deployments > the last known-good deployment >
   **Promote to Production** (or `vercel rollback <deployment-url>`).
   Takes under a minute and does not rebuild.
2. Smoke test as in [deploy.md](deploy.md).
3. Post in the incident channel: what was rolled back, to which SHA, why.
4. Revert the commit on `main` so the next automatic deploy does not ship the
   bad change again: `git revert <sha>` and merge through the normal PR flow.

Edge Box: `docker compose up -d app` with the previous image tag
(`image: hospitai:<previous-sha>` in `docker-compose.yml`), then
`docker compose ps` until healthy.

## When the release included a migration

The old code must still work against the new schema. Our migration rules
(additive, nullable, functions before callers) are there to make this true,
so the first step is always to roll back the application and *leave the
schema alone*. Only roll back a migration when the schema itself is the
problem (wrong constraint, bad trigger, data corruption).

### Rolling back a migration

1. Open an incident ticket and paste every statement you intend to run.
2. Stop the writers that could be affected: pause the automations cron in
   Vercel (Settings > Cron Jobs > disable) and, if it is between 02:30 and
   03:30 UTC, the night audit too.
3. Snapshot first: `supabase db dump --linked -f pre-rollback-$(date +%F).sql`
   (or confirm PITR is enabled on the project).
4. Each migration file in `supabase/migrations/` has a header comment listing
   the objects it creates. Write the inverse by hand (drop the function,
   drop the constraint, drop the column *only if nothing in production reads
   it*). Never drop a table with data; rename it (`ALTER TABLE x RENAME TO
   x_rolled_back_<date>`) so the data is still there.
5. Run it in the Supabase SQL editor inside a transaction:

   ```sql
   BEGIN;
   -- inverse statements
   SELECT count(*) FROM bookings;   -- sanity: still there
   COMMIT;  -- or ROLLBACK
   ```

6. Remove the migration's row from `supabase_migrations.schema_migrations` so
   `supabase db push` will re-apply the fixed version later:
   `DELETE FROM supabase_migrations.schema_migrations WHERE version = '00026';`
7. Re-enable the crons. Check `GET /api/v1/health`.

## Data fixes after a bad release

If a release posted wrong folio lines or charges, do **not** delete ledger
rows: the ledger is append-only and `folio_lines` rejects updates and deletes.
Void the wrong lines through `POST /api/v1/bookings/:id/folio` with
`action: "void_line"` (manager role, reason required), or in bulk with
`SELECT void_folio_line(id, '<staff uuid>', 'release <sha> correction')` for
each affected line id, inside a transaction, with the list of ids attached to
the ticket.
