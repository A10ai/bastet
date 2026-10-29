# Online booking engine (Sales module, slice 1)

Bastet's phase-1 sales strategy sells the first units online, direct and
through OTAs, at a premium rate. This document covers the direct channel:
the public API a booking page or the AI concierge uses to search, hold, pay
and manage a stay. Migration `00037_online_booking.sql`.

## How a web booking works

1. **Search** `GET /api/v1/book/availability` — every apartment type with
   how many units are free, the price through the `web` channel (rate plans
   can restrict channels) and the deposit due, or the reason it cannot be
   sold (sold out, party too large, not on sale, minimum nights).
2. **Book** `POST /api/v1/book` — the guest record is found or created by
   email; `create_online_booking()` picks the first free apartment of the
   type (`FOR UPDATE SKIP LOCKED`, exclusion constraint as backstop) and
   inserts a **pending** booking with `hold_expires_at = now + hold_minutes`.
   A booking token (same scheme as the guest portal, SHA-256 stored) is
   returned once. If `expected_total_gbp` no longer matches, the booking is
   released and `409 PRICE_CHANGED` carries the new total.
3. **Pay** `POST /api/v1/book/:token/payment-intent` — a Stripe
   PaymentIntent for the deposit still due, in the guest's currency at the
   latest stored FX rate. Idempotent per booking and amount.
4. **Confirm** `POST /api/v1/webhooks/stripe` — on `payment_intent.succeeded`
   `confirm_online_booking()` opens the folio, records the payment
   (`record_folio_payment`, actor `guest`) and sets the booking to
   `confirmed`. Idempotent on the PaymentIntent id, so Stripe retries are
   safe. Emits `booking.confirmed`, notifies the front desk, writes audit.
5. **Expire** — `expire_online_holds()` cancels unpaid pending holds past
   their deadline with the reason `Hold expired: payment not received`,
   which frees the apartment. It runs at the start of every availability
   search and every `create_online_booking()`, and from the automations
   cron as a sweep, so a daily cron schedule never leaves inventory locked.
6. **Manage** `GET /api/v1/book/:token` (status, amounts, hold deadline,
   cancellation terms) and `POST /api/v1/book/:token/cancel` (free while the
   stored rate-plan snapshot allows it, or while nothing has been paid;
   otherwise the guest is told the terms and asked to contact the property).
   The same token opens `/stay/:token`.

Without `STRIPE_SECRET_KEY` the flow degrades to **request to book**:
`POST /api/v1/book/:token/request` extends the hold to
`request_hold_hours` and the front desk confirms by hand after taking
payment another way.

## Policy per property: `sales_settings`

| Column | Default | Meaning |
| --- | --- | --- |
| `online_enabled` | true | Turn the public flow off without a deploy |
| `deposit_percent` | 20 | Deposit at booking; never less than one night; non-refundable plans pay in full |
| `hold_minutes` | 30 | How long inventory is held while the guest pays |
| `request_hold_hours` | 48 | Hold for "request to book" when card payments are off |
| `min_lead_days` / `max_advance_days` | 0 / 540 | Booking window |
| `max_nights` / `max_guests_per_booking` | 90 / 8 | Size limits for self-service bookings |
| `currencies` | GBP, EUR, USD, EGP | Currencies offered at payment (needs rows in `currency_rates`) |
| `terms_url` | null | Linked from the booking form |

Managers and above edit the row; everyone with property access can read it.

## Security

- Public routes use the service role (anon has no table or function
  access since 00033) and are rate limited per address: 120 searches / 15
  min, 10 bookings / hour, 30 payment intents / 15 min.
- The booking token is the guest's only credential; unknown, revoked and
  expired tokens all answer 404. Responses carry `Cache-Control: no-store`
  and `X-Robots-Tag: noindex` and never include identity documents,
  internal notes, apartment ids or other guests.
- Stripe: card data never reaches the server (Payment Element); webhooks
  are verified with `STRIPE_WEBHOOK_SECRET`; amounts posted to the folio
  come from the verified intent, not from the browser.
- Every booking, confirmation, request and cancellation is in `audit_log`.
- CSP: Stripe's script, frames and API are allowed only when
  `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is set.

## Data

`bookings` gains `source` (`staff` | `web` | `concierge` | `channel` |
`import`), `hold_expires_at`, `external_ref` (OTA reservation id, used by
the channel-manager slice) and `locale`. The `web` channel (0 %
commission) is added to `booking_channels`.

## Operations

- Reports: online bookings are `bookings.source IN ('web','concierge')`;
  channel mix already nets commission per channel.
- A paid booking cancelled online within the free window raises a
  front-desk notification "Refund due"; the refund itself is made from the
  folio (`refund_payment`) and, for cards, in the Stripe dashboard.
- A payment that arrives for a booking that was cancelled meanwhile (hold
  expired during 3-D Secure, for example) is reported to the front desk to
  refund or re-open; the webhook answers 200 so Stripe does not retry.

## Next slices

2. Public `/book` pages with the Payment Element.
3. Channel-manager connector (OTA reservations in, rates and availability
   out) using `bookings.external_ref` and `source = 'channel'`.
4. Pricing agent writing `rates` inside bands on `sales_settings`.
