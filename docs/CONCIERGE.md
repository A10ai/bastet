# Booking concierge (Sales module, slice 5)

A guest-facing assistant on the public booking pages (floating chat) and on
WhatsApp. It answers in the guest's language (en, de, pl, ru, cs or whatever
they write in), quotes real availability and prices through the booking
engine, and creates the same pending hold the `/book` pages create, handing
back the payment link. Migration `00040_concierge.sql`, code in
`src/lib/concierge.ts`.

## How a conversation works

1. `POST /api/v1/concierge/chat { message, session_token?, locale?, property? }`.
   The first message creates a `concierge_sessions` row and returns a
   43-character session token (stored hashed; the widget keeps it in
   localStorage). Later messages carry the token.
2. The turn goes to Claude through the official SDK's tool runner with the
   property prompt (cached) and three tools:
   - `check_availability(check_in, check_out, adults, children)` — the only
     source of prices, deposits and cancellation terms (calls
     `searchAvailability`, i.e. `online_availability` + `quote_stay` on the
     `web` channel).
   - `create_hold(...)` — requires `terms_accepted: true`; upserts the guest,
     calls `create_online_booking(source='concierge')`, issues the booking
     token and returns the pay link. The front desk is notified.
   - `handoff_to_staff(reason, guest_contact?)` — front-desk notification,
     session marked `handoff`.
3. The reply (and the tool calls, with contact details scrubbed) is stored
   in `concierge_messages`; the response carries the text plus `outcome`
   (`pay_url`, `reference`, `handoff`) so the widget can show a pay button.

`GET /api/v1/concierge/chat?session_token=` returns the transcript for a
reload. Staff read conversations at `GET /api/v1/sales/concierge/sessions`
(list, or `?session=<id>` for one transcript).

## Model and cost controls

- Model: `CONCIERGE_MODEL`, then `ANTHROPIC_MODEL`, default `claude-opus-5-5`;
  `output_config.effort: "low"` (chat), `max_tokens 4096`, at most 6 tool
  iterations per turn. The server-side refusal fallback is on
  (`fallbacks: "default"`), so a safety decline is answered by the fallback
  model instead of silence; an empty or refused answer gets a polite
  fallback in the guest's language.
- Spend guards: 40 messages / 15 min per address, 60 messages per session,
  and `sales_settings.concierge_daily_message_cap` (default 2000 assistant
  messages per property per day). `sales_settings.concierge_enabled` switches
  it off without a deploy; the widget hides itself when
  `/api/v1/book/property` reports `policy.concierge: false` (also the case
  when `ANTHROPIC_API_KEY` is unset).

## Guardrails

- The prompt forbids inventing prices, availability, discounts or upgrades;
  the tools make it structurally impossible to quote a number the engine
  did not return.
- Card numbers, passwords and passport numbers are never requested; payment
  happens only on the `/book/:token` page (Stripe Payment Element).
- Guest contact details reach Anthropic only as tool inputs when the guest
  asks to book (needed to create the guest record); transcripts and tool-call
  logs are scrubbed (`scrubText`, `scrubPii`) before storage, and WhatsApp
  numbers are stored encrypted with a hash for lookup. Staff cannot read the
  encrypted number (column privilege revoked).
- Complaints, large groups, corporate and tour-operator requests go to
  `handoff_to_staff`.

## WhatsApp (Meta Cloud API)

`/api/v1/webhooks/whatsapp`: `GET` answers Meta's verification with
`WHATSAPP_VERIFY_TOKEN`; `POST` verifies `X-Hub-Signature-256` with
`WHATSAPP_APP_SECRET`, runs one concierge turn per text message for the
sender's session (one per number per property) and replies through the
Graph API with `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID`. Without
the send credentials replies are stored and logged only. Twilio or another
provider would add a second webhook that normalises to the same
`sessionForWhatsApp` + `runConciergeTurn` + send function.

## Environment

```
ANTHROPIC_API_KEY=            # required for the concierge
CONCIERGE_MODEL=              # optional, default claude-opus-5-5
WHATSAPP_VERIFY_TOKEN=        # optional, Meta webhook verification
WHATSAPP_APP_SECRET=          # optional, Meta signature verification
WHATSAPP_ACCESS_TOKEN=        # optional, Graph API send
WHATSAPP_PHONE_NUMBER_ID=     # optional, Graph API send
```
