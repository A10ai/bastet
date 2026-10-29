# Pricing agent (Sales module, slice 4)

The agent protects the premium rate in the online-first strategy. Migration
`00039_pricing_agent.sql`, code in `src/lib/pricing-agent.ts`.

## What it does every day

For every apartment type and each week of the horizon (12 weeks by default)
it reads:

- the rate on sale and units free (`channel_ari`),
- nights picked up in the last seven days,
- the competitor median from `rate_shops` (last 14 days of shops for those
  stay dates, per type when the shop names one, otherwise property-wide),
- the demand forecast (`demand_forecasts`) when the prediction model has one,

and applies one explainable rule (`recommend()`):

| Signal | Effect |
| --- | --- |
| > 85 % of units sold (or forecast) | +8 % |
| 70–85 % | +4 % |
| < 40 % and arrival within 30 days | −6 % |
| pickup ≥ 10 % of units in 7 days | +3 % |
| competitor shops exist | target = 0.6 × (median × (1 + premium)) + 0.4 × demand-adjusted rate |
| always | clamp to ± `max_daily_change_percent`, then to [floor, ceiling], round to 1 GBP; < 1 % change = no recommendation |

Every recommendation carries its reasoning in plain words, e.g.
*"Studio 2027-07-01 to 2027-07-08: 50 -> 55 GBP (+10%). 90% of units
already sold; high demand +8%; strong pickup (120 nights in 7 days) +3%;
competitor median 80 GBP (6 shops), premium target +15% = 92 GBP; limited
to +/-10% per day."*

## Bands: the owner's control

`pricing_bands` per property (default) and optionally per apartment type:
`floor_gbp`, `ceiling_gbp`, `target_premium_percent` (default 15),
`max_daily_change_percent` (default 10), `auto_apply` (default false),
`horizon_weeks`. Without a band the agent uses 70 %–200 % of the type's
base nightly rate and never auto-applies. `PUT /api/v1/sales/pricing-bands`.

## Queue and application

- Recommendations land in `rate_recommendations` as `pending` (the previous
  pending queue is `expired` on each run; one batch per property per day).
- `POST /api/v1/sales/recommendations/:id {action: approve | reject,
  rate_gbp?}` (manager+). Approval, or `auto_apply`, calls
  `apply_rate_recommendation()`, which writes a `rates` row with
  `priority 10, source 'agent'` for the window, trims or retires earlier
  agent rows it overlaps, records `pricing_decisions`, and emits
  `pricing.rate_changed`. Seasonal rows are never edited: removing agent
  rows restores the season.
- `quote_stay`, `channel_ari` and the booking engine pick the highest
  priority row covering a night, so an approved rate is live on the website
  and in the next ARI push immediately.
- `POST /api/v1/sales/recommendations {action:"generate"}` runs the agent
  on demand; the automations cron runs it daily before the channel push.

## Competitor shops

`POST /api/v1/sales/rate-shops { shops: [{ stay_date, competitor,
competitor_type, board, rate_gbp, room_category?, apartment_type_id?, url? }] }`
(manager+). Hand-entered from Booking.com / Expedia today; a scraper or
rate-shopping feed posts the same shape with `source: "import"`.
Comparables for Bastet: Hurghada, El Gouna, Sahl Hasheesh and Makadi 4–5*
hotels and the few serviced apartments, half-board where possible.

## Guardrails

- Never below the floor, never above the ceiling, never more than the daily
  limit; `apply_rate_recommendation` re-checks the band in the database.
- The agent changes BAR only. Rate plans, minimum stays and closures stay
  with staff.
- Every run, approval and rejection is in `audit_log`; every applied rate is
  traceable to its recommendation (`applied_rate_id`) and decision.
- The legacy `runAutoPricing` automation (weekly base-rate nudges) remains
  behind `AUTO_PRICING_ENABLED` and should stay off when the agent is on.
