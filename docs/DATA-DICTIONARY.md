# Data dictionary

Generated 2026-10-18 from the local Supabase stack by `scripts/generate-data-dictionary.py`; do not edit by hand. Schema source of truth: `supabase/migrations/`.

61 tables, 36 functions. Every table has row-level security enabled unless marked otherwise; policies are summarised per table.

## Tables

| Table | Purpose | Columns | RLS |
| --- | --- | ---: | --- |
| [ai_learning_feedback](#ai_learning_feedback) | Outcomes recorded against AI decisions for learning. | 10 | on |
| [analytics_events](#analytics_events) | Product analytics events (no personal data). | 10 | on |
| [apartment_images](#apartment_images) | Photos attached to a unit. | 8 | on |
| [apartment_types](#apartment_types) | Sellable unit types (studio, 1-bed, ...) with base weekly rates and capacity. | 13 | on |
| [apartments](#apartments) | Individual sellable units with status (available, occupied, cleaning, maintenance, blocked, out_of_service). | 14 | on |
| [audit_log](#audit_log) | Who did what, when, from where. Written by API routes through logAudit. | 12 | on |
| [availability](#availability) | Legacy per-day availability rows; overlap protection now lives on bookings. | 7 | on |
| [beach_partnerships](#beach_partnerships) | Beach club arrangements. | 16 | on |
| [booking_access_tokens](#booking_access_tokens) |  | 11 | on |
| [booking_addons](#booking_addons) | Extras attached to a booking. | 8 | on |
| [booking_channels](#booking_channels) | Distribution channels (direct, OTA ...) with commission as a percentage. | 8 | on |
| [booking_groups](#booking_groups) |  | 21 | on |
| [bookings](#bookings) | A stay: unit, guest, dates, status, totals. Overlapping confirmed stays on one unit are rejected by an exclusion constraint. `nights` is a generated column. | 31 | on |
| [brain_config](#brain_config) | Configuration of the AI brain (mode, thresholds). | 9 | on |
| [brain_decisions](#brain_decisions) | Decisions proposed or executed by the AI brain per cycle. | 16 | on |
| [buildings](#buildings) | Physical buildings or wings of a property. | 11 | on |
| [currency_rates](#currency_rates) | Exchange rates refreshed daily by the FX cron. | 6 | on |
| [daily_closes](#daily_closes) | One row per property per business date closed by the night audit (charges posted, no-shows marked). | 17 | on |
| [demand_forecasts](#demand_forecasts) | Forecast rows produced by the predictions engine. | 13 | on |
| [department_budgets](#department_budgets) | Monthly budget per department; the source of budget-vs-actual, never estimated. | 7 | on |
| [excursion_bookings](#excursion_bookings) | Excursions booked by guests. | 12 | on |
| [excursions](#excursions) | Excursion catalogue. | 26 | on |
| [expenses](#expenses) | Operating expenses by category and department, with R&D flag. | 17 | on |
| [facilities](#facilities) | On-site facilities (pool, gym, meeting rooms). | 12 | on |
| [facility_bookings](#facility_bookings) | Reservations of facilities. | 10 | on |
| [financial_reports](#financial_reports) | Stored report snapshots. | 14 | on |
| [flash_deals](#flash_deals) | Time-boxed deals. | 16 | on |
| [folio_lines](#folio_lines) | Append-only ledger lines (room, tax, levy, extra, payment, refund, reversal). Updates and deletes are rejected by trigger; corrections are reversing lines. | 16 | on |
| [folios](#folios) | Guest account for a stay; opened at check-in or by a deposit, closed at check-out. | 11 | on |
| [gdpr_requests](#gdpr_requests) | Subject access and erasure requests with their state. | 11 | on |
| [guest_activity_log](#guest_activity_log) | Timeline of guest-facing events. | 8 | on |
| [guest_communications](#guest_communications) | Outbound messages to guests and their delivery status. | 12 | on |
| [guest_consent](#guest_consent) | GDPR consent records per guest and purpose. | 11 | on |
| [guest_predictions](#guest_predictions) | Model outputs per guest (churn, lifetime value). | 11 | on |
| [guest_preferences](#guest_preferences) | Preference DNA per guest (room, pillow, temperature, dietary ...). | 45 | on |
| [guest_segments](#guest_segments) | Named guest segments for marketing and pricing. | 6 | on |
| [guests](#guests) | Guest master record. Passport numbers are encrypted at rest (enc:v1: prefix). Loyalty tier and VIP flag live here. | 28 | on |
| [housekeeping_tasks](#housekeeping_tasks) | Cleaning and inspection tasks per unit with type, status, priority and assignee. | 18 | on |
| [inventory](#inventory) | Stock items and levels. | 14 | on |
| [invoices](#invoices) | Invoice issued from a folio. Frozen by trigger once status is issued. | 20 | on |
| [loyalty_programme](#loyalty_programme) | Loyalty tiers and rules. | 9 | on |
| [maintenance_requests](#maintenance_requests) | Maintenance tickets per unit with category, priority and status. | 19 | on |
| [notifications](#notifications) | In-app notifications per staff member; broadcasts create one row per active staff member. | 9 | on |
| [partner_certifications](#partner_certifications) | Compliance documents of partners. | 11 | on |
| [partners](#partners) | Local partners (excursions, transfers, beach). | 21 | on |
| [payments](#payments) | Money received against a folio or invoice. | 15 | on |
| [pricing_decisions](#pricing_decisions) | Rate changes proposed or applied by the pricing automation (gated by AUTO_PRICING_ENABLED). | 12 | on |
| [promotions](#promotions) | Promotional offers. | 15 | on |
| [properties](#properties) | A hotel or aparthotel operated on the platform. Carries VAT rate, currencies and the current business date. | 23 | on |
| [rate_plans](#rate_plans) |  | 19 | on |
| [rates](#rates) | Seasonal rate rows per apartment type (start/end date, weekly rate, minimum nights). | 12 | on |
| [refunds](#refunds) | Money returned, always linked to the original payment and a reason. | 9 | on |
| [reviews](#reviews) | Guest reviews and responses. | 16 | on |
| [shuttle_bookings](#shuttle_bookings) | Seats booked on shuttles. | 9 | on |
| [shuttle_routes](#shuttle_routes) | Shuttle routes. | 17 | on |
| [shuttle_schedules](#shuttle_schedules) | Shuttle departures. | 6 | on |
| [staff](#staff) | Staff members linked to auth users; `role` drives authorisation (owner, admin, manager, receptionist, housekeeping, maintenance, readonly). | 15 | on |
| [staff_properties](#staff_properties) | Membership of staff in properties; required for cross-property access. | 4 | on |
| [staff_schedules](#staff_schedules) | Shifts per staff member. | 9 | on |
| [system_events](#system_events) | Event bus log with idempotency keys; consumed by workflows and automations. | 8 | on |
| [workflows](#workflows) | Multi-step operational workflows with optimistic locking on `version`. | 20 | on |

### ai_learning_feedback

Outcomes recorded against AI decisions for learning.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| prediction_id | uuid | yes |  |  |
| recommendation_type | character varying(30) |  |  |  |
| recommendation_detail | jsonb |  |  |  |
| was_shown | boolean |  | false |  |
| was_clicked | boolean |  | false |  |
| was_converted | boolean |  | false |  |
| guest_rating | smallint | yes |  |  |
| feedback_text | text | yes |  |  |
| created_at | timestamp with time zone |  | now() |  |

Constraints:

- check `ai_learning_feedback_guest_rating_check`: `CHECK (((guest_rating >= 1) AND (guest_rating <= 5)))`

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| ai_feedback_management | ALL | `role_at_least(70)` | `role_at_least(70)` |

### analytics_events

Product analytics events (no personal data).

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| property_id | uuid |  |  | properties.id |
| guest_id | uuid | yes |  | guests.id |
| event_name | character varying(50) |  |  |  |
| event_category | character varying(30) |  |  |  |
| event_data | jsonb | yes | '{}'::jsonb |  |
| session_id | character varying(50) | yes |  |  |
| device_type | character varying(20) | yes |  |  |
| platform | character varying(20) | yes |  |  |
| created_at | timestamp with time zone |  | now() |  |

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| staff_read_analytics | SELECT | `(property_id = get_staff_property_id())` | `` |

### apartment_images

Photos attached to a unit.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| apartment_id | uuid | yes |  | apartments.id |
| apartment_type_id | uuid | yes |  | apartment_types.id |
| url | text |  |  |  |
| alt_text | character varying(200) | yes |  |  |
| sort_order | integer |  | 0 |  |
| is_primary | boolean |  | false |  |
| created_at | timestamp with time zone |  | now() |  |

Constraints:

- check `apartment_images_check`: `CHECK (((apartment_id IS NOT NULL) OR (apartment_type_id IS NOT NULL)))`

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| apartment_images_scoped | ALL | `((apartment_id IS NULL) OR (apartment_id IN ( SELECT apartments.id    FROM apartments   WH` | `role_at_least(70)` |

### apartment_types

Sellable unit types (studio, 1-bed, ...) with base weekly rates and capacity.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| property_id | uuid |  |  | properties.id |
| name | character varying(50) |  |  |  |
| slug | character varying(50) |  |  |  |
| description | text | yes |  |  |
| bedrooms | integer |  | 0 |  |
| bathrooms | integer |  | 1 |  |
| max_occupancy | integer |  | 2 |  |
| size_sqm | numeric(6,1) | yes |  |  |
| base_weekly_rate_gbp | numeric(10,2) |  |  |  |
| amenities | jsonb | yes | '[]'::jsonb |  |
| created_at | timestamp with time zone |  | now() |  |
| updated_at | timestamp with time zone |  | now() |  |

Constraints:

- unique `apartment_types_property_id_slug_key`: `UNIQUE (property_id, slug)`

Triggers:

- `apartment_types_updated_at`: EXECUTE FUNCTION update_updated_at_column()

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| staff_manage_apartment_types | ALL | `(property_id = get_staff_property_id())` | `(property_id = get_staff_property_id())` |

### apartments

Individual sellable units with status (available, occupied, cleaning, maintenance, blocked, out_of_service).

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| property_id | uuid |  |  | properties.id |
| building_id | uuid |  |  | buildings.id |
| apartment_type_id | uuid |  |  | apartment_types.id |
| number | character varying(10) |  |  |  |
| floor | integer |  |  |  |
| view_type | character varying(30) | yes | 'garden'::character varying |  |
| status | character varying(20) |  | 'available'::character varying |  |
| is_accessible | boolean |  | false |  |
| smart_lock_id | character varying(50) | yes |  |  |
| ac_unit_id | character varying(50) | yes |  |  |
| notes | text | yes |  |  |
| created_at | timestamp with time zone |  | now() |  |
| updated_at | timestamp with time zone |  | now() |  |

Constraints:

- unique `apartments_property_id_number_key`: `UNIQUE (property_id, number)`
- check `apartments_status_check`: `CHECK (((status)::text = ANY ((ARRAY['available'::character varying, 'occupied'::character varying, 'maintenance'::character varying, 'cleaning'::character varying, 'blocked'::character varying, 'out_of_service'::character varying])::text[])))`
- check `apartments_view_type_check`: `CHECK (((view_type)::text = ANY ((ARRAY['sea'::character varying, 'pool'::character varying, 'garden'::character varying, 'city'::character varying, 'partial_sea'::character varying])::text[])))`

Triggers:

- `apartments_updated_at`: EXECUTE FUNCTION update_updated_at_column()

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| staff_manage_apartments | ALL | `(property_id = get_staff_property_id())` | `(property_id = get_staff_property_id())` |

### audit_log

Who did what, when, from where. Written by API routes through logAudit.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| user_id | text |  |  |  |
| user_email | text |  |  |  |
| action | character varying(100) |  |  |  |
| category | character varying(30) |  |  |  |
| resource_type | character varying(50) | yes |  |  |
| resource_id | text | yes |  |  |
| description | text |  |  |  |
| old_data | jsonb | yes |  |  |
| new_data | jsonb | yes |  |  |
| metadata | jsonb |  | '{}'::jsonb |  |
| created_at | timestamp with time zone |  | now() |  |

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| audit_log_admin_select | SELECT | `role_at_least(90)` | `` |
| audit_log_insert | INSERT | `` | `role_at_least(10)` |

### availability

Legacy per-day availability rows; overlap protection now lives on bookings.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| apartment_id | uuid |  |  | apartments.id |
| date | date |  |  |  |
| is_available | boolean |  | true |  |
| price_override_gbp | numeric(10,2) | yes |  |  |
| block_reason | character varying(50) | yes |  |  |
| created_at | timestamp with time zone |  | now() |  |

Constraints:

- unique `availability_apartment_id_date_key`: `UNIQUE (apartment_id, date)`

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| availability_scoped | ALL | `(apartment_id IN ( SELECT apartments.id    FROM apartments   WHERE can_access_property(apa` | `(role_at_least(70) AND (apartment_id IN ( SELECT apartments.id    FROM apartments   WHERE ` |

### beach_partnerships

Beach club arrangements.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| property_id | uuid |  |  | properties.id |
| partner_id | uuid |  |  | partners.id |
| beach_name | character varying(100) |  |  |  |
| location | text | yes |  |  |
| latitude | numeric(10,7) | yes |  |  |
| longitude | numeric(10,7) | yes |  |  |
| day_pass_price_gbp | numeric(10,2) |  |  |  |
| includes | _text[] | yes |  |  |
| shuttle_available | boolean |  | false |  |
| shuttle_duration_mins | integer | yes |  |  |
| max_daily_capacity | integer | yes |  |  |
| image_url | text | yes |  |  |
| is_active | boolean |  | true |  |
| created_at | timestamp with time zone |  | now() |  |
| updated_at | timestamp with time zone |  | now() |  |

Triggers:

- `beach_partnerships_updated_at`: EXECUTE FUNCTION update_updated_at_column()

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| staff_manage_beaches | ALL | `(property_id = get_staff_property_id())` | `(property_id = get_staff_property_id())` |

### booking_access_tokens

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| booking_id | uuid |  |  | bookings.id |
| property_id | uuid |  |  | properties.id |
| token_hash | character(64) |  |  |  |
| purpose | character varying(20) |  | 'portal'::character varying |  |
| expires_at | timestamp with time zone |  |  |  |
| revoked_at | timestamp with time zone | yes |  |  |
| created_by | uuid | yes |  | staff.id |
| created_at | timestamp with time zone |  | now() |  |
| last_used_at | timestamp with time zone | yes |  |  |
| use_count | integer |  | 0 |  |

Constraints:

- check `booking_access_tokens_purpose_check`: `CHECK (((purpose)::text = 'portal'::text))`
- unique `booking_access_tokens_token_hash_key`: `UNIQUE (token_hash)`

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| booking_access_tokens_select | SELECT | `(role_at_least(50) AND can_access_property(property_id))` | `` |
| booking_access_tokens_write | ALL | `(role_at_least(50) AND can_access_property(property_id))` | `(role_at_least(50) AND can_access_property(property_id))` |

### booking_addons

Extras attached to a booking.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| booking_id | uuid |  |  | bookings.id |
| name | character varying(100) |  |  |  |
| description | text | yes |  |  |
| quantity | integer |  | 1 |  |
| unit_price_gbp | numeric(10,2) |  |  |  |
| total_price_gbp | numeric(10,2) |  |  |  |
| created_at | timestamp with time zone |  | now() |  |

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| booking_addons_scoped | ALL | `(booking_id IN ( SELECT bookings.id    FROM bookings   WHERE can_access_property(bookings.` | `(role_at_least(50) AND (booking_id IN ( SELECT bookings.id    FROM bookings   WHERE can_ac` |

### booking_channels

Distribution channels (direct, OTA ...) with commission as a percentage.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| name | character varying(50) |  |  |  |
| code | character varying(20) |  |  |  |
| commission_rate | numeric(5,2) |  | 0.00 |  |
| is_active | boolean |  | true |  |
| api_connection | jsonb | yes |  |  |
| created_at | timestamp with time zone |  | now() |  |
| updated_at | timestamp with time zone |  | now() |  |

Constraints:

- unique `booking_channels_code_key`: `UNIQUE (code)`
- unique `booking_channels_name_key`: `UNIQUE (name)`

Triggers:

- `booking_channels_updated_at`: EXECUTE FUNCTION update_updated_at_column()

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| staff_read_channels | SELECT | `true` | `` |

### booking_groups

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| property_id | uuid |  |  | properties.id |
| reference | character varying(20) |  |  |  |
| name | character varying(120) |  |  |  |
| organiser_guest_id | uuid | yes |  | guests.id |
| organiser_name | character varying(120) | yes |  |  |
| organiser_email | character varying(255) | yes |  |  |
| organiser_phone | character varying(50) | yes |  |  |
| company | character varying(120) | yes |  |  |
| check_in | date |  |  |  |
| check_out | date |  |  |  |
| rooms_requested | integer |  | 0 |  |
| rate_plan_id | uuid | yes |  | rate_plans.id |
| channel_id | uuid | yes |  | booking_channels.id |
| billing_mode | character varying(20) |  | 'individual'::character varying |  |
| cutoff_date | date | yes |  |  |
| status | character varying(20) |  | 'tentative'::character varying |  |
| notes | text | yes |  |  |
| created_by | uuid | yes |  | staff.id |
| created_at | timestamp with time zone |  | now() |  |
| updated_at | timestamp with time zone |  | now() |  |

Constraints:

- check `booking_groups_billing_mode_check`: `CHECK (((billing_mode)::text = ANY ((ARRAY['individual'::character varying, 'master'::character varying])::text[])))`
- check `booking_groups_check`: `CHECK ((check_out > check_in))`
- check `booking_groups_check1`: `CHECK (((cutoff_date IS NULL) OR (cutoff_date <= check_in)))`
- unique `booking_groups_property_id_reference_key`: `UNIQUE (property_id, reference)`
- check `booking_groups_rooms_requested_check`: `CHECK ((rooms_requested >= 0))`
- check `booking_groups_status_check`: `CHECK (((status)::text = ANY ((ARRAY['tentative'::character varying, 'confirmed'::character varying, 'cancelled'::character varying, 'completed'::character varying])::text[])))`

Triggers:

- `booking_groups_updated_at`: EXECUTE FUNCTION update_updated_at_column()

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| booking_groups_select | SELECT | `can_access_property(property_id)` | `` |
| booking_groups_write | ALL | `(role_at_least(50) AND can_access_property(property_id))` | `(role_at_least(50) AND can_access_property(property_id))` |

### bookings

A stay: unit, guest, dates, status, totals. Overlapping confirmed stays on one unit are rejected by an exclusion constraint. `nights` is a generated column.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| property_id | uuid |  |  | properties.id |
| apartment_id | uuid |  |  | apartments.id |
| guest_id | uuid | yes |  | guests.id |
| channel_id | uuid |  |  | booking_channels.id |
| reference | character varying(20) |  |  |  |
| status | character varying(20) |  | 'pending'::character varying |  |
| check_in | date |  |  |  |
| check_out | date |  |  |  |
| nights | integer |  | generated |  |
| adults | integer |  | 1 |  |
| children | integer |  | 0 |  |
| infants | integer |  | 0 |  |
| rate_per_night_gbp | numeric(10,2) |  |  |  |
| discount_percentage | numeric(5,2) |  | 0 |  |
| total_amount_gbp | numeric(10,2) |  |  |  |
| total_amount_guest_currency | numeric(10,2) | yes |  |  |
| guest_currency | character varying(3) |  | 'GBP'::character varying |  |
| special_requests | text | yes |  |  |
| internal_notes | text | yes |  |  |
| checked_in_at | timestamp with time zone | yes |  |  |
| checked_out_at | timestamp with time zone | yes |  |  |
| cancelled_at | timestamp with time zone | yes |  |  |
| cancellation_reason | text | yes |  |  |
| created_at | timestamp with time zone |  | now() |  |
| updated_at | timestamp with time zone |  | now() |  |
| rate_plan_id | uuid | yes |  | rate_plans.id |
| rate_plan_snapshot | jsonb | yes |  |  |
| group_id | uuid | yes |  | booking_groups.id |
| precheckin | jsonb | yes |  |  |
| precheckin_completed_at | timestamp with time zone | yes |  |  |

Constraints:

- check `bookings_check`: `CHECK ((check_out > check_in))`
- exclusion `bookings_no_overlap`: `EXCLUDE USING gist (apartment_id WITH =, daterange(check_in, check_out, '[)'::text) WITH &&) WHERE (((status)::text <> ALL ((ARRAY['cancelled'::character varying, 'no_show'::character varying])::text[])))`
- unique `bookings_reference_key`: `UNIQUE (reference)`
- check `bookings_status_check`: `CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'confirmed'::character varying, 'checked_in'::character varying, 'checked_out'::character varying, 'cancelled'::character varying, 'no_show'::character varying])::text[])))`

Triggers:

- `bookings_updated_at`: EXECUTE FUNCTION update_updated_at_column()

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| staff_manage_bookings | ALL | `(property_id = get_staff_property_id())` | `(property_id = get_staff_property_id())` |

### brain_config

Configuration of the AI brain (mode, thresholds).

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | integer |  | 1 |  |
| mode | text |  | 'supervised'::text |  |
| enabled | boolean |  | true |  |
| cycle_interval_minutes | integer |  | 30 |  |
| last_cycle | timestamp with time zone | yes |  |  |
| total_cycles | integer |  | 0 |  |
| total_decisions | integer |  | 0 |  |
| total_executed | integer |  | 0 |  |
| updated_at | timestamp with time zone |  | now() |  |

Constraints:

- check `brain_config_mode_check`: `CHECK ((mode = ANY (ARRAY['supervised'::text, 'autonomous'::text])))`

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| Only admin/owner can update brain config | UPDATE | `(EXISTS ( SELECT 1    FROM staff   WHERE ((staff.auth_user_id = auth.uid()) AND ((staff.ro` | `` |
| Staff can read brain config | SELECT | `true` | `` |

### brain_decisions

Decisions proposed or executed by the AI brain per cycle.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| cycle_id | text |  |  |  |
| category | text |  |  |  |
| action | text |  |  |  |
| reasoning | text |  |  |  |
| confidence | integer | yes | 0 |  |
| impact_estimate | text | yes |  |  |
| auto_executable | boolean | yes | false |  |
| executed | boolean | yes | false |  |
| approved | boolean | yes |  |  |
| mode | text | yes | 'supervised'::text |  |
| event_type | text | yes |  |  |
| event_payload | jsonb | yes | '{}'::jsonb |  |
| data_snapshot | jsonb | yes | '{}'::jsonb |  |
| summary | text | yes |  |  |
| created_at | timestamp with time zone | yes | now() |  |

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| brain_decisions_admin_write | ALL | `role_at_least(70)` | `role_at_least(70)` |
| brain_decisions_management_select | SELECT | `role_at_least(70)` | `` |

### buildings

Physical buildings or wings of a property.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| property_id | uuid |  |  | properties.id |
| name | character varying(50) |  |  |  |
| code | character varying(10) |  |  |  |
| floors | integer |  | 7 |  |
| apartments_per_floor | integer |  | 10 |  |
| has_elevator | boolean |  | true |  |
| has_parking | boolean |  | false |  |
| status | character varying(20) |  | 'active'::character varying |  |
| created_at | timestamp with time zone |  | now() |  |
| updated_at | timestamp with time zone |  | now() |  |

Constraints:

- unique `buildings_property_id_code_key`: `UNIQUE (property_id, code)`
- check `buildings_status_check`: `CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'maintenance'::character varying, 'closed'::character varying])::text[])))`

Triggers:

- `buildings_updated_at`: EXECUTE FUNCTION update_updated_at_column()

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| staff_manage_buildings | ALL | `(property_id = get_staff_property_id())` | `(property_id = get_staff_property_id())` |

### currency_rates

Exchange rates refreshed daily by the FX cron.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| base_currency | character varying(3) |  | 'GBP'::character varying |  |
| target_currency | character varying(3) |  |  |  |
| rate | numeric(12,6) |  |  |  |
| source | character varying(30) |  | 'open_exchange_rates'::character varying |  |
| fetched_at | timestamp with time zone |  | now() |  |

Constraints:

- unique `currency_rates_base_currency_target_currency_fetched_at_key`: `UNIQUE (base_currency, target_currency, fetched_at)`

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| read_currency_rates | SELECT | `true` | `` |

### daily_closes

One row per property per business date closed by the night audit (charges posted, no-shows marked).

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| property_id | uuid |  |  | properties.id |
| business_date | date |  |  |  |
| closed_at | timestamp with time zone |  | now() |  |
| closed_by | text |  | 'system'::text |  |
| arrivals_expected | integer |  | 0 |  |
| arrivals_checked_in | integer |  | 0 |  |
| no_shows_marked | integer |  | 0 |  |
| departures_expected | integer |  | 0 |  |
| departures_checked_out | integer |  | 0 |  |
| still_in_house_past_checkout | integer |  | 0 |  |
| rooms_occupied | integer |  | 0 |  |
| rooms_total | integer |  | 0 |  |
| occupancy_percent | numeric(5,2) |  | 0 |  |
| room_revenue_gbp | numeric(12,2) |  | 0 |  |
| payments_received_gbp | numeric(12,2) |  | 0 |  |
| notes | jsonb |  | '{}'::jsonb |  |

Constraints:

- unique `daily_closes_property_id_business_date_key`: `UNIQUE (property_id, business_date)`

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| daily_closes_admin_write | ALL | `(role_at_least(90) AND can_access_property(property_id))` | `role_at_least(90)` |
| daily_closes_management_select | SELECT | `(role_at_least(70) AND can_access_property(property_id))` | `` |

### demand_forecasts

Forecast rows produced by the predictions engine.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| property_id | uuid |  |  | properties.id |
| forecast_date | date |  |  |  |
| horizon_days | integer |  |  |  |
| predicted_occupancy | numeric(5,2) |  |  |  |
| predicted_adr_gbp | numeric(10,2) | yes |  |  |
| predicted_revenue_gbp | numeric(12,2) | yes |  |  |
| confidence_score | numeric(3,2) |  |  |  |
| model_version | character varying(20) |  | 'v1'::character varying |  |
| factors | jsonb | yes | '{}'::jsonb |  |
| actual_occupancy | numeric(5,2) | yes |  |  |
| actual_revenue_gbp | numeric(12,2) | yes |  |  |
| created_at | timestamp with time zone |  | now() |  |

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| staff_read_forecasts | SELECT | `(property_id = get_staff_property_id())` | `` |

### department_budgets

Monthly budget per department; the source of budget-vs-actual, never estimated.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| property_id | uuid |  |  | properties.id |
| department | character varying(40) |  |  |  |
| month | date |  |  |  |
| budget_gbp | numeric(12,2) |  |  |  |
| updated_by | text | yes |  |  |
| updated_at | timestamp with time zone |  | now() |  |

Constraints:

- check `department_budgets_budget_gbp_check`: `CHECK ((budget_gbp >= (0)::numeric))`
- unique `department_budgets_property_id_department_month_key`: `UNIQUE (property_id, department, month)`

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| budgets_management | ALL | `(role_at_least(70) AND can_access_property(property_id))` | `(role_at_least(70) AND can_access_property(property_id))` |

### excursion_bookings

Excursions booked by guests.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| excursion_id | uuid |  |  | excursions.id |
| guest_id | uuid |  |  | guests.id |
| booking_id | uuid | yes |  | bookings.id |
| date | date |  |  |  |
| participants | integer |  | 1 |  |
| total_price_gbp | numeric(10,2) |  |  |  |
| commission_gbp | numeric(10,2) |  |  |  |
| status | character varying(20) |  | 'confirmed'::character varying |  |
| special_requests | text | yes |  |  |
| cancelled_at | timestamp with time zone | yes |  |  |
| created_at | timestamp with time zone |  | now() |  |

Constraints:

- check `excursion_bookings_status_check`: `CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'confirmed'::character varying, 'cancelled'::character varying, 'completed'::character varying, 'no_show'::character varying])::text[])))`

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| excursion_bookings_role_floor | ALL | `role_at_least(50)` | `role_at_least(50)` |

### excursions

Excursion catalogue.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| property_id | uuid |  |  | properties.id |
| partner_id | uuid |  |  | partners.id |
| name | character varying(100) |  |  |  |
| slug | character varying(100) |  |  |  |
| description | text |  |  |  |
| short_description | character varying(200) | yes |  |  |
| type | character varying(30) |  |  |  |
| duration_hours | numeric(4,1) |  |  |  |
| price_gbp | numeric(10,2) |  |  |  |
| price_egp | numeric(10,2) | yes |  |  |
| max_participants | integer | yes |  |  |
| min_participants | integer | yes | 1 |  |
| difficulty | character varying(10) | yes | 'easy'::character varying |  |
| includes | _text[] | yes |  |  |
| excludes | _text[] | yes |  |  |
| meeting_point | text | yes |  |  |
| meeting_latitude | numeric(10,7) | yes |  |  |
| meeting_longitude | numeric(10,7) | yes |  |  |
| image_url | text | yes |  |  |
| gallery_urls | _text[] | yes |  |  |
| average_rating | numeric(3,2) | yes | 0 |  |
| total_reviews | integer |  | 0 |  |
| is_active | boolean |  | true |  |
| created_at | timestamp with time zone |  | now() |  |
| updated_at | timestamp with time zone |  | now() |  |

Constraints:

- check `excursions_difficulty_check`: `CHECK (((difficulty)::text = ANY ((ARRAY['easy'::character varying, 'moderate'::character varying, 'challenging'::character varying, 'extreme'::character varying])::text[])))`
- unique `excursions_property_id_slug_key`: `UNIQUE (property_id, slug)`
- check `excursions_type_check`: `CHECK (((type)::text = ANY ((ARRAY['water_sports'::character varying, 'desert'::character varying, 'cultural'::character varying, 'relaxation'::character varying, 'adventure'::character varying, 'food'::character varying, 'nightlife'::character varying, 'family'::character varying])::text[])))`

Triggers:

- `excursions_updated_at`: EXECUTE FUNCTION update_updated_at_column()

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| staff_manage_excursions | ALL | `(property_id = get_staff_property_id())` | `(property_id = get_staff_property_id())` |

### expenses

Operating expenses by category and department, with R&D flag.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| property_id | uuid |  |  | properties.id |
| category | character varying(30) |  |  |  |
| description | character varying(200) |  |  |  |
| amount_egp | numeric(12,2) |  |  |  |
| amount_gbp | numeric(12,2) | yes |  |  |
| fx_rate | numeric(12,6) | yes |  |  |
| vendor | character varying(100) | yes |  |  |
| invoice_reference | character varying(50) | yes |  |  |
| receipt_url | text | yes |  |  |
| is_recurring | boolean |  | false |  |
| recurring_frequency | character varying(20) | yes |  |  |
| is_r_and_d | boolean |  | false |  |
| approved_by | uuid | yes |  | staff.id |
| expense_date | date |  |  |  |
| created_at | timestamp with time zone |  | now() |  |
| updated_at | timestamp with time zone |  | now() |  |

Constraints:

- check `expenses_category_check`: `CHECK (((category)::text = ANY ((ARRAY['staff'::character varying, 'utilities'::character varying, 'maintenance'::character varying, 'supplies'::character varying, 'marketing'::character varying, 'insurance'::character varying, 'tax'::character varying, 'commission'::character varying, 'technology'::character varying, 'other'::character varying])::text[])))`

Triggers:

- `expenses_updated_at`: EXECUTE FUNCTION update_updated_at_column()

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| staff_manage_expenses | ALL | `(property_id = get_staff_property_id())` | `(property_id = get_staff_property_id())` |

### facilities

On-site facilities (pool, gym, meeting rooms).

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| property_id | uuid |  |  | properties.id |
| name | character varying(100) |  |  |  |
| type | character varying(30) |  |  |  |
| description | text | yes |  |  |
| capacity | integer | yes |  |  |
| opening_time | time without time zone | yes |  |  |
| closing_time | time without time zone | yes |  |  |
| is_reservable | boolean |  | false |  |
| is_active | boolean |  | true |  |
| created_at | timestamp with time zone |  | now() |  |
| updated_at | timestamp with time zone |  | now() |  |

Constraints:

- check `facilities_type_check`: `CHECK (((type)::text = ANY ((ARRAY['pool'::character varying, 'restaurant'::character varying, 'gym'::character varying, 'spa'::character varying, 'kids_club'::character varying, 'parking'::character varying, 'business_center'::character varying, 'laundry'::character varying, 'other'::character varying])::text[])))`

Triggers:

- `facilities_updated_at`: EXECUTE FUNCTION update_updated_at_column()

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| staff_manage_facilities | ALL | `(property_id = get_staff_property_id())` | `(property_id = get_staff_property_id())` |

### facility_bookings

Reservations of facilities.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| facility_id | uuid |  |  | facilities.id |
| guest_id | uuid | yes |  | guests.id |
| booking_date | date |  |  |  |
| start_time | time without time zone |  |  |  |
| end_time | time without time zone |  |  |  |
| guests_count | integer |  | 1 |  |
| status | character varying(20) |  | 'confirmed'::character varying |  |
| notes | text | yes |  |  |
| created_at | timestamp with time zone |  | now() |  |

Constraints:

- check `facility_bookings_status_check`: `CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'confirmed'::character varying, 'cancelled'::character varying, 'completed'::character varying, 'no_show'::character varying])::text[])))`

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| facility_bookings_scoped | ALL | `(facility_id IN ( SELECT facilities.id    FROM facilities   WHERE can_access_property(faci` | `(role_at_least(50) AND (facility_id IN ( SELECT facilities.id    FROM facilities   WHERE c` |

### financial_reports

Stored report snapshots.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| property_id | uuid |  |  | properties.id |
| report_type | character varying(30) |  |  |  |
| period_start | date |  |  |  |
| period_end | date |  |  |  |
| revenue_gbp | numeric(12,2) | yes |  |  |
| expenses_gbp | numeric(12,2) | yes |  |  |
| net_profit_gbp | numeric(12,2) | yes |  |  |
| occupancy_rate | numeric(5,2) | yes |  |  |
| adr_gbp | numeric(10,2) | yes |  |  |
| revpaa_gbp | numeric(10,2) | yes |  |  |
| data | jsonb |  | '{}'::jsonb |  |
| generated_at | timestamp with time zone |  | now() |  |
| generated_by | uuid | yes |  | staff.id |

Constraints:

- check `financial_reports_report_type_check`: `CHECK (((report_type)::text = ANY ((ARRAY['daily'::character varying, 'weekly'::character varying, 'monthly'::character varying, 'quarterly'::character varying, 'annual'::character varying, 'custom'::character varying])::text[])))`

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| staff_manage_reports | ALL | `(property_id = get_staff_property_id())` | `(property_id = get_staff_property_id())` |

### flash_deals

Time-boxed deals.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| property_id | uuid |  |  | properties.id |
| partner_id | uuid | yes |  | partners.id |
| excursion_id | uuid | yes |  | excursions.id |
| title | character varying(100) |  |  |  |
| description | text |  |  |  |
| original_price_gbp | numeric(10,2) |  |  |  |
| deal_price_gbp | numeric(10,2) |  |  |  |
| discount_percentage | numeric(5,2) |  |  |  |
| max_claims | integer |  |  |  |
| current_claims | integer |  | 0 |  |
| starts_at | timestamp with time zone |  |  |  |
| expires_at | timestamp with time zone |  |  |  |
| is_active | boolean |  | true |  |
| image_url | text | yes |  |  |
| created_at | timestamp with time zone |  | now() |  |

Constraints:

- check `flash_deals_check`: `CHECK ((expires_at > starts_at))`
- check `flash_deals_check1`: `CHECK ((expires_at <= (starts_at + '48:00:00'::interval)))`
- check `flash_deals_discount_percentage_check`: `CHECK ((discount_percentage >= (25)::numeric))`

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| staff_manage_flash_deals | ALL | `(property_id = get_staff_property_id())` | `(property_id = get_staff_property_id())` |

### folio_lines

Append-only ledger lines (room, tax, levy, extra, payment, refund, reversal). Updates and deletes are rejected by trigger; corrections are reversing lines.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| folio_id | uuid |  |  | folios.id |
| business_date | date |  |  |  |
| posted_at | timestamp with time zone |  | now() |  |
| posted_by | text |  | 'system'::text |  |
| type | character varying(12) |  |  |  |
| description | character varying(200) |  |  |  |
| quantity | numeric(10,2) |  | 1 |  |
| unit_amount_gbp | numeric(12,2) |  | 0 |  |
| debit_gbp | numeric(12,2) |  | 0 |  |
| credit_gbp | numeric(12,2) |  | 0 |  |
| tax_rate_percent | numeric(5,2) | yes |  |  |
| reference_type | character varying(30) | yes |  |  |
| reference_id | uuid | yes |  |  |
| reversal_of | uuid | yes |  | folio_lines.id |
| void_reason | text | yes |  |  |

Constraints:

- check `folio_lines_check`: `CHECK (((debit_gbp = (0)::numeric) OR (credit_gbp = (0)::numeric)))`
- check `folio_lines_credit_gbp_check`: `CHECK ((credit_gbp >= (0)::numeric))`
- check `folio_lines_debit_gbp_check`: `CHECK ((debit_gbp >= (0)::numeric))`
- check `folio_lines_type_check`: `CHECK (((type)::text = ANY ((ARRAY['room'::character varying, 'tax'::character varying, 'levy'::character varying, 'extra'::character varying, 'fnb'::character varying, 'adjustment'::character varying, 'payment'::character varying, 'refund'::character varying, 'reversal'::character varying])::text[])))`

Triggers:

- `trg_folio_lines_immutable`: EXECUTE FUNCTION folio_lines_immutable()

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| folio_lines_front_desk | ALL | `(role_at_least(50) AND (folio_id IN ( SELECT folios.id    FROM folios   WHERE can_access_p` | `(role_at_least(50) AND (folio_id IN ( SELECT folios.id    FROM folios   WHERE can_access_p` |

### folios

Guest account for a stay; opened at check-in or by a deposit, closed at check-out.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| property_id | uuid |  |  | properties.id |
| booking_id | uuid |  |  | bookings.id |
| guest_id | uuid | yes |  | guests.id |
| status | character varying(10) |  | 'open'::character varying |  |
| invoice_id | uuid | yes |  | invoices.id |
| opened_at | timestamp with time zone |  | now() |  |
| closed_at | timestamp with time zone | yes |  |  |
| closed_by | text | yes |  |  |
| created_at | timestamp with time zone |  | now() |  |
| updated_at | timestamp with time zone |  | now() |  |

Constraints:

- unique `folios_booking_id_key`: `UNIQUE (booking_id)`
- check `folios_status_check`: `CHECK (((status)::text = ANY ((ARRAY['open'::character varying, 'closed'::character varying, 'void'::character varying])::text[])))`

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| folios_front_desk | ALL | `(role_at_least(50) AND can_access_property(property_id))` | `(role_at_least(50) AND can_access_property(property_id))` |

### gdpr_requests

Subject access and erasure requests with their state.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| guest_id | uuid | yes |  | guests.id |
| staff_id | uuid | yes |  | staff.id |
| request_type | text |  |  |  |
| status | text |  | 'pending'::text |  |
| requested_by | uuid | yes |  |  |
| requested_at | timestamp with time zone |  | now() |  |
| completed_at | timestamp with time zone | yes |  |  |
| expires_at | timestamp with time zone | yes |  |  |
| notes | text | yes |  |  |
| metadata | jsonb | yes | '{}'::jsonb |  |

Constraints:

- check `gdpr_requests_request_type_check`: `CHECK ((request_type = ANY (ARRAY['export'::text, 'erasure'::text, 'rectification'::text, 'consent_change'::text])))`
- check `gdpr_requests_status_check`: `CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'rejected'::text, 'expired'::text])))`

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| Admin/owner can create GDPR requests | INSERT | `` | `(EXISTS ( SELECT 1    FROM staff   WHERE ((staff.auth_user_id = auth.uid()) AND ((staff.ro` |
| Admin/owner can update GDPR requests | UPDATE | `(EXISTS ( SELECT 1    FROM staff   WHERE ((staff.auth_user_id = auth.uid()) AND ((staff.ro` | `` |
| Staff can view GDPR requests | SELECT | `(EXISTS ( SELECT 1    FROM staff   WHERE (staff.auth_user_id = auth.uid())))` | `` |

### guest_activity_log

Timeline of guest-facing events.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| guest_id | uuid |  |  | guests.id |
| activity_type | character varying(30) |  |  |  |
| activity_detail | jsonb |  | '{}'::jsonb |  |
| source | character varying(20) |  | 'app'::character varying |  |
| ip_address | inet | yes |  |  |
| user_agent | text | yes |  |  |
| created_at | timestamp with time zone |  | now() |  |

Constraints:

- check `guest_activity_log_source_check`: `CHECK (((source)::text = ANY ((ARRAY['app'::character varying, 'web'::character varying, 'reception'::character varying, 'system'::character varying, 'iot'::character varying])::text[])))`

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| guest_activity_front_desk | ALL | `(role_at_least(50) AND (guest_id IN ( SELECT guests.id    FROM guests   WHERE can_access_p` | `(role_at_least(30) AND (guest_id IN ( SELECT guests.id    FROM guests   WHERE can_access_p` |

### guest_communications

Outbound messages to guests and their delivery status.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| guest_id | uuid |  |  | guests.id |
| type | character varying(20) |  |  |  |
| direction | character varying(10) |  |  |  |
| subject | character varying(200) | yes |  |  |
| body | text | yes |  |  |
| status | character varying(20) |  | 'sent'::character varying |  |
| sent_by | uuid | yes |  | staff.id |
| sent_at | timestamp with time zone | yes | now() |  |
| read_at | timestamp with time zone | yes |  |  |
| metadata | jsonb | yes | '{}'::jsonb |  |
| created_at | timestamp with time zone |  | now() |  |

Constraints:

- check `guest_communications_direction_check`: `CHECK (((direction)::text = ANY ((ARRAY['inbound'::character varying, 'outbound'::character varying])::text[])))`
- check `guest_communications_status_check`: `CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'sent'::character varying, 'delivered'::character varying, 'read'::character varying, 'failed'::character varying])::text[])))`
- check `guest_communications_type_check`: `CHECK (((type)::text = ANY ((ARRAY['email'::character varying, 'sms'::character varying, 'whatsapp'::character varying, 'push'::character varying, 'in_app'::character varying, 'phone_call'::character varying])::text[])))`

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| guest_comms_front_desk | ALL | `(role_at_least(50) AND (guest_id IN ( SELECT guests.id    FROM guests   WHERE can_access_p` | `(role_at_least(50) AND (guest_id IN ( SELECT guests.id    FROM guests   WHERE can_access_p` |

### guest_consent

GDPR consent records per guest and purpose.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| guest_id | uuid |  |  | guests.id |
| consent_type | text |  |  |  |
| granted | boolean |  | false |  |
| granted_at | timestamp with time zone | yes |  |  |
| withdrawn_at | timestamp with time zone | yes |  |  |
| method | text | yes | 'explicit'::text |  |
| ip_address | inet | yes |  |  |
| notes | text | yes |  |  |
| created_at | timestamp with time zone |  | now() |  |
| updated_at | timestamp with time zone |  | now() |  |

Constraints:

- check `guest_consent_consent_type_check`: `CHECK ((consent_type = ANY (ARRAY['marketing'::text, 'analytics'::text, 'profiling'::text, 'third_party_sharing'::text])))`
- unique `guest_consent_guest_id_consent_type_key`: `UNIQUE (guest_id, consent_type)`
- check `guest_consent_method_check`: `CHECK ((method = ANY (ARRAY['explicit'::text, 'implicit'::text, 'opt_out'::text])))`

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| Staff can manage guest consent | ALL | `(EXISTS ( SELECT 1    FROM staff   WHERE ((staff.auth_user_id = auth.uid()) AND ((staff.ro` | `` |
| Staff can view guest consent | SELECT | `(EXISTS ( SELECT 1    FROM staff   WHERE (staff.auth_user_id = auth.uid())))` | `` |

### guest_predictions

Model outputs per guest (churn, lifetime value).

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| guest_id | uuid |  |  | guests.id |
| prediction_type | character varying(30) |  |  |  |
| predicted_value | numeric(10,4) |  |  |  |
| confidence | numeric(3,2) |  |  |  |
| model_version | character varying(20) |  | 'v1'::character varying |  |
| features_used | jsonb | yes | '{}'::jsonb |  |
| actual_outcome | numeric(10,4) | yes |  |  |
| was_accurate | boolean | yes |  |  |
| created_at | timestamp with time zone |  | now() |  |
| evaluated_at | timestamp with time zone | yes |  |  |

Constraints:

- check `guest_predictions_prediction_type_check`: `CHECK (((prediction_type)::text = ANY ((ARRAY['return_probability'::character varying, 'spend_forecast'::character varying, 'upsell_likelihood'::character varying, 'churn_risk'::character varying, 'segment_change'::character varying])::text[])))`

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| predictions_management | ALL | `(role_at_least(70) AND (guest_id IN ( SELECT guests.id    FROM guests   WHERE can_access_p` | `role_at_least(70)` |

### guest_preferences

Preference DNA per guest (room, pillow, temperature, dietary ...).

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| guest_id | uuid |  |  | guests.id |
| floor_preference | character varying(10) | yes |  |  |
| view_preference | character varying(20) | yes |  |  |
| bed_type | character varying(20) | yes |  |  |
| pillow_type | character varying(20) | yes |  |  |
| mattress_firmness | character varying(10) | yes |  |  |
| ac_temperature_c | integer | yes |  |  |
| ac_mode | character varying(10) | yes |  |  |
| housekeeping_frequency | character varying(20) | yes |  |  |
| housekeeping_time | character varying(20) | yes |  |  |
| towel_change_frequency | character varying(20) | yes |  |  |
| linen_change_frequency | character varying(20) | yes |  |  |
| dietary_needs | _varchar[] | yes | '{}'::character varying[] |  |
| food_allergies | _varchar[] | yes | '{}'::character varying[] |  |
| cuisine_preferences | _varchar[] | yes | '{}'::character varying[] |  |
| coffee_type | character varying(30) | yes |  |  |
| tea_type | character varying(30) | yes |  |  |
| milk_preference | character varying(20) | yes |  |  |
| minibar_preferences | jsonb | yes | '[]'::jsonb |  |
| contact_method | character varying(20) | yes |  |  |
| contact_language | character varying(5) | yes | 'en'::character varying |  |
| notification_preferences | jsonb | yes | '{"deals": true, "events": true, "rem... |  |
| interests | _varchar[] | yes | '{}'::character varying[] |  |
| activity_level | character varying(10) | yes |  |  |
| pool_preference | character varying(20) | yes |  |  |
| beach_preference | character varying(20) | yes |  |  |
| spa_preferences | jsonb | yes | '[]'::jsonb |  |
| has_children | boolean | yes | false |  |
| children_ages | _int4[] | yes | '{}'::integer[] |  |
| childcare_needed | boolean | yes | false |  |
| airport_transfer | boolean | yes | false |  |
| shuttle_preference | character varying(20) | yes |  |  |
| anniversary_date | date | yes |  |  |
| birthday_celebrations | boolean | yes | false |  |
| typical_arrival_time | time without time zone | yes |  |  |
| typical_departure_time | time without time zone | yes |  |  |
| early_checkin_preference | boolean | yes | false |  |
| late_checkout_preference | boolean | yes | false |  |
| extra_preferences | jsonb | yes | '{}'::jsonb |  |
| auto_learned | boolean |  | false |  |
| confidence_score | numeric(3,2) | yes | 0.00 |  |
| last_updated_from | character varying(20) | yes |  |  |
| created_at | timestamp with time zone |  | now() |  |
| updated_at | timestamp with time zone |  | now() |  |

Constraints:

- check `guest_preferences_ac_mode_check`: `CHECK (((ac_mode)::text = ANY ((ARRAY['cool'::character varying, 'heat'::character varying, 'auto'::character varying, 'fan'::character varying])::text[])))`
- check `guest_preferences_ac_temperature_c_check`: `CHECK (((ac_temperature_c >= 16) AND (ac_temperature_c <= 30)))`
- check `guest_preferences_activity_level_check`: `CHECK (((activity_level)::text = ANY ((ARRAY['relaxed'::character varying, 'moderate'::character varying, 'active'::character varying, 'adventure'::character varying])::text[])))`
- check `guest_preferences_bed_type_check`: `CHECK (((bed_type)::text = ANY ((ARRAY['single'::character varying, 'double'::character varying, 'king'::character varying, 'twin'::character varying, 'any'::character varying])::text[])))`
- check `guest_preferences_contact_method_check`: `CHECK (((contact_method)::text = ANY ((ARRAY['email'::character varying, 'phone'::character varying, 'whatsapp'::character varying, 'sms'::character varying, 'app'::character varying])::text[])))`
- check `guest_preferences_floor_preference_check`: `CHECK (((floor_preference)::text = ANY ((ARRAY['low'::character varying, 'mid'::character varying, 'high'::character varying, 'any'::character varying])::text[])))`
- unique `guest_preferences_guest_id_key`: `UNIQUE (guest_id)`
- check `guest_preferences_housekeeping_frequency_check`: `CHECK (((housekeeping_frequency)::text = ANY ((ARRAY['daily'::character varying, 'every_other_day'::character varying, 'twice_weekly'::character varying, 'weekly'::character varying, 'on_request'::character varying])::text[])))`
- check `guest_preferences_housekeeping_time_check`: `CHECK (((housekeeping_time)::text = ANY ((ARRAY['morning'::character varying, 'afternoon'::character varying, 'evening'::character varying, 'any'::character varying])::text[])))`
- check `guest_preferences_mattress_firmness_check`: `CHECK (((mattress_firmness)::text = ANY ((ARRAY['soft'::character varying, 'medium'::character varying, 'firm'::character varying, 'any'::character varying])::text[])))`
- check `guest_preferences_pillow_type_check`: `CHECK (((pillow_type)::text = ANY ((ARRAY['soft'::character varying, 'firm'::character varying, 'memory_foam'::character varying, 'any'::character varying])::text[])))`
- check `guest_preferences_view_preference_check`: `CHECK (((view_preference)::text = ANY ((ARRAY['sea'::character varying, 'pool'::character varying, 'garden'::character varying, 'city'::character varying, 'any'::character varying])::text[])))`

Triggers:

- `guest_preferences_updated_at`: EXECUTE FUNCTION update_updated_at_column()

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| guest_prefs_front_desk | ALL | `(role_at_least(50) AND (guest_id IN ( SELECT guests.id    FROM guests   WHERE can_access_p` | `(role_at_least(50) AND (guest_id IN ( SELECT guests.id    FROM guests   WHERE can_access_p` |

### guest_segments

Named guest segments for marketing and pricing.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| name | character varying(50) |  |  |  |
| code | character varying(20) |  |  |  |
| description | text | yes |  |  |
| criteria | jsonb | yes |  |  |
| created_at | timestamp with time zone |  | now() |  |

Constraints:

- unique `guest_segments_code_key`: `UNIQUE (code)`
- unique `guest_segments_name_key`: `UNIQUE (name)`

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| staff_read_segments | SELECT | `true` | `` |

### guests

Guest master record. Passport numbers are encrypted at rest (enc:v1: prefix). Loyalty tier and VIP flag live here.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| auth_user_id | uuid | yes |  |  |
| segment_id | uuid | yes |  | guest_segments.id |
| first_name | character varying(50) |  |  |  |
| last_name | character varying(50) |  |  |  |
| email | character varying(100) | yes |  |  |
| phone | character varying(20) | yes |  |  |
| date_of_birth | date | yes |  |  |
| nationality | character varying(60) | yes |  |  |
| language | character varying(20) |  | 'en'::character varying |  |
| preferred_currency | character varying(3) |  | 'GBP'::character varying |  |
| passport_number | text | yes |  |  |
| address_line1 | character varying(200) | yes |  |  |
| address_line2 | character varying(200) | yes |  |  |
| city | character varying(100) | yes |  |  |
| country | character varying(60) | yes |  |  |
| postcode | character varying(20) | yes |  |  |
| loyalty_tier | character varying(20) |  | 'bronze'::character varying |  |
| loyalty_points | integer |  | 0 |  |
| total_stays | integer |  | 0 |  |
| total_nights | integer |  | 0 |  |
| total_spend_gbp | numeric(12,2) |  | 0 |  |
| vip_status | boolean |  | false |  |
| notes | text | yes |  |  |
| marketing_consent | boolean |  | false |  |
| created_at | timestamp with time zone |  | now() |  |
| updated_at | timestamp with time zone |  | now() |  |
| property_id | uuid | yes |  | properties.id |

Constraints:

- unique `guests_auth_user_id_key`: `UNIQUE (auth_user_id)`
- unique `guests_email_key`: `UNIQUE (email)`
- check `guests_loyalty_tier_check`: `CHECK (((loyalty_tier)::text = ANY ((ARRAY['bronze'::character varying, 'silver'::character varying, 'gold'::character varying, 'platinum'::character varying])::text[])))`

Triggers:

- `guests_updated_at`: EXECUTE FUNCTION update_updated_at_column()

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| guests_admin_delete | DELETE | `role_at_least(90)` | `` |
| guests_front_desk_insert | INSERT | `` | `(role_at_least(50) AND can_access_property(property_id))` |
| guests_front_desk_select | SELECT | `(role_at_least(50) AND can_access_property(property_id))` | `` |
| guests_front_desk_update | UPDATE | `(role_at_least(50) AND can_access_property(property_id))` | `(role_at_least(50) AND can_access_property(property_id))` |
| guests_read_own | SELECT | `(auth_user_id = auth.uid())` | `` |

### housekeeping_tasks

Cleaning and inspection tasks per unit with type, status, priority and assignee.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| property_id | uuid |  |  | properties.id |
| apartment_id | uuid |  |  | apartments.id |
| assigned_to | uuid | yes |  | staff.id |
| type | character varying(20) |  |  |  |
| status | character varying(20) |  | 'pending'::character varying |  |
| priority | character varying(10) |  | 'normal'::character varying |  |
| scheduled_date | date |  |  |  |
| started_at | timestamp with time zone | yes |  |  |
| completed_at | timestamp with time zone | yes |  |  |
| verified_by | uuid | yes |  | staff.id |
| verified_at | timestamp with time zone | yes |  |  |
| photo_before | _text[] | yes |  |  |
| photo_after | _text[] | yes |  |  |
| notes | text | yes |  |  |
| checklist | jsonb | yes | '[]'::jsonb |  |
| created_at | timestamp with time zone |  | now() |  |
| updated_at | timestamp with time zone |  | now() |  |

Constraints:

- check `housekeeping_tasks_priority_check`: `CHECK (((priority)::text = ANY ((ARRAY['low'::character varying, 'normal'::character varying, 'high'::character varying, 'urgent'::character varying])::text[])))`
- check `housekeeping_tasks_status_check`: `CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'assigned'::character varying, 'in_progress'::character varying, 'completed'::character varying, 'verified'::character varying, 'issue_found'::character varying])::text[])))`
- check `housekeeping_tasks_type_check`: `CHECK (((type)::text = ANY ((ARRAY['checkout_clean'::character varying, 'midstay_clean'::character varying, 'deep_clean'::character varying, 'inspection'::character varying, 'turndown'::character varying])::text[])))`

Triggers:

- `housekeeping_tasks_updated_at`: EXECUTE FUNCTION update_updated_at_column()

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| staff_manage_housekeeping | ALL | `(property_id = get_staff_property_id())` | `(property_id = get_staff_property_id())` |

### inventory

Stock items and levels.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| property_id | uuid |  |  | properties.id |
| category | character varying(30) |  |  |  |
| name | character varying(100) |  |  |  |
| sku | character varying(50) | yes |  |  |
| unit | character varying(20) |  | 'piece'::character varying |  |
| quantity_in_stock | integer |  | 0 |  |
| minimum_stock | integer |  | 0 |  |
| reorder_quantity | integer | yes |  |  |
| unit_cost_egp | numeric(10,2) | yes |  |  |
| supplier | character varying(100) | yes |  |  |
| last_restocked_at | timestamp with time zone | yes |  |  |
| created_at | timestamp with time zone |  | now() |  |
| updated_at | timestamp with time zone |  | now() |  |

Constraints:

- check `inventory_category_check`: `CHECK (((category)::text = ANY ((ARRAY['linens'::character varying, 'toiletries'::character varying, 'cleaning'::character varying, 'kitchen'::character varying, 'maintenance'::character varying, 'office'::character varying, 'other'::character varying])::text[])))`

Triggers:

- `inventory_updated_at`: EXECUTE FUNCTION update_updated_at_column()

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| staff_manage_inventory | ALL | `(property_id = get_staff_property_id())` | `(property_id = get_staff_property_id())` |

### invoices

Invoice issued from a folio. Frozen by trigger once status is issued.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| property_id | uuid |  |  | properties.id |
| booking_id | uuid | yes |  | bookings.id |
| guest_id | uuid | yes |  | guests.id |
| invoice_number | character varying(20) |  |  |  |
| status | character varying(20) |  | 'draft'::character varying |  |
| subtotal_gbp | numeric(12,2) |  |  |  |
| tax_amount_gbp | numeric(12,2) |  | 0 |  |
| discount_amount_gbp | numeric(12,2) |  | 0 |  |
| total_gbp | numeric(12,2) |  |  |  |
| total_guest_currency | numeric(12,2) | yes |  |  |
| guest_currency | character varying(3) | yes | 'GBP'::character varying |  |
| fx_rate_used | numeric(12,6) | yes |  |  |
| line_items | jsonb |  | '[]'::jsonb |  |
| due_date | date |  |  |  |
| sent_at | timestamp with time zone | yes |  |  |
| paid_at | timestamp with time zone | yes |  |  |
| notes | text | yes |  |  |
| created_at | timestamp with time zone |  | now() |  |
| updated_at | timestamp with time zone |  | now() |  |

Constraints:

- unique `invoices_invoice_number_key`: `UNIQUE (invoice_number)`
- check `invoices_status_check`: `CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'sent'::character varying, 'paid'::character varying, 'partially_paid'::character varying, 'overdue'::character varying, 'cancelled'::character varying, 'refunded'::character varying])::text[])))`

Triggers:

- `invoices_updated_at`: EXECUTE FUNCTION update_updated_at_column()
- `trg_invoices_frozen`: EXECUTE FUNCTION invoices_frozen_once_issued()

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| staff_manage_invoices | ALL | `(property_id = get_staff_property_id())` | `(property_id = get_staff_property_id())` |

### loyalty_programme

Loyalty tiers and rules.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| guest_id | uuid |  |  | guests.id |
| transaction_type | character varying(20) |  |  |  |
| points | integer |  |  |  |
| balance_after | integer |  |  |  |
| description | character varying(200) |  |  |  |
| reference_type | character varying(30) | yes |  |  |
| reference_id | uuid | yes |  |  |
| created_at | timestamp with time zone |  | now() |  |

Constraints:

- check `loyalty_programme_transaction_type_check`: `CHECK (((transaction_type)::text = ANY ((ARRAY['earn'::character varying, 'redeem'::character varying, 'expire'::character varying, 'adjust'::character varying, 'bonus'::character varying])::text[])))`

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| loyalty_front_desk | ALL | `(role_at_least(50) AND (guest_id IN ( SELECT guests.id    FROM guests   WHERE can_access_p` | `(role_at_least(50) AND (guest_id IN ( SELECT guests.id    FROM guests   WHERE can_access_p` |

### maintenance_requests

Maintenance tickets per unit with category, priority and status.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| property_id | uuid |  |  | properties.id |
| apartment_id | uuid | yes |  | apartments.id |
| reported_by_guest | uuid | yes |  | guests.id |
| reported_by_staff | uuid | yes |  | staff.id |
| assigned_to | uuid | yes |  | staff.id |
| category | character varying(30) |  |  |  |
| priority | character varying(10) |  | 'normal'::character varying |  |
| status | character varying(20) |  | 'open'::character varying |  |
| title | character varying(200) |  |  |  |
| description | text |  |  |  |
| photos | _text[] | yes |  |  |
| resolution_notes | text | yes |  |  |
| estimated_cost_gbp | numeric(10,2) | yes |  |  |
| actual_cost_gbp | numeric(10,2) | yes |  |  |
| started_at | timestamp with time zone | yes |  |  |
| completed_at | timestamp with time zone | yes |  |  |
| created_at | timestamp with time zone |  | now() |  |
| updated_at | timestamp with time zone |  | now() |  |

Constraints:

- check `maintenance_requests_category_check`: `CHECK (((category)::text = ANY ((ARRAY['plumbing'::character varying, 'electrical'::character varying, 'hvac'::character varying, 'furniture'::character varying, 'appliance'::character varying, 'structural'::character varying, 'pest'::character varying, 'other'::character varying])::text[])))`
- check `maintenance_requests_priority_check`: `CHECK (((priority)::text = ANY ((ARRAY['low'::character varying, 'normal'::character varying, 'high'::character varying, 'urgent'::character varying, 'emergency'::character varying])::text[])))`
- check `maintenance_requests_status_check`: `CHECK (((status)::text = ANY ((ARRAY['open'::character varying, 'assigned'::character varying, 'in_progress'::character varying, 'on_hold'::character varying, 'completed'::character varying, 'cancelled'::character varying])::text[])))`

Triggers:

- `maintenance_requests_updated_at`: EXECUTE FUNCTION update_updated_at_column()

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| staff_manage_maintenance | ALL | `(property_id = get_staff_property_id())` | `(property_id = get_staff_property_id())` |

### notifications

In-app notifications per staff member; broadcasts create one row per active staff member.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| staff_id | uuid | yes |  | staff.id |
| title | text |  |  |  |
| message | text |  |  |  |
| type | text |  | 'info'::text |  |
| category | text | yes |  |  |
| link | text | yes |  |  |
| read | boolean | yes | false |  |
| created_at | timestamp with time zone | yes | now() |  |

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| notifications_own_select | SELECT | `((staff_id = get_staff_id()) OR ((staff_id IS NULL) AND role_at_least(50)))` | `` |
| notifications_own_update | UPDATE | `(staff_id = get_staff_id())` | `(staff_id = get_staff_id())` |
| notifications_staff_insert | INSERT | `` | `role_at_least(30)` |

### partner_certifications

Compliance documents of partners.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| partner_id | uuid |  |  | partners.id |
| type | character varying(30) |  |  |  |
| name | character varying(100) |  |  |  |
| issuer | character varying(100) | yes |  |  |
| certificate_number | character varying(50) | yes |  |  |
| issued_date | date |  |  |  |
| expiry_date | date | yes |  |  |
| document_url | text | yes |  |  |
| is_valid | boolean |  | true |  |
| created_at | timestamp with time zone |  | now() |  |

Constraints:

- check `partner_certifications_type_check`: `CHECK (((type)::text = ANY ((ARRAY['insurance'::character varying, 'license'::character varying, 'safety'::character varying, 'environmental'::character varying, 'quality'::character varying, 'other'::character varying])::text[])))`

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| certs_role_floor | ALL | `role_at_least(10)` | `role_at_least(70)` |

### partners

Local partners (excursions, transfers, beach).

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| property_id | uuid |  |  | properties.id |
| name | character varying(100) |  |  |  |
| type | character varying(30) |  |  |  |
| contact_name | character varying(100) | yes |  |  |
| contact_email | character varying(100) | yes |  |  |
| contact_phone | character varying(20) | yes |  |  |
| address | text | yes |  |  |
| latitude | numeric(10,7) | yes |  |  |
| longitude | numeric(10,7) | yes |  |  |
| commission_rate | numeric(5,2) |  | 10.00 |  |
| quality_score | numeric(3,1) | yes | 5.0 |  |
| total_bookings | integer |  | 0 |  |
| total_revenue_gbp | numeric(12,2) |  | 0 |  |
| status | character varying(20) |  | 'active'::character varying |  |
| auto_suspended | boolean |  | false |  |
| contract_start | date | yes |  |  |
| contract_end | date | yes |  |  |
| notes | text | yes |  |  |
| created_at | timestamp with time zone |  | now() |  |
| updated_at | timestamp with time zone |  | now() |  |

Constraints:

- check `partners_status_check`: `CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'active'::character varying, 'suspended'::character varying, 'terminated'::character varying])::text[])))`
- check `partners_type_check`: `CHECK (((type)::text = ANY ((ARRAY['beach_club'::character varying, 'excursion_operator'::character varying, 'restaurant'::character varying, 'spa'::character varying, 'transport'::character varying, 'retail'::character varying, 'other'::character varying])::text[])))`

Triggers:

- `partners_updated_at`: EXECUTE FUNCTION update_updated_at_column()

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| staff_manage_partners | ALL | `(property_id = get_staff_property_id())` | `(property_id = get_staff_property_id())` |

### payments

Money received against a folio or invoice.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| invoice_id | uuid | yes |  | invoices.id |
| amount_gbp | numeric(12,2) |  |  |  |
| amount_original | numeric(12,2) |  |  |  |
| currency | character varying(3) |  | 'GBP'::character varying |  |
| fx_rate | numeric(12,6) | yes |  |  |
| method | character varying(20) |  |  |  |
| stripe_payment_id | character varying(100) | yes |  |  |
| status | character varying(20) |  | 'pending'::character varying |  |
| reference | character varying(100) | yes |  |  |
| received_by | uuid | yes |  | staff.id |
| received_at | timestamp with time zone | yes | now() |  |
| notes | text | yes |  |  |
| created_at | timestamp with time zone |  | now() |  |
| folio_id | uuid | yes |  | folios.id |

Constraints:

- check `payments_method_check`: `CHECK (((method)::text = ANY ((ARRAY['stripe'::character varying, 'card'::character varying, 'cash'::character varying, 'bank_transfer'::character varying, 'cheque'::character varying, 'crypto'::character varying, 'other'::character varying])::text[])))`
- check `payments_status_check`: `CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'completed'::character varying, 'failed'::character varying, 'refunded'::character varying, 'partially_refunded'::character varying])::text[])))`
- check `payments_target_check`: `CHECK (((invoice_id IS NOT NULL) OR (folio_id IS NOT NULL)))`

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| payments_front_desk_insert | INSERT | `` | `(role_at_least(50) AND ((invoice_id IN ( SELECT invoices.id    FROM invoices   WHERE can_a` |
| payments_front_desk_select | SELECT | `(role_at_least(50) AND ((invoice_id IN ( SELECT invoices.id    FROM invoices   WHERE can_a` | `` |
| payments_management_update | UPDATE | `(role_at_least(70) AND ((invoice_id IN ( SELECT invoices.id    FROM invoices   WHERE can_a` | `role_at_least(70)` |

### pricing_decisions

Rate changes proposed or applied by the pricing automation (gated by AUTO_PRICING_ENABLED).

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| property_id | uuid |  |  | properties.id |
| apartment_type_id | uuid |  |  | apartment_types.id |
| decision_date | date |  |  |  |
| base_rate_gbp | numeric(10,2) |  |  |  |
| recommended_rate_gbp | numeric(10,2) |  |  |  |
| applied_rate_gbp | numeric(10,2) | yes |  |  |
| adjustment_reason | character varying(50) | yes |  |  |
| demand_score | numeric(3,2) | yes |  |  |
| was_accepted | boolean | yes |  |  |
| accepted_by | uuid | yes |  | staff.id |
| created_at | timestamp with time zone |  | now() |  |

Constraints:

- check `pricing_decisions_adjustment_reason_check`: `CHECK (((adjustment_reason)::text = ANY ((ARRAY['high_demand'::character varying, 'low_demand'::character varying, 'competitor'::character varying, 'event'::character varying, 'manual'::character varying, 'seasonal'::character varying])::text[])))`

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| staff_read_pricing_decisions | SELECT | `(property_id = get_staff_property_id())` | `` |

### promotions

Promotional offers.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| property_id | uuid |  |  | properties.id |
| name | character varying(100) |  |  |  |
| code | character varying(20) | yes |  |  |
| type | character varying(20) |  |  |  |
| value | numeric(10,2) |  |  |  |
| min_nights | integer | yes |  |  |
| max_uses | integer | yes |  |  |
| current_uses | integer |  | 0 |  |
| valid_from | date |  |  |  |
| valid_until | date |  |  |  |
| applicable_apartment_types | _uuid[] | yes |  |  |
| is_active | boolean |  | true |  |
| created_at | timestamp with time zone |  | now() |  |
| updated_at | timestamp with time zone |  | now() |  |

Constraints:

- check `promotions_check`: `CHECK ((valid_until > valid_from))`
- unique `promotions_code_key`: `UNIQUE (code)`
- check `promotions_type_check`: `CHECK (((type)::text = ANY ((ARRAY['percentage'::character varying, 'fixed_amount'::character varying, 'free_nights'::character varying, 'package'::character varying])::text[])))`

Triggers:

- `promotions_updated_at`: EXECUTE FUNCTION update_updated_at_column()

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| staff_manage_promotions | ALL | `(property_id = get_staff_property_id())` | `(property_id = get_staff_property_id())` |

### properties

A hotel or aparthotel operated on the platform. Carries VAT rate, currencies and the current business date.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| name | character varying(100) |  |  |  |
| slug | character varying(50) |  |  |  |
| address | text |  |  |  |
| city | character varying(50) |  | 'Hurghada'::character varying |  |
| country | character varying(2) |  | 'EG'::character varying |  |
| latitude | numeric(10,7) | yes |  |  |
| longitude | numeric(10,7) | yes |  |  |
| timezone | character varying(40) |  | 'Africa/Cairo'::character varying |  |
| default_currency | character varying(3) |  | 'EGP'::character varying |  |
| reporting_currency | character varying(3) |  | 'GBP'::character varying |  |
| star_rating | smallint | yes | 4 |  |
| total_apartments | integer |  | 250 |  |
| opening_date | date | yes |  |  |
| status | character varying(20) |  | 'construction'::character varying |  |
| phone | character varying(20) | yes |  |  |
| email | character varying(100) |  |  |  |
| website | character varying(200) | yes |  |  |
| created_at | timestamp with time zone |  | now() |  |
| updated_at | timestamp with time zone |  | now() |  |
| vat_rate_percent | numeric(5,2) |  | 0 |  |
| last_business_date | date | yes |  |  |
| tourism_levy_per_night_gbp | numeric(10,2) |  | 0 |  |

Constraints:

- unique `properties_slug_key`: `UNIQUE (slug)`
- check `properties_status_check`: `CHECK (((status)::text = ANY ((ARRAY['construction'::character varying, 'pre_opening'::character varying, 'active'::character varying, 'maintenance'::character varying, 'closed'::character varying])::text[])))`
- check `properties_vat_rate_percent_check`: `CHECK (((vat_rate_percent >= (0)::numeric) AND (vat_rate_percent <= (100)::numeric)))`

Triggers:

- `properties_updated_at`: EXECUTE FUNCTION update_updated_at_column()

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| staff_read_property | SELECT | `(id = get_staff_property_id())` | `` |

### rate_plans

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| property_id | uuid |  |  | properties.id |
| code | character varying(30) |  |  |  |
| name | character varying(100) |  |  |  |
| description | text | yes |  |  |
| pricing_mode | character varying(20) |  | 'bar'::character varying |  |
| adjustment | numeric(10,2) |  | 0 |  |
| cancellation_policy | character varying(20) |  | 'flexible'::character varying |  |
| free_cancellation_days | integer |  | 1 |  |
| min_nights | integer |  | 1 |  |
| max_nights | integer | yes |  |  |
| includes_breakfast | boolean |  | false |  |
| valid_from | date | yes |  |  |
| valid_to | date | yes |  |  |
| channel_codes | _text[] | yes |  |  |
| is_default | boolean |  | false |  |
| is_active | boolean |  | true |  |
| created_at | timestamp with time zone |  | now() |  |
| updated_at | timestamp with time zone |  | now() |  |

Constraints:

- check `rate_plans_adjustment_check`: `CHECK ((adjustment >= (0)::numeric))`
- check `rate_plans_cancellation_policy_check`: `CHECK (((cancellation_policy)::text = ANY ((ARRAY['flexible'::character varying, 'moderate'::character varying, 'strict'::character varying, 'non_refundable'::character varying])::text[])))`
- check `rate_plans_check`: `CHECK (((max_nights IS NULL) OR (max_nights >= min_nights)))`
- check `rate_plans_check1`: `CHECK (((valid_to IS NULL) OR (valid_from IS NULL) OR (valid_to >= valid_from)))`
- check `rate_plans_check2`: `CHECK ((((pricing_mode)::text <> 'percent_off'::text) OR (adjustment <= (100)::numeric)))`
- check `rate_plans_free_cancellation_days_check`: `CHECK ((free_cancellation_days >= 0))`
- check `rate_plans_min_nights_check`: `CHECK ((min_nights >= 1))`
- check `rate_plans_pricing_mode_check`: `CHECK (((pricing_mode)::text = ANY ((ARRAY['bar'::character varying, 'percent_off'::character varying, 'percent_markup'::character varying, 'fixed_nightly'::character varying])::text[])))`
- unique `rate_plans_property_id_code_key`: `UNIQUE (property_id, code)`

Triggers:

- `rate_plans_single_default`: EXECUTE FUNCTION rate_plans_single_default()
- `rate_plans_updated_at`: EXECUTE FUNCTION update_updated_at_column()

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| rate_plans_manage | ALL | `(role_at_least(70) AND can_access_property(property_id))` | `(role_at_least(70) AND can_access_property(property_id))` |
| rate_plans_select | SELECT | `can_access_property(property_id)` | `` |

### rates

Seasonal rate rows per apartment type (start/end date, weekly rate, minimum nights).

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| property_id | uuid |  |  | properties.id |
| apartment_type_id | uuid |  |  | apartment_types.id |
| season_name | character varying(50) |  |  |  |
| start_date | date |  |  |  |
| end_date | date |  |  |  |
| weekly_rate_gbp | numeric(10,2) |  |  |  |
| nightly_rate_gbp | numeric(10,2) |  |  |  |
| min_stay_nights | integer |  | 1 |  |
| is_active | boolean |  | true |  |
| created_at | timestamp with time zone |  | now() |  |
| updated_at | timestamp with time zone |  | now() |  |

Constraints:

- check `rates_check`: `CHECK ((end_date > start_date))`

Triggers:

- `rates_updated_at`: EXECUTE FUNCTION update_updated_at_column()

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| staff_manage_rates | ALL | `(property_id = get_staff_property_id())` | `(property_id = get_staff_property_id())` |

### refunds

Money returned, always linked to the original payment and a reason.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| payment_id | uuid |  |  | payments.id |
| folio_id | uuid | yes |  | folios.id |
| amount_gbp | numeric(12,2) |  |  |  |
| method | character varying(20) |  |  |  |
| reason | text |  |  |  |
| reference | character varying(100) | yes |  |  |
| refunded_by | uuid | yes |  | staff.id |
| created_at | timestamp with time zone |  | now() |  |

Constraints:

- check `refunds_amount_gbp_check`: `CHECK ((amount_gbp > (0)::numeric))`

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| refunds_management | ALL | `(role_at_least(50) AND (folio_id IN ( SELECT folios.id    FROM folios   WHERE can_access_p` | `role_at_least(70)` |

### reviews

Guest reviews and responses.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| booking_id | uuid |  |  | bookings.id |
| guest_id | uuid |  |  | guests.id |
| overall_rating | smallint |  |  |  |
| cleanliness_rating | smallint | yes |  |  |
| location_rating | smallint | yes |  |  |
| service_rating | smallint | yes |  |  |
| value_rating | smallint | yes |  |  |
| title | character varying(200) | yes |  |  |
| body | text | yes |  |  |
| response | text | yes |  |  |
| responded_at | timestamp with time zone | yes |  |  |
| is_public | boolean |  | true |  |
| source | character varying(20) |  | 'direct'::character varying |  |
| created_at | timestamp with time zone |  | now() |  |
| updated_at | timestamp with time zone |  | now() |  |

Constraints:

- check `reviews_cleanliness_rating_check`: `CHECK (((cleanliness_rating >= 1) AND (cleanliness_rating <= 5)))`
- check `reviews_location_rating_check`: `CHECK (((location_rating >= 1) AND (location_rating <= 5)))`
- check `reviews_overall_rating_check`: `CHECK (((overall_rating >= 1) AND (overall_rating <= 5)))`
- check `reviews_service_rating_check`: `CHECK (((service_rating >= 1) AND (service_rating <= 5)))`
- check `reviews_source_check`: `CHECK (((source)::text = ANY ((ARRAY['direct'::character varying, 'booking_com'::character varying, 'airbnb'::character varying, 'google'::character varying, 'tripadvisor'::character varying])::text[])))`
- check `reviews_value_rating_check`: `CHECK (((value_rating >= 1) AND (value_rating <= 5)))`

Triggers:

- `reviews_updated_at`: EXECUTE FUNCTION update_updated_at_column()

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| reviews_front_desk_write | ALL | `(role_at_least(50) AND (guest_id IN ( SELECT guests.id    FROM guests   WHERE can_access_p` | `(role_at_least(50) AND (guest_id IN ( SELECT guests.id    FROM guests   WHERE can_access_p` |
| reviews_staff_select | SELECT | `(role_at_least(10) AND (guest_id IN ( SELECT guests.id    FROM guests   WHERE can_access_p` | `` |

### shuttle_bookings

Seats booked on shuttles.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| schedule_id | uuid |  |  | shuttle_schedules.id |
| guest_id | uuid |  |  | guests.id |
| booking_id | uuid | yes |  | bookings.id |
| travel_date | date |  |  |  |
| passengers | integer |  | 1 |  |
| status | character varying(20) |  | 'confirmed'::character varying |  |
| pickup_notes | text | yes |  |  |
| created_at | timestamp with time zone |  | now() |  |

Constraints:

- check `shuttle_bookings_status_check`: `CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'confirmed'::character varying, 'cancelled'::character varying, 'completed'::character varying, 'no_show'::character varying])::text[])))`

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| shuttle_bookings_role_floor | ALL | `role_at_least(50)` | `role_at_least(50)` |

### shuttle_routes

Shuttle routes.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| property_id | uuid |  |  | properties.id |
| name | character varying(100) |  |  |  |
| description | text | yes |  |  |
| origin | text |  |  |  |
| destination | text |  |  |  |
| origin_latitude | numeric(10,7) | yes |  |  |
| origin_longitude | numeric(10,7) | yes |  |  |
| destination_latitude | numeric(10,7) | yes |  |  |
| destination_longitude | numeric(10,7) | yes |  |  |
| estimated_duration_mins | integer |  |  |  |
| distance_km | numeric(6,1) | yes |  |  |
| price_per_person_gbp | numeric(10,2) |  | 0 |  |
| vehicle_capacity | integer |  | 12 |  |
| is_active | boolean |  | true |  |
| created_at | timestamp with time zone |  | now() |  |
| updated_at | timestamp with time zone |  | now() |  |

Triggers:

- `shuttle_routes_updated_at`: EXECUTE FUNCTION update_updated_at_column()

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| staff_manage_shuttle_routes | ALL | `(property_id = get_staff_property_id())` | `(property_id = get_staff_property_id())` |

### shuttle_schedules

Shuttle departures.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| route_id | uuid |  |  | shuttle_routes.id |
| day_of_week | integer |  |  |  |
| departure_time | time without time zone |  |  |  |
| is_active | boolean |  | true |  |
| created_at | timestamp with time zone |  | now() |  |

Constraints:

- check `shuttle_schedules_day_of_week_check`: `CHECK (((day_of_week >= 0) AND (day_of_week <= 6)))`
- unique `shuttle_schedules_route_id_day_of_week_departure_time_key`: `UNIQUE (route_id, day_of_week, departure_time)`

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| shuttle_schedules_role_floor | ALL | `role_at_least(10)` | `role_at_least(70)` |

### staff

Staff members linked to auth users; `role` drives authorisation (owner, admin, manager, receptionist, housekeeping, maintenance, readonly).

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| auth_user_id | uuid | yes |  |  |
| property_id | uuid |  |  | properties.id |
| first_name | character varying(50) |  |  |  |
| last_name | character varying(50) |  |  |  |
| email | character varying(100) |  |  |  |
| phone | character varying(20) | yes |  |  |
| role | character varying(20) |  |  |  |
| department | character varying(30) | yes |  |  |
| is_active | boolean |  | true |  |
| language | character varying(5) |  | 'en'::character varying |  |
| avatar_url | text | yes |  |  |
| hire_date | date | yes |  |  |
| created_at | timestamp with time zone |  | now() |  |
| updated_at | timestamp with time zone |  | now() |  |

Constraints:

- unique `staff_auth_user_id_key`: `UNIQUE (auth_user_id)`
- unique `staff_email_key`: `UNIQUE (email)`
- check `staff_role_check`: `CHECK (((role)::text = ANY ((ARRAY['owner'::character varying, 'admin'::character varying, 'manager'::character varying, 'receptionist'::character varying, 'housekeeping'::character varying, 'maintenance'::character varying, 'readonly'::character varying])::text[])))`

Triggers:

- `staff_updated_at`: EXECUTE FUNCTION update_updated_at_column()
- `trg_staff_home_membership`: EXECUTE FUNCTION staff_home_membership()

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| staff_read_staff | SELECT | `(property_id = get_staff_property_id())` | `` |

### staff_properties

Membership of staff in properties; required for cross-property access.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| staff_id | uuid |  |  | staff.id |
| property_id | uuid |  |  | properties.id |
| granted_by | uuid | yes |  | staff.id |
| created_at | timestamp with time zone |  | now() |  |

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| staff_properties_admin_write | ALL | `role_at_least(90)` | `role_at_least(90)` |
| staff_properties_select | SELECT | `((staff_id = get_staff_id()) OR role_at_least(90))` | `` |

### staff_schedules

Shifts per staff member.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| staff_id | uuid |  |  | staff.id |
| date | date |  |  |  |
| shift_start | time without time zone |  |  |  |
| shift_end | time without time zone |  |  |  |
| shift_type | character varying(20) |  | 'regular'::character varying |  |
| status | character varying(20) |  | 'scheduled'::character varying |  |
| notes | text | yes |  |  |
| created_at | timestamp with time zone |  | now() |  |

Constraints:

- check `staff_schedules_shift_type_check`: `CHECK (((shift_type)::text = ANY ((ARRAY['regular'::character varying, 'overtime'::character varying, 'on_call'::character varying, 'holiday'::character varying])::text[])))`
- unique `staff_schedules_staff_id_date_shift_start_key`: `UNIQUE (staff_id, date, shift_start)`
- check `staff_schedules_status_check`: `CHECK (((status)::text = ANY ((ARRAY['scheduled'::character varying, 'confirmed'::character varying, 'completed'::character varying, 'absent'::character varying, 'cancelled'::character varying])::text[])))`

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| staff_read_schedules | SELECT | `(staff_id IN ( SELECT staff.id    FROM staff   WHERE (staff.property_id = get_staff_proper` | `` |

### system_events

Event bus log with idempotency keys; consumed by workflows and automations.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| type | text |  |  |  |
| source_system | text |  |  |  |
| payload | jsonb | yes | '{}'::jsonb |  |
| processed | boolean | yes | false |  |
| results | jsonb | yes | '[]'::jsonb |  |
| created_at | timestamp with time zone | yes | now() |  |
| idempotency_key | text | yes |  |  |

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| system_events_management_select | SELECT | `role_at_least(70)` | `` |
| system_events_staff_write | ALL | `role_at_least(30)` | `role_at_least(30)` |

### workflows

Multi-step operational workflows with optimistic locking on `version`.

| Column | Type | Null | Default | References |
| --- | --- | --- | --- | --- |
| id | uuid |  | gen_random_uuid() |  |
| property_id | uuid | yes |  |  |
| title | text |  |  |  |
| description | text | yes |  |  |
| source | text |  |  |  |
| source_id | text | yes |  |  |
| status | text | yes | 'pending'::text |  |
| priority | text | yes | 'normal'::text |  |
| steps | jsonb | yes | '[]'::jsonb |  |
| current_step | integer | yes | 0 |  |
| total_steps | integer | yes | 0 |  |
| created_by | text | yes |  |  |
| approved_by | text | yes |  |  |
| approved_at | timestamp with time zone | yes |  |  |
| completed_at | timestamp with time zone | yes |  |  |
| outcome | jsonb | yes |  |  |
| outcome_notes | text | yes |  |  |
| created_at | timestamp with time zone | yes | now() |  |
| updated_at | timestamp with time zone | yes | now() |  |
| version | integer |  | 0 |  |

Constraints:

- check `workflows_priority_check`: `CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text])))`
- check `workflows_source_check`: `CHECK ((source = ANY (ARRAY['ai_brain'::text, 'automation'::text, 'manual'::text, 'event'::text, 'anomaly'::text])))`
- check `workflows_status_check`: `CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'awaiting_approval'::text, 'approved'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))`

Triggers:

- `trg_workflows_version`: EXECUTE FUNCTION bump_workflow_version()

Row-level security policies:

| Policy | Command | Using | With check |
| --- | --- | --- | --- |
| workflows_management_write | ALL | `(role_at_least(70) AND ((property_id IS NULL) OR can_access_property(property_id)))` | `role_at_least(70)` |
| workflows_staff_select | SELECT | `((property_id IS NULL) OR can_access_property(property_id))` | `` |

## Functions

Called by API routes through PostgREST `rpc()`. SECURITY DEFINER functions run with the owner's rights and enforce their own checks.

| Function | Arguments | Returns | Language | Security definer |
| --- | --- | --- | --- | --- |
| add_group_rooms | `p_group_id uuid, p_apartment_ids uuid[], p_guest_ids uuid[], p_adults integer, p_rate_plan_id uuid` | jsonb | plpgsql |  |
| bump_workflow_version | `` | trigger | plpgsql |  |
| can_access_property | `p_property_id uuid` | boolean | sql | yes |
| cancel_group | `p_group_id uuid, p_reason text` | jsonb | plpgsql |  |
| checkin_booking | `p_booking_id uuid, p_notes text` | jsonb | plpgsql |  |
| checkout_booking | `p_booking_id uuid, p_notes text, p_allow_outstanding_balance boolean, p_points_per_gbp numeric` | jsonb | plpgsql |  |
| folio_balance | `p_folio_id uuid` | numeric | sql |  |
| folio_lines_immutable | `` | trigger | plpgsql |  |
| get_staff_id | `` | uuid | sql | yes |
| get_staff_property_id | `` | uuid | sql | yes |
| get_staff_role | `` | text | sql | yes |
| group_statement | `p_group_id uuid` | jsonb | plpgsql |  |
| invoices_frozen_once_issued | `` | trigger | plpgsql |  |
| is_guest | `` | boolean | sql | yes |
| issue_folio_invoice | `p_folio_id uuid, p_due_date date, p_actor text` | jsonb | plpgsql |  |
| next_booking_reference | `` | character varying | plpgsql | yes |
| next_group_reference | `` | character varying | plpgsql |  |
| next_invoice_number | `` | character varying | plpgsql | yes |
| open_folio | `p_booking_id uuid` | uuid | plpgsql |  |
| post_booking_room_charges | `p_booking_id uuid` | integer | plpgsql |  |
| post_folio_charge | `p_folio_id uuid, p_type text, p_description text, p_quantity numeric, p_unit_amount_gbp numeric, p_tax_rate_percent numeric, p_actor text` | jsonb | plpgsql |  |
| post_room_charges | `p_property_id uuid, p_business_date date, p_actor text` | integer | plpgsql |  |
| property_business_date | `p_property_id uuid` | date | sql |  |
| quote_stay | `p_apartment_type_id uuid, p_check_in date, p_check_out date, p_rate_plan_id uuid, p_channel_code text` | jsonb | plpgsql |  |
| rate_plans_single_default | `` | trigger | plpgsql |  |
| record_folio_payment | `p_folio_id uuid, p_amount_gbp numeric, p_method text, p_amount_original numeric, p_currency text, p_fx_rate numeric, p_reference text, p_received_by uuid, p_notes text, p_actor text` | jsonb | plpgsql |  |
| record_group_payment | `p_group_id uuid, p_amount_gbp numeric, p_method text, p_reference text, p_received_by uuid, p_notes text` | jsonb | plpgsql |  |
| record_invoice_payment | `p_invoice_id uuid, p_amount_gbp numeric, p_method text, p_amount_original numeric, p_currency text, p_fx_rate numeric, p_reference text, p_received_by uuid, p_notes text` | jsonb | plpgsql |  |
| refund_payment | `p_payment_id uuid, p_amount_gbp numeric, p_reason text, p_refunded_by uuid, p_reference text, p_actor text` | jsonb | plpgsql |  |
| revenue_by_stay_date | `p_property_id uuid, p_from date, p_to date` | TABLE(stay_date date, room_nights integer, room_revenue_gbp numeric, rooms_available integer) | sql |  |
| role_at_least | `p_level integer` | boolean | sql | yes |
| run_night_audit | `p_property_id uuid, p_business_date date, p_actor text` | jsonb | plpgsql |  |
| staff_home_membership | `` | trigger | plpgsql |  |
| staff_role_level | `` | integer | sql | yes |
| update_updated_at_column | `` | trigger | plpgsql |  |
| void_folio_line | `p_line_id uuid, p_reason text, p_actor text` | jsonb | plpgsql |  |
