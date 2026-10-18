# Alerting

Principle: a page means a person must act now. Everything else is a ticket
or a dashboard. Every alert below names the runbook that resolves it.

## Signals

| Signal | Source | Page / ticket | Runbook |
| --- | --- | --- | --- |
| `GET /api/v1/health` returns non-200 for 2 consecutive checks (1 min apart) from 2 regions | Uptime monitor (Better Stack / UptimeRobot / Checkly) | Page | incident-response.md |
| Health body `status: "degraded"` for more than 30 minutes | Uptime monitor keyword check on `"status":"healthy"` with 30 min grace | Ticket | incident-response.md (common failures) |
| `GET /login` non-200 or slower than 5 s | Uptime monitor | Page | incident-response.md |
| New Sentry issue in production | Sentry alert rule "A new issue is created", environment = production | Ticket (page if it mentions `auth`, `folio`, `payment`, `checkout`) | incident-response.md |
| Sentry: more than 20 events of one issue in 5 minutes | Sentry alert rule, frequency | Page | rollback.md |
| Sentry: error rate above 1% of transactions for 10 minutes | Sentry metric alert (`failure_rate()`) | Page | rollback.md |
| Night audit missed: health `night_audit` degraded after 06:00 local | Uptime monitor keyword check scheduled daily at 06:00, or the Vercel cron failure email | Page (Sev 2) | night-audit.md |
| Automations cron stale: health `scheduler` degraded | Same health monitor | Ticket | incident-response.md |
| Vercel deployment failed on `main` | Vercel notification (Slack/email) | Ticket | deploy.md |
| Supabase: CPU above 80% for 15 min, disk above 85%, connections above 80% of pool | Supabase > Reports and project alert emails | Ticket; page if disk | incident-response.md |
| Supabase: daily backup failed or PITR lagging | Supabase project alerts | Page (Sev 2) | backup-restore.md |
| Login rate limit tripped more than 50 times in an hour (`RATE_LIMITED` in logs) | Vercel log drain → query, or Upstash key count | Ticket; page if from many IPs (credential stuffing) | incident-response.md |
| Audit log entry `admin.encrypt_pii`, `settings.security`, role change to owner/admin | `audit_log` table; weekly report email | Review | key-rotation.md |

## Setting it up

### Uptime

Create two HTTP monitors: `https://app.hospitai.uk/api/v1/health` (expect
200 and body containing `"status":"healthy"`; 60 s interval; alert after 2
failures; a second "degraded" monitor with 30 min grace) and
`https://app.hospitai.uk/login` (expect 200). Add a third monitor that only
runs once a day at 06:00 local time checking the health body does **not**
contain `"night_audit":{"status":"degraded"`. Route pages to the on-call
phone, tickets to the ops channel.

The health endpoint probes dependencies at most once every 10 seconds per
instance and returns coarse details only, so polling it every minute from
several regions is safe.

### Sentry

Project `hospitai`, environments `production` and `staging`. Alert rules:

1. *New issue* (production): notify ops channel; add a condition "tags
   `route` contains `/auth/`, `/folio`, `/payments`, `/checkout`" → also page.
2. *Issue frequency*: "more than 20 events in 5 minutes" → page.
3. *Metric alert*: failure rate above 1% for 10 minutes on transactions
   `/api/v1/*` → page.
4. *Regression*: a resolved issue reappears after a deploy → ticket.

Releases: set `SENTRY_RELEASE` to the commit SHA in the Vercel build so a
regression is tied to a deploy and "roll back" is an obvious first move.

### Vercel

Project notifications: deployment failed, deployment error rate, cron job
failed. Send to the ops channel. Cron failures also show as health
`scheduler`/`night_audit` degraded, which is what the uptime monitor catches.

### Supabase

Project Settings > Alerts: enable CPU, memory, disk, connection and backup
alerts to the ops email. Review Reports > Query performance weekly; add
indexes through a migration, never in the dashboard.

## On call

One person per week, rota in the ops calendar; the owner is the escalation.
The on-call person has: Vercel access, Supabase access, Sentry access, the
password manager vault "HospitAI production", and this folder. Expected
acknowledgement time: 15 minutes for a page, next working day for a ticket.

## Reviewing alerts

Monthly: list every page from the month, mark it *actionable* or *noise*.
Any rule with more noise than actionable pages is tuned or removed. Any
incident a person reported before a monitor fired gets a new rule here.
