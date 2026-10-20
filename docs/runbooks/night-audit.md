# Night audit

The night audit closes a business date for a property: it posts room charges,
VAT and tourism levy to every in-house folio, marks no-shows, advances
`properties.last_business_date`, and records a row in `daily_closes`. It is
idempotent per `(property_id, business_date)`: running it twice for the same
date is a no-op.

It runs from Vercel Cron at 03:00 UTC via `POST /api/v1/cron/night-audit`
(bearer `CRON_SECRET`), which calls the database function
`run_night_audit(p_property_id, p_business_date)` for every active property.
Admins can trigger the same route from a signed-in session.

## It did not run

Health shows `night_audit: degraded, last close N days ago`.

1. Check the cron run in Vercel > Settings > Cron Jobs > night-audit > logs.
   A 401 means `CRON_SECRET` mismatch; a 500 means the function raised; no
   run at all means the cron is disabled or the deployment failed.
2. Run it by hand (admin session or cron secret):

   ```bash
   curl -X POST https://app.hospitai.uk/api/v1/cron/night-audit \
     -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" \
     -d '{"business_date":"2026-10-17"}'      # omit body to close the next open date
   ```

   The response lists, per property, the business date closed, charges
   posted, no-shows marked. Run it once per missed date, oldest first, until
   the response says the date is already closed.
3. Confirm: `GET /api/v1/health` → `night_audit: ok`, and in the dashboard
   Finance > Revenue the missed night now shows room revenue.

## It posted wrong charges

Typical causes: a rate was changed after the fact; a booking's dates were
edited after its nights were posted; VAT percentage on the property was wrong.

- Never edit or delete `folio_lines`. The table rejects both.
- Void the wrong lines: in the booking's folio panel (manager, reason), or in
  SQL for many bookings:

  ```sql
  BEGIN;
  SELECT void_folio_line(fl.id, '<manager staff uuid>', 'night audit 2026-10-17 posted at wrong rate')
  FROM folio_lines fl
  JOIN folios f ON f.id = fl.folio_id
  WHERE fl.stay_date = '2026-10-17' AND fl.line_type = 'room' AND fl.voided_at IS NULL
    AND f.booking_id IN ('<ids>');
  COMMIT;
  ```

- Re-post with the right amounts with `post_booking_room_charges(booking_id,
  from_date, to_date)` or through the folio panel's "post charge".
- Revenue by stay date (`revenue_by_stay_date`) nets voids automatically, so
  reports correct themselves once the voids are in.

## It ran twice

It cannot post twice for the same date: `daily_closes` has a unique
constraint on `(property_id, business_date)` and the function exits early
when the row exists. If you see duplicate room lines for one night, they
came from a manual `post_booking_room_charges` call overlapping the audit;
void the duplicates as above.

## Changing the time it runs

Edit the schedule in `vercel.json` (cron is UTC; Hurghada is UTC+2 all year,
Manchester UTC+0/+1). Keep it after the latest realistic late check-in and
before housekeeping starts reading the arrivals list (06:00 local).
