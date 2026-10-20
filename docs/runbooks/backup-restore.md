# Backup and restore

## Targets

| | Target | How it is met |
| --- | --- | --- |
| RPO (data you can lose) | 1 hour normal, 24 hours worst case | Supabase Pro daily backups (7 days) plus Point-in-Time Recovery (PITR) add-on; PITR brings RPO to about 2 minutes |
| RTO (time to be back) | 1 hour | Restore via Supabase dashboard; the app needs no change if the project ref stays the same |
| Verified | Quarterly | The restore drill below, logged in the ops calendar |

Supabase (not us) backs up auth users and storage objects with the project.
Encrypted passport numbers are only readable with the `PII_ENCRYPTION_KEY`
that was current when they were written: keep retired keys for 90 days
(see [key-rotation.md](key-rotation.md)).

## Manual backup before risky changes

```bash
supabase link --project-ref <prod-ref>
supabase db dump --linked --data-only -f backups/prod-data-$(date +%F).sql
supabase db dump --linked -f backups/prod-schema-$(date +%F).sql
```

Store the files in the encrypted ops bucket, never in the repository. A data
dump contains guest personal data and falls under the retention policy
(delete after 35 days unless it is an incident artefact).

## Restore scenarios

### A table or rows were damaged, database is otherwise fine

Use PITR to a **new** project at the moment before the damage, then copy the
rows across with `pg_dump -t <table> | psql`, inside a transaction, reviewed
by a second person. Do not restore the whole production project for a
single table; you would lose every booking taken since.

### Whole project lost or corrupted

1. Supabase dashboard > Database > Backups > choose the latest daily backup or
   a PITR timestamp > Restore. The project ref and keys stay the same, so
   Vercel needs no change.
2. While it restores (10-40 minutes for our size), tell the front desk to
   work from the printed arrivals list and record payments on paper.
3. When the dashboard says the restore is complete:
   - `GET /api/v1/health` is `healthy`.
   - Sign in; open today's arrivals; open a folio.
   - Compare `SELECT count(*) FROM bookings` and `SELECT max(created_at) FROM
     folio_lines` with the last known figures to measure the data gap.
4. Re-enter bookings and payments taken since the restore point from the
   paper record; mark each with a folio note "re-entered after restore
   <date>" so the audit trail explains the timestamps.
5. Run the night audit by hand if a close was lost ([night-audit.md](night-audit.md)).

### Moving to a new project (region move, account change)

`supabase db dump` schema and data, create the project, `supabase db push`
the migrations, then `psql < data.sql`. If the target is a plain PostgreSQL
(an Edge Box running without Supabase), create `btree_gist` and `pgcrypto`
and an `auth` schema with `uid()`, `role()` and `jwt()` stubs before
restoring, or the booking overlap constraint and every RLS policy fail to
restore; `scripts/backup-restore-drill.sh` shows the exact statements. Auth users must be exported with the
Supabase CLI (`supabase auth export` where available) or re-invited; passwords
do not move. Update the Supabase variables in Vercel and redeploy.

## Restore drill

`npm run drill:backup` (`scripts/backup-restore-drill.sh`) runs the full
procedure against the local Supabase stack: dumps the database, restores
it into a scratch database, compares row counts for every business table,
and checks that a booking still resolves to its folio balance. It takes about
a minute and exits non-zero on any mismatch.

Quarterly, also do a production drill: PITR-restore production into a
throwaway project, point a local `.env` at it, run
`node scripts/deep-test.mjs` in read-only mode against it, and record the
time taken (that is the measured RTO). Delete the throwaway project
afterwards; it contains personal data.
