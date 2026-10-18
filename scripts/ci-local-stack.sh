#!/usr/bin/env bash
# Stand up the local Supabase stack from migrations + seed, create the five
# seed logins, build the app against it and run the deep test and the
# authenticated Playwright journeys. Used by CI (integration job) and by hand.
#
# Requires: docker, supabase CLI, node 20+. Leaves nothing running on exit.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-3100}"
PASSWORD="${SEED_PASSWORD:-BastetDev2026!}"
export CRON_SECRET="${CRON_SECRET:-ci-cron-secret-$(date +%s)}"
export PII_ENCRYPTION_KEY="${PII_ENCRYPTION_KEY:-$(openssl rand -base64 32)}"
export MFA_ENFORCE="${MFA_ENFORCE:-false}"
export AUTO_PRICING_ENABLED=false
export NEXT_TELEMETRY_DISABLED=1

cleanup() {
  echo "--- cleanup"
  [[ -n "${SERVER_PID:-}" ]] && kill "$SERVER_PID" 2>/dev/null || true
  supabase stop --no-backup >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "--- supabase start"
supabase start -x studio,imgproxy,inbucket,edge-runtime,logflare,vector,supavisor >/dev/null
supabase db reset >/dev/null
eval "$(supabase status -o env | sed 's/^/export /')"
export NEXT_PUBLIC_SUPABASE_URL="$API_URL"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export NEXT_PUBLIC_APP_URL="http://localhost:$PORT"
export PROPERTY_ID
PROPERTY_ID="$(docker exec -i "$(docker ps --format '{{.Names}}' | grep supabase_db)" psql -U postgres -d postgres -Atc 'select id from properties limit 1')"

echo "--- seed logins"
i=1
for email in owner@bastet.com manager@bastet.com reception@bastet.com housekeeping@bastet.com maintenance@bastet.com; do
  curl -sf -o /dev/null -X POST "$API_URL/auth/v1/admin/users" \
    -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "Content-Type: application/json" \
    -d "{\"id\":\"00000000-0000-0000-0000-00000000000$i\",\"email\":\"$email\",\"password\":\"$PASSWORD\",\"email_confirm\":true}"
  i=$((i+1))
done

echo "--- build + start"
npm run build >/dev/null
npx next start -p "$PORT" >/tmp/hospitai-server.log 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 60); do curl -sf "http://localhost:$PORT/api/v1/health" >/dev/null && break; sleep 1; done

echo "--- deep test"
ACCOUNTS=$(cat <<JSON
{"owner":{"email":"owner@bastet.com","password":"$PASSWORD"},"manager":{"email":"manager@bastet.com","password":"$PASSWORD"},"reception":{"email":"reception@bastet.com","password":"$PASSWORD"},"housekeeping":{"email":"housekeeping@bastet.com","password":"$PASSWORD"}}
JSON
)
BASE_URL="http://localhost:$PORT" MODE=full SB_URL="$API_URL" SB_SERVICE="$SERVICE_ROLE_KEY" OUT=deep-test-results.json ACCOUNTS="$ACCOUNTS" node scripts/deep-test.mjs
node -e 'const r=require("./deep-test-results.json"); if (r.fail>0) { console.error(`deep test: ${r.fail} failure(s)`); process.exit(1); } console.log(`deep test: ${r.pass} pass, ${r.warn} warn`)'

echo "--- playwright journeys"
# The deep test locked the owner account on purpose; journeys use the manager.
PLAYWRIGHT_BASE_URL="http://localhost:$PORT" E2E_EMAIL=manager@bastet.com E2E_PASSWORD="$PASSWORD" CI=1 npx playwright test --reporter=line
