# External integrations: where they plug in

Three items on the functional roadmap need an external account and
credentials that this repository does not hold: card payments (Stripe),
transactional email or SMS, and a channel manager for OTAs. The system is
built so each one attaches at a single, named seam. Nothing below is wired
to a live provider; the demo screens that touch these areas carry the
"Demo data" banner until they are.

## Card payments (Stripe)

> **Status (Sales module, slice 1):** the deposit flow for online bookings is
> built: `POST /api/v1/book/:token/payment-intent` and
> `POST /api/v1/webhooks/stripe` (see docs/ONLINE-BOOKING.md). Front-desk
> card capture and portal balance payments still follow the plan below.

| | |
| --- | --- |
| Seam | `record_folio_payment()` and `refund_payment()` (migration 00026). A card payment is a folio payment with `method = 'stripe'` and `payments.stripe_payment_id` set; a refund is a folio refund referencing it. The accounting export maps both to **Card clearing 1010**. |
| Trigger points | Guest portal (`/stay/:token`): "Pay balance" button for the open folio balance or a deposit. Front desk: "Take card payment" in the folio panel. Group page: organiser payment with `method = 'card'`. |
| Routes to add | `POST /api/v1/payments/stripe/intent` (front desk, or portal with the token) creates a PaymentIntent for `amount_gbp` on a folio and stores `stripe_payment_id` on a pending `payments` row; `POST /api/v1/payments/stripe/webhook` (no auth, Stripe signature) on `payment_intent.succeeded` calls `record_folio_payment` with the intent id as reference and is idempotent on `stripe_payment_id`; `charge.refunded` calls `refund_payment`. |
| Env | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (already in `src/lib/env.ts`), `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` for Elements on the portal. |
| Tests | Deep test can run against Stripe test mode with the `4242` card through the Payment Element; the webhook handler is unit-tested with recorded events. |
| Not before | PCI scope stays at SAQ A only if card data never touches our server: use Payment Element / Checkout, never raw card numbers. |

## Email and SMS

| | |
| --- | --- |
| Seam | `src/lib/notifications.ts` (in-app) is the only notifier today. Add `src/lib/messaging-provider.ts` with `sendEmail({ to, template, data })` and `sendSms(...)` behind a provider interface; `guest_communications` already records what was sent and its status. |
| Triggers already emitted | `booking.created`, `booking.checked_in`, `booking.checked_out`, `booking.precheckin_completed` (event bus); portal link creation (`booking.portal_link` audit). The handlers in `src/lib/event-bus.ts` are where a template is queued. |
| Templates | Confirmation with the portal link, pre-arrival reminder (3 days before, from the automations cron), invoice issued (PDF link), post-stay thank you. Templates live in `messaging?type=templates` today as sample data. |
| Env | `RESEND_API_KEY` (already declared) or any SMTP; for SMS a Twilio or Vonage key. Sending domain must be the property's, with SPF and DKIM, not hospitai.uk. |
| Consent | Marketing email only when `guest_consent` has an active marketing purpose (the portal's optional checkbox feeds it); transactional messages need no consent. |
| Delivery | Provider webhooks update `guest_communications.status` (delivered, bounced). Bounces mark the guest email as invalid for staff to fix. |

## Channel manager (OTAs)

| | |
| --- | --- |
| Seam | Inbound reservations become ordinary bookings through `POST /api/v1/bookings` semantics: priced by `quote_stay` with the channel's rate plan (plans carry `channel_codes`), `channel_id` set to the OTA, `rate_plan_snapshot` stored. Outbound availability is `GET /api/v1/availability` (the exclusion constraint is the source of truth) and rates are `rates` plus `rate_plans`. |
| Routes to add | `POST /api/v1/channels/:code/reservations` (provider webhook, HMAC-verified): create, modify, cancel; idempotent on the OTA reservation id stored in `bookings.external_ref`. `POST /api/v1/channels/:code/push` from the automations cron: send availability and rate changes since the last push (`system_events` has them). |
| Provider | A connector such as SiteMinder, Cloudbeds Channels or a direct Booking.com Connectivity partner account. Each needs the property's hotel id and API credentials; sandbox accounts exist for all three. |
| Data | `booking_channels.commission_rate` is a percentage; the channel mix report already nets commission. Mapping tables for OTA room type ids and rate plan ids per channel are the first migration of this work. |
| Guardrails | Never let an inbound reservation overwrite a checked-in stay; conflicts return 409 to the provider and raise a front-desk notification. Rate pushes respect `AUTO_PRICING_ENABLED`. |

## Order of work when credentials arrive

1. Stripe on the guest portal (smallest surface, biggest guest impact).
2. Transactional email with the portal link in the confirmation.
3. Channel manager inbound, then outbound rate and availability push.
