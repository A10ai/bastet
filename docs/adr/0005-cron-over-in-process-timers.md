# 0005 Scheduled work runs from platform cron, never in-process timers

Date: 2026-10-18. Status: accepted.

## Context

The AI scheduler used `setInterval` inside a Next.js route module. On
serverless hosting that timer lives only as long as a warm instance and
runs once per instance, so work was skipped or duplicated.

## Decision

Three cron routes under `/api/v1/cron/*` (night audit, automations every
15 minutes, FX rates daily) are triggered by Vercel Cron with a bearer
`CRON_SECRET`, or by an admin session. Edge Boxes use the host crontab.
`runScheduledCycle` records a `scheduler.cycle_completed` event that the
health endpoint uses to detect a stale scheduler.

## Consequences

- Exactly-one execution per schedule, observable from outside.
- The "run now" button remains for operators; it calls the same code.
- A new scheduled job is a new cron route plus a `vercel.json` entry.
