# 0006 Event bus with idempotency keys and optimistic locking on workflows

Date: 2026-10-18. Status: accepted.

## Context

Events (check-in, occupancy threshold crossed) fan out to handlers that
create notifications, tasks and workflows. Retries and double submissions
created duplicate side effects, and two workers advancing the same
workflow overwrote each other.

## Decision

`system_events.idempotency_key` is unique; `emitEvent` derives a default
key from type, source and payload and treats a duplicate as already
handled. `workflows.version` is bumped by trigger and `executeNextStep`
updates `WHERE version = expected`, failing fast on a stale read.

## Consequences

- Handlers may assume at-most-once delivery per key.
- Callers that genuinely want a repeat (manual re-run) pass an explicit
  key.
