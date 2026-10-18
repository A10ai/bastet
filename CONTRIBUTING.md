# Contributing

## Setup

```bash
npx -y npm@12 install          # npm 10 crashes on this tree
supabase start                 # local Postgres, auth, PostgREST (Docker)
supabase db reset              # migrations + seed
cp .env.example .env.local     # fill the Supabase values from `supabase status`
npm run dev
```

Test accounts after `supabase db reset` are created by
`scripts/ci-local-stack.sh` (owner, manager, reception, housekeeping;
password in the script). Never reuse them anywhere else.

## Before you open a pull request

```bash
npm run check                  # tsc, lint at zero warnings, unit tests
npm run test:coverage          # thresholds 70/50/70/70 on src/lib
node scripts/deep-test.mjs     # against your local server, MODE=full
PLAYWRIGHT_BASE_URL=http://localhost:3000 E2E_EMAIL=e2e@bastet.com E2E_PASSWORD=... npx playwright test --workers=1 --retries=0
                               # always point at a running server; without PLAYWRIGHT_BASE_URL Playwright builds and starts its own,
                               # never do that while another server is serving the same .next directory
```

CI runs the same plus the `integration` job that builds a fresh local
Supabase from the migrations.

## Rules that reviewers enforce

- **Every route**: `requireRole`, Zod validation, `withErrorHandler` or an
  explicit try/catch, `logAudit` on writes. No `getSession()`, no service
  role in user request paths.
- **Every table**: row-level security in the same migration, including
  policies that make `INSERT ... RETURNING` work for the roles that insert.
- **Money**: never write `folio_lines`, `payments` or `invoices` directly;
  call the database functions. Corrections are reversing lines.
- **Migrations**: additive and backward compatible with the running app
  (columns nullable or defaulted, functions before callers). Update
  `docs/DATA-DICTIONARY.md` with the generator.
- **Routes**: run `node scripts/generate-openapi-paths.mjs`; the contract
  test fails otherwise.
- **Pages**: data through `useApi`/SWR, sections in `src/components`,
  no page above 1,000 lines, no customer names, demo data labelled with
  `DemoDataBanner` and `meta.demo`.
- **Lint**: zero warnings. Use `unknown` plus a narrow type, not `any`.
- **Secrets**: never in the repository. `.env.local` is yours alone;
  rotation is documented in `docs/runbooks/key-rotation.md`.
- **Decisions**: a change that reverses an ADR gets a new ADR.

## Commit messages

Imperative subject under 72 characters, a body that says why, and the
verification you ran (tsc, lint, tests, deep test, journeys).
