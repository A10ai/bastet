# 0002 Verify session tokens locally; auth server only as fallback

Date: 2026-10-18. Status: accepted.

## Context

`auth.getUser()` is the Supabase-recommended way to establish identity on
the server because it validates the token with the auth server. It is also
a network round trip per API request, and the auth server opens a database
connection per call. The first load test (50 users, 200 req/s) made the
local auth container run out of connections and 60% of requests failed as
unauthenticated.

## Decision

`getVerifiedUser` reads the access token from the cookie and verifies its
signature locally (`src/lib/jwt-verify.ts`, jose): HS256 with
`SUPABASE_JWT_SECRET` for legacy projects and the local stack, or the
project JWKS for projects on asymmetric keys. Audience, expiry and
`role=authenticated` are checked. Only when no key material is configured
does the code fall back to `getUser()`. Forged, expired, `alg:none`,
wrong-secret and wrong-role tokens are rejected and covered by the deep
test.

## Consequences

- Zero auth-server calls per request; throughput doubled in the load test.
- A revoked session stays valid until its token expires (one hour by
  default). Sign-out clears the cookie; admin "disable user" should be
  paired with a short JWT expiry if instant revocation matters.
- `SUPABASE_JWT_SECRET` is now a production variable (see README).
