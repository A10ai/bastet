# 0004 Night audit closes a business date; revenue recognised by stay date

Date: 2026-10-18. Status: accepted.

## Context

Hotels account by business date, not calendar timestamp: a payment taken
at 01:00 belongs to the previous day, and a five-night stay earns revenue
on each night, not on the booking date. The system had no notion of either.

## Decision

`properties.last_business_date` plus `daily_closes` record which dates are
closed. `run_night_audit(property, date)` posts room charges, VAT and levy
to every in-house folio for that night, marks no-shows and advances the
business date, idempotently (unique on property and date). It runs from
cron at 03:00 UTC and can be run by hand. Revenue reports read
`revenue_by_stay_date`.

## Consequences

- Finance figures match what an auditor expects; month boundaries use the
  property's local calendar.
- A missed audit is visible in the health endpoint and has a runbook.
- Check-out posts any nights not yet audited (`post_booking_room_charges`)
  so an early departure is still charged.
