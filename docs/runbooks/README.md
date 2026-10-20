# Runbooks

Step-by-step procedures for operating HospitAI in production. Each one is
written so that a person who did not build the system can follow it at 03:00.

| Runbook | When to use it |
| --- | --- |
| [deploy.md](deploy.md) | Shipping a release to production (Vercel) or to an Edge Box (Docker) |
| [rollback.md](rollback.md) | A release is bad: application rollback, migration rollback |
| [key-rotation.md](key-rotation.md) | Rotating Supabase keys, `PII_ENCRYPTION_KEY`, `CRON_SECRET`, Upstash, Sentry |
| [incident-response.md](incident-response.md) | Something is down or wrong: severities, first 15 minutes, common failures, post-mortem |
| [night-audit.md](night-audit.md) | The 03:00 close did not run, ran twice, or posted wrong charges |
| [backup-restore.md](backup-restore.md) | Backups, point-in-time recovery, the restore drill, RPO/RTO |

Related: [../STAGING.md](../STAGING.md) (environments and promotion),
[../ALERTING.md](../ALERTING.md) (what pages whom and why).

## Conventions

- **Production database is never touched by hand without a ticket and a second person.** Every manual SQL statement is pasted into the incident or change ticket before it runs.
- `GET /api/v1/health` is the source of truth for "is it up": `healthy`, `degraded` (serving, something needs attention) or `unhealthy` (HTTP 503).
- Admin-only HTTP calls below assume a signed-in owner or admin session (cookie) with a CSRF token, or the `CRON_SECRET` bearer token for `/api/v1/cron/*`.
