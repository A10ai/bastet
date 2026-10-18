# Load test and capacity

`npm run test:load` (`scripts/load-test.mjs`) signs in once and runs N
virtual users for D seconds over the hot paths: dashboard stats, 7-day
availability, bookings list, booking detail, guests list, and one booking
create + cancel per 20 iterations. It fails if any read's p95 exceeds
`READ_P95_MS` (default 1500 ms) or any endpoint's error rate exceeds 1%.

## Baseline, 18 October 2026

Local production build (`next start`) on a developer laptop against the
local Supabase stack, seed data (270 rooms, ~60 bookings), 50 virtual users
for 30 seconds. Numbers are for sizing, not SLOs: production runs on Vercel
and hosted Supabase in another region.

| Endpoint | Requests | p50 | p95 | p99 | Errors |
| --- | ---: | ---: | ---: | ---: | ---: |
| availability (7 days, all rooms) | 2,543 | 123 ms | 192 ms | 232 ms | 0 |
| bookings list (50) | 2,543 | 77 ms | 121 ms | 156 ms | 0 |
| booking detail | 2,543 | 68 ms | 112 ms | 149 ms | 0 |
| guests list (50) | 847 | 74 ms | 118 ms | 158 ms | 0 |
| dashboard stats | 2,543 | 253 ms | 372 ms | 454 ms | 0 |
| booking create | 125 | 305 ms | 403 ms | 560 ms | 0 |
| booking cancel | 125 | 168 ms | 224 ms | 243 ms | 0 |

Total: 11,269 requests in 30 s (376 req/s), 125 bookings created and
cancelled, no double bookings, no 5xx.

A 270-room property with 50 concurrent staff sessions generates on the
order of 2-5 requests per second in practice, so the measured headroom is
roughly two orders of magnitude on the application tier.

## What the first run found

The first run of this test at 200 req/s produced 60% HTTP 401 after three
seconds. Every API request called `auth.getUser()`, which is a network call
to the auth server, which opens a database connection per call; the auth
container ran out of connections ("cannot assign requested address") and
the app treated the failures as unauthenticated. The fix (`src/lib/jwt-verify.ts`)
verifies the session token's signature locally with `SUPABASE_JWT_SECRET`
or the project JWKS and only falls back to the auth server when neither is
configured. Auth-server lookups during the test went from one per request
to zero, throughput from 198 to 376 req/s, and read p95 roughly halved.

## Running it

```bash
# local
BASE_URL=http://localhost:3100 EMAIL=owner@bastet.com PASSWORD=... USERS=50 DURATION=30 npm run test:load

# staging (never production: it writes bookings)
BASE_URL=https://staging.hospitai.uk EMAIL=... PASSWORD=... USERS=50 DURATION=60 npm run test:load
```

The login endpoint allows five attempts per account per fifteen minutes, so
a failed run cannot simply be retried against the same account straight
away; use another account or wait.

## Known hot spots

- `dashboard/stats` does several aggregate queries per call. It is the
  slowest read and the first candidate for a materialised daily summary if
  the dashboard ever feels slow.
- `booking create` runs the atomic `create_booking` function and the
  overlap exclusion constraint; at 125 writes in 30 s there was no
  contention. Writes concentrated on one room would serialise on that
  room's rows, which is the intended behaviour.
