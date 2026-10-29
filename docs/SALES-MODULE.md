# Sales module

HospitAI's online-first revenue agent for Bastet: sell the first units direct
and through OTAs at a premium, protect the rate, and produce the proof that
tour operators will ask for when they come to contract. Built in six slices,
each with its own document:

| Slice | What | Doc |
| --- | --- | --- |
| 1 | Public booking engine API: availability, hold, Stripe deposit, webhook confirmation, cancellation | docs/ONLINE-BOOKING.md |
| 2 | `/book` pages in en/de/pl/ru/cs with the Payment Element | docs/ONLINE-BOOKING.md |
| 3 | Channel manager: signed inbound reservations, ARI push, room mappings | docs/CHANNEL-MANAGER.md |
| 4 | Pricing agent: rate shops, bands, explainable recommendations, approval queue, auto-apply | docs/PRICING-AGENT.md |
| 5 | Booking concierge on web and WhatsApp (Claude tools) | docs/CONCIERGE.md |
| 6 | Reviews, weekly proof report, operator pipeline, `/dashboard/sales` | this file |

## Slice 6

### Reviews
- Every check-out queues a review request (`requestReview`, event-bus
  handler on `booking.checked_out`): a private `/review/:token` link in a
  draft `guest_communications` row. Staff send it from Guest Messaging until
  an email provider is wired (docs/INTEGRATIONS.md). One request per booking.
- `/review/:token` (public, after check-out, once): overall plus
  cleanliness, service and value on the 1-5 scale, title, text, name and
  publication consent. `POST /api/v1/portal/:token/review`.
- OTA reviews are imported with `POST /api/v1/sales/reviews` (idempotent on
  source + external id; halve 1-10 scores before import).
- Replies: `POST /api/v1/sales/reviews/:id` drafts with Claude in the
  review's language (template fallback without a key); `PATCH` publishes.
  OTA replies are copied to the extranet by staff.
- Why it matters: a new property with no reviews ranks at the bottom of OTA
  search; review velocity in the first 90 days is the biggest lever.

### Weekly proof report
`sales_weekly_proof(property, from, to)` returns occupancy, ADR, RevPAR,
room revenue, channel mix with commission, direct and online share, nights
by source, top markets by guest country, pickup, cancellations, reviews and
concierge activity. `GET /api/v1/sales/report` serves it live (this week so
far, with the previous period for comparison); the automations cron stores
last week's snapshot in `sales_reports` once the week has closed
(`runWeeklyProofReports`, idempotent) and notifies the team. The narrative
(`proofNarrative`) is the paragraph for the owner and, later, the operator
deck.

### Operator pipeline
`sales_accounts` (stage identified -> researched -> contacted -> replied ->
meeting -> rates_sent -> negotiating -> contracted / declined / dormant,
priority, market, next action), `sales_contacts`, `sales_activities` (notes,
emails, calls, meetings, proposals; stage changes are logged automatically).
`GET/POST /api/v1/sales/accounts`, `/:id` (GET/PATCH/DELETE),
`/:id/activities`, `/:id/contacts`. Inbound only in phase one; outbound
campaigns start when the online numbers exist (see the strategy memory).
`lawful_basis` records the PECR/GDPR basis for contacting each account.

### Dashboard
`/dashboard/sales` (sidebar: Sales) with six tabs: Proof report, Pricing
agent (queue, approve/edit/reject, bands), Channels (connections, push ARI,
pause/activate), Concierge (conversations and scrubbed transcripts), Reviews
(draft and publish replies), Operators (pipeline, contacts, activity log).

## Deployment checklist for the module
1. Migrations 00037-00041 (after 00033-00036 from the deep-test PR #2).
2. Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
   `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (card deposits); `ANTHROPIC_API_KEY`
   (concierge, review drafts); WhatsApp variables when the number exists.
3. Stripe webhook endpoint `/api/v1/webhooks/stripe` with
   `payment_intent.succeeded`, `payment_intent.payment_failed`,
   `charge.refunded`.
4. Set `sales_settings` (deposit, hold, limits), `pricing_bands`, and the
   property status to `pre_opening` or `active` (the public routes serve
   only those).
5. Channel connections: create, set the webhook secret and room mappings,
   activate; the automations cron pushes ARI daily (the GitHub Actions
   workflow runs it every 15 minutes).
6. Run `scripts/deep-test.mjs` and the Playwright smoke against the deploy.
