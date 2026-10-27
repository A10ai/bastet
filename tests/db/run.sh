#!/usr/bin/env bash
# Database regression tests: applies every migration to a throwaway
# PostgreSQL cluster (with a minimal Supabase shim), seeds two properties,
# then runs each tests/db/t*.sql in its own copy of that database.
# Test files RAISE EXCEPTION on any failed expectation.
#
#   tests/db/run.sh            run all tests
#   tests/db/run.sh t10        run tests whose file name contains "t10"
#   PGTEST_KEEP=1 tests/db/run.sh   leave the cluster running for debugging
#
# Needs PostgreSQL 15+ server binaries (initdb, pg_ctl). PG_BIN overrides the
# directory; by default the newest /usr/lib/postgresql/*/bin is used.
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
FILTER=${1:-}
PG_BIN=${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)}
[ -n "$PG_BIN" ] && [ -x "$PG_BIN/initdb" ] || PG_BIN=$(dirname "$(command -v initdb || echo /nonexistent/initdb)")
[ -x "$PG_BIN/initdb" ] || { echo "initdb not found; set PG_BIN" >&2; exit 2; }
PORT=${PGTEST_PORT:-55433}
WORK=$(mktemp -d /tmp/bastet-dbtest.XXXXXX)
chmod 755 "$WORK"

# initdb refuses to run as root; run the server as the postgres user then.
AS=()
if [ "$(id -u)" = 0 ]; then
  id postgres >/dev/null 2>&1 || { echo "running as root needs a 'postgres' OS user" >&2; exit 2; }
  chown postgres "$WORK"
  AS=(runuser -u postgres --)
fi

stop() {
  if [ -z "${PGTEST_KEEP:-}" ]; then
    "${AS[@]}" "$PG_BIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true
    rm -rf "$WORK"
  else
    echo "cluster kept: PGHOST=$WORK PGPORT=$PORT PGUSER=postgres psql -d bastet_template"
  fi
}
trap stop EXIT

"${AS[@]}" "$PG_BIN/initdb" -D "$WORK/data" -A trust -U postgres >"$WORK/initdb.log" 2>&1
"${AS[@]}" "$PG_BIN/pg_ctl" -D "$WORK/data" -l "$WORK/pg.log" -w \
  -o "-p $PORT -k $WORK -c listen_addresses='' -c fsync=off -c max_connections=50" start >/dev/null

export PGHOST=$WORK PGPORT=$PORT PGUSER=postgres
PSQL=(psql -X -q -v ON_ERROR_STOP=1 --no-psqlrc)

run_file() { # db file
  if ! out=$("${PSQL[@]}" -d "$1" -f "$2" 2>&1); then
    echo "$out" | grep -v '^$' | tail -20
    return 1
  fi
}

createdb bastet_template
run_file bastet_template "$HERE/shim.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  run_file bastet_template "$f" || { echo "FAILED applying $(basename "$f")"; exit 1; }
done
# 00033 onwards are the authoritative hardening migrations: re-running them
# must succeed and leave the same state (the tests below run on that state).
for f in "$ROOT"/supabase/migrations/*.sql; do
  n=$(basename "$f" | cut -c1-5)
  [ "$((10#$n))" -ge 33 ] || continue
  run_file bastet_template "$f" || { echo "FAILED re-applying $(basename "$f")"; exit 1; }
done
run_file bastet_template "$HERE/helpers.sql"
run_file bastet_template "$HERE/seed.sql"

shopt -s nullglob
pass=0; fail=0; failed=()
for t in "$HERE"/t*.sql; do
  name=$(basename "$t" .sql)
  [[ -n "$FILTER" && "$name" != *"$FILTER"* ]] && continue
  db="t_${name//[^a-zA-Z0-9]/_}"
  createdb -T bastet_template "$db"
  if run_file "$db" "$t"; then
    echo "ok   $name"; pass=$((pass + 1))
  else
    echo "FAIL $name"; fail=$((fail + 1)); failed+=("$name")
  fi
done
echo "db tests: $pass passed, $fail failed${failed:+ (${failed[*]})}"
[ "$fail" = 0 ]
