# Channel manager connector (Sales module, slice 3)

Distribution to OTAs for the online-first strategy. One `channel_connection`
per property and channel carries the provider, the inbound signing secret
(encrypted at rest, never returned by the API), the outbound push endpoint
and the pricing plan and markup for that channel. Migration
`00038_channel_manager.sql`.

## Inbound reservations

`POST /api/v1/channels/:code/reservations` (`:code` is the
`booking_channels.code`, e.g. `booking_com`).

- **Authentication**: `x-hospitai-signature: t=<unix seconds>,v1=<hex>` where
  `v1 = HMAC-SHA256(secret, "<t>.<raw body>")`. Requests older than five
  minutes are refused. No session, no CSRF.
- **Body**: one event, a list, or `{ "events": [...] }` in the generic format:

```json
{
  "event_id": "evt-20270601-0001",
  "type": "reservation.created | reservation.modified | reservation.cancelled",
  "reservation": {
    "external_ref": "BCOM-123456",
    "room_id": "STD", "rate_plan_id": "NRF",
    "check_in": "2027-07-01", "check_out": "2027-07-05",
    "adults": 2, "children": 0,
    "guest": { "first_name": "Hans", "last_name": "Müller", "email": "...", "phone": "...", "country": "DE", "language": "de" },
    "total": { "amount": 480, "currency": "EUR" }, "total_gbp": null,
    "special_requests": "high floor"
  }
}
```

- **Processing** (`processChannelEvent`): idempotent on `(connection,
  event_id)`; `external_ref` dedupes reservations across event ids. Created
  reservations go through `create_online_booking(... p_source='channel',
  p_confirmed=true, p_total_gbp=<OTA price>)`: a confirmed booking, no
  hold, priced at the OTA's total (converted with the latest stored rate when
  not in GBP, otherwise priced by our rate plan). Modifications use
  `modify_booking_stay()`, which keeps the unit when free and otherwise moves
  the stay to another unit of the same type. Cancellations are refused once
  the guest has checked in. Each event's outcome is returned; a mixed batch
  answers 207, an all-failed batch 422.
- **Room mapping**: `channel_room_mappings` map the OTA's room id and rate
  plan id to an apartment type (and optionally our rate plan). Unmapped rooms
  fail with `MAPPING_NOT_FOUND` and stay in `channel_messages` for staff.
- Every event is logged in `channel_messages` with payload, status and
  error; the front desk is notified; `booking.confirmed` / `booking.cancelled`
  are emitted on the event bus.

## Outbound ARI (availability, rates, restrictions)

`channel_ari(property, from, to, rate_plan)` returns, per apartment type per
day: units total and available, BAR, the plan rate, minimum stay and a
closed flag. `pushAri()` maps it to the connection's rooms, applies
`markup_percent`, signs it with the same HMAC scheme and POSTs it to
`push_url` with `Authorization: Bearer $<push_auth_ref>` when that
environment variable is set. Without a `push_url` the push is a logged dry
run.

- `GET /api/v1/channels/:code/push?from&to` previews the payload (manager+).
- `POST /api/v1/channels/:code/push` pushes now (cron secret or admin).
- The automations cron pushes every `active` connection each cycle
  (`results.channel_push`), 365 days ahead by default (`push_days`).
- A failed push marks the connection `error` with `last_error`; the next
  successful push or a manual status change clears it.

## Managing connections

- `GET/POST /api/v1/channels/connections`, `PATCH/DELETE
  /api/v1/channels/connections/:id`, `GET/PUT
  /api/v1/channels/connections/:id/mappings` (manager and above; reception
  may read). RLS scopes everything to the property; staff sessions cannot
  select `webhook_secret` at all (column privilege revoked).
- Provider adapters live in `src/lib/channel-manager.ts` (`PROVIDERS`). All
  named providers currently use the generic format; a real SiteMinder,
  Cloudbeds or Booking.com Connectivity adapter translates their wire format
  to the generic events and ARI payload and needs only that one file.

## Operations

- Reports: channel bookings are `bookings.source = 'channel'` with
  `external_ref` and the channel's commission from `booking_channels`.
- Rate parity: the same `channel_ari` feeds every connection, so an OTA can
  only differ from the website by its `markup_percent`.
- Replay safety: idempotency index on `channel_messages`; the exclusion
  constraint on `bookings` is the last line against double-selling.
