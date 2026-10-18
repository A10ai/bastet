# Incident response

## Severities

| Sev | Definition | Examples | Response |
| --- | --- | --- | --- |
| 1 | Front desk cannot work, or guest data is exposed | Site down, sign-in broken for everyone, health 503, confirmed data breach | Page immediately, all hands, status update every 30 min |
| 2 | Core function broken with a workaround | Check-out fails for some bookings, night audit missed, folio totals wrong | Page during business hours, fix same day |
| 3 | Degraded, nobody blocked | Health `degraded`, Sentry spike without user reports, slow reports page | Ticket, fix within the week |

A Sev 1 involving personal data (passport numbers, guest contact details)
is also a potential personal data breach under UK GDPR: start the 72-hour
clock for assessing whether the ICO must be notified and note the time of
discovery in the ticket.

## Roles

- **Incident lead**: the person who declared it, until handed over. Owns the
  timeline, decides on rollback, is the only one who talks to the front desk
  and the owner.
- **Operator**: hands on keyboard. Pastes every command into the channel
  before running it against production.
- **Scribe** (Sev 1): keeps the timeline in the ticket.

## First 15 minutes

1. Declare it: open a ticket titled `INC-<date>-<short name>`, post in the
   incident channel, state the severity.
2. Check the obvious:

   ```bash
   curl -s https://app.hospitai.uk/api/v1/health | jq .
   ```

   `checks.database.fail` → Supabase status page (status.supabase.com) and
   the project's dashboard. `checks.auth.fail` → same, Auth service.
   `checks.config.fail` → a redeploy lost environment variables.
3. Correlate with changes: last deploy time (Vercel), last migration, last
   environment variable edit, last key rotation. If it started with a deploy,
   roll back now ([rollback.md](rollback.md)) and investigate afterwards.
4. Look at Sentry: Issues sorted by "first seen" in the last hour.
5. Tell the front desk what to do meanwhile (paper arrivals list is in the
   Edge Box runbook folder; it is printed by the night audit each morning).
6. Status update at 15 minutes even if the update is "still investigating".

## Common failures and what to do

| Symptom | Likely cause | Action |
| --- | --- | --- |
| Everyone gets "Too many attempts" on sign-in | Shared office IP hit the per-IP login ceiling (60/15 min), or a password spray | Check Upstash for key `rl:login_ip:<ip>`; delete it to unlock. If it is a spray, leave it and block the source at Vercel firewall |
| One user locked out | 5 failed attempts in 15 minutes on that account | Wait 15 minutes or delete `rl:login:<email>` in Upstash. Then send a password reset |
| Owner/admin stuck on MFA screen | Lost authenticator | Another admin: Admin > Users > reset MFA (deletes the factor); user re-enrols at next sign-in. If there is only one admin, remove the factor in Supabase Auth > Users |
| Health `night_audit` degraded, no close for today | Cron did not run or failed | [night-audit.md](night-audit.md) |
| Health `scheduler` degraded | Automations cron failing | Vercel > Cron Jobs > logs. Usually `CRON_SECRET` mismatch after a rotation, or a deploy that is still building |
| Booking create returns 409 `DOUBLE_BOOKING` for a room that looks free | Another booking (possibly cancelled in the UI but not in the database) overlaps | `GET /api/v1/availability?date_from&date_to` for that room; the exclusion constraint is right, the UI calendar was stale. Refresh; if it persists check the booking's status in Admin |
| Check-out refuses with 402 `OUTSTANDING_BALANCE` | Folio not settled | Front desk posts the payment or a manager overrides with `allow_outstanding_balance` and a reason |
| Folio total looks wrong | A line was posted twice or with the wrong amount | Do not edit rows. Void the line (manager, reason) and post the correct one. Both actions are in the booking's folio panel |
| Invoice cannot be edited | Issued invoices are frozen by a trigger | Issue a credit note (void lines, re-issue) rather than editing |
| Reports page slow or timing out | Large date range, cold database | Narrow the range; check Supabase > Reports > Query performance for the `revenue_by_stay_date` call |
| 503 from health with `database: timeout` | Supabase paused (free tier) or compute exhausted | Dashboard > Restore project / upgrade compute. Health recovers on its own |

## After the incident

Within two working days write a post-mortem in the ticket with these
headings, blameless, naming systems not people:

1. **Impact**: who could not do what, for how long, how many bookings/guests.
2. **Timeline**: detection, declaration, mitigation, resolution (UTC).
3. **Root cause**: the technical cause and the process cause that let it ship.
4. **What went well / what hurt**.
5. **Actions**: each with an owner and a date; at least one must make the
   class of failure impossible or detected automatically, not "be more careful".

Add an entry to the alerting doc if the incident was detected by a person
before a monitor noticed it.
