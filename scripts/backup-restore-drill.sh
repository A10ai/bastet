#!/usr/bin/env bash
# Backup and restore drill against the LOCAL Supabase stack.
#
# A backup nobody has restored is a hope, not a backup. This script dumps the
# local database, restores it into a scratch database inside the same
# Postgres container, and compares row counts of the business tables. It is
# the same procedure the runbook (docs/runbooks/backup-restore.md) describes
# for production, minus the production credentials.
#
# Usage: bash scripts/backup-restore-drill.sh   (requires `supabase start`)
set -euo pipefail
DB="$(docker ps --format '{{.Names}}' | grep supabase_db | head -1)"
[[ -z "$DB" ]] && { echo "local Supabase is not running (supabase start)"; exit 2; }
STAMP="$(date +%Y%m%d_%H%M%S)"
DUMP="/tmp/hospitai-drill-$STAMP.dump"
SCRATCH="drill_$STAMP"
TABLES="properties apartments guests bookings folios folio_lines payments invoices housekeeping_tasks maintenance_requests staff audit_log daily_closes"

echo "--- 1. dump (custom format, schema + data, public schema only)"
docker exec -i "$DB" pg_dump -U postgres -d postgres -Fc -n public -f "/tmp/drill.dump"
docker cp "$DB:/tmp/drill.dump" "$DUMP"
ls -la "$DUMP" | awk '{print "   size:", $5, "bytes"}'

echo "--- 2. restore into scratch database $SCRATCH"
docker exec -i "$DB" psql -U postgres -d postgres -qc "CREATE DATABASE $SCRATCH"
# A public-schema dump assumes what a Supabase project always provides:
# btree_gist (the booking overlap exclusion constraint needs it) and the
# auth schema that RLS policies call. Recreate both before restoring, exactly
# as the runbook says to do when restoring into a plain Postgres.
docker exec -i "$DB" psql -U postgres -d "$SCRATCH" -q <<'SQL'
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT NULL::text $$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT NULL::jsonb $$;
SQL
docker exec -i "$DB" pg_restore -U postgres -d "$SCRATCH" --no-owner --no-privileges "/tmp/drill.dump" 2> "/tmp/drill-restore-$STAMP.log" || true
ERRS=$(grep "ERROR" "/tmp/drill-restore-$STAMP.log" | grep -v 'schema "public" already exists' || true)
if [[ -n "$ERRS" ]]; then echo "   restore errors:"; echo "$ERRS" | sed 's/^/     /'; else echo "   restore log: clean"; fi

echo "--- 3. compare row counts"
MISMATCH=0
for t in $TABLES; do
  a=$(docker exec -i "$DB" psql -U postgres -d postgres -Atc "select count(*) from $t" 2>/dev/null || echo "n/a")
  b=$(docker exec -i "$DB" psql -U postgres -d "$SCRATCH" -Atc "select count(*) from $t" 2>/dev/null || echo "n/a")
  flag=""; [[ "$a" != "$b" ]] && { flag="  <-- MISMATCH"; MISMATCH=$((MISMATCH+1)); }
  printf "   %-22s source=%-6s restored=%-6s%s\n" "$t" "$a" "$b" "$flag"
done

echo "--- 4. spot check: a booking round-trips with its folio balance"
docker exec -i "$DB" psql -U postgres -d "$SCRATCH" -Atc "select b.reference, coalesce(folio_balance(f.id),0) from bookings b left join folios f on f.booking_id=b.id order by b.created_at desc limit 3" 2>/dev/null | sed 's/^/   /' || echo "   (folio functions not restored; see runbook step on functions)"

echo "--- 4b. the booking overlap exclusion constraint survived the restore"
EXCL=$(docker exec -i "$DB" psql -U postgres -d "$SCRATCH" -Atc "select count(*) from pg_constraint where contype='x' and conrelid='bookings'::regclass")
echo "   exclusion constraints on bookings: $EXCL"

echo "--- 5. cleanup"
docker exec -i "$DB" psql -U postgres -d postgres -qc "DROP DATABASE $SCRATCH"
docker exec -i "$DB" rm -f /tmp/drill.dump
rm -f "$DUMP"

if [[ -n "$ERRS" ]]; then echo "DRILL FAILED: restore reported errors"; exit 1; fi
if [[ "$MISMATCH" -gt 0 ]]; then echo "DRILL FAILED: $MISMATCH table(s) differ"; exit 1; fi
if [[ "$EXCL" -lt 1 ]]; then echo "DRILL FAILED: booking overlap constraint missing (btree_gist not installed before restore?)"; exit 1; fi
echo "DRILL PASSED: dump restored and all business tables match"
