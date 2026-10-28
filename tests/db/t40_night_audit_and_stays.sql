-- Night audit closes only ended days; check-in/out lifecycle; one open
-- checkout clean per unit and day; one pricing decision per type and day.
\set ON_ERROR_STOP 1

BEGIN;
SELECT tst.mk('d0000000-0000-0000-0000-000000000001', '101', 'confirmed', -1, 2);  -- yesterday's arrival, never came
SELECT tst.mk('d0000000-0000-0000-0000-000000000002', '102', 'confirmed', 0, 2);   -- arrives today
SELECT tst.mk('d0000000-0000-0000-0000-000000000003', '103', 'confirmed', 3, 5);   -- arrives in three days

SELECT tst.as_user('mgrA');
SELECT tst.raises('manager cannot run the night audit', $$select run_night_audit('aaaaaaaa-0000-0000-0000-000000000001')$$, 'ROLE_FORBIDDEN');
RESET ROLE; SELECT tst.as_user('service');
SELECT tst.raises('today has not ended', $$select run_night_audit('aaaaaaaa-0000-0000-0000-000000000001', current_date)$$, 'BUSINESS_DATE_OPEN');
SELECT tst.raises('future date', $$select run_night_audit('aaaaaaaa-0000-0000-0000-000000000001', current_date + 4)$$, 'BUSINESS_DATE_OPEN');
SELECT tst.eq('close yesterday', tst.val($$select run_night_audit('aaaaaaaa-0000-0000-0000-000000000001')->>'already_closed'$$), 'false');
SELECT tst.eq('second run is a no-op', tst.val($$select run_night_audit('aaaaaaaa-0000-0000-0000-000000000001')->>'already_closed'$$), 'true');
RESET ROLE;
SELECT tst.eq('yesterday''s no-show marked', (SELECT status FROM bookings WHERE id = 'd0000000-0000-0000-0000-000000000001'), 'no_show');
SELECT tst.eq('today''s arrival untouched', (SELECT status FROM bookings WHERE id = 'd0000000-0000-0000-0000-000000000002'), 'confirmed');
SELECT tst.eq('future arrival untouched', (SELECT status FROM bookings WHERE id = 'd0000000-0000-0000-0000-000000000003'), 'confirmed');
SELECT tst.eq('business date', (SELECT last_business_date::text FROM properties WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'), (current_date - 1)::text);
SELECT tst.as_user('adminA');
SELECT tst.eq('admin catches up an older day', tst.val($$select run_night_audit('aaaaaaaa-0000-0000-0000-000000000001', current_date - 5)->>'already_closed'$$), 'false');
RESET ROLE;
SELECT tst.eq('catch-up does not move the business date back', (SELECT last_business_date::text FROM properties WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'), (current_date - 1)::text);
ROLLBACK;

-- Stale stays cannot be checked in; check-out charges only its own stay.
BEGIN; SELECT tst.as_user('recA');
SELECT tst.mk('d1000000-0000-0000-0000-000000000001', '101', 'confirmed', -6, -3);
SELECT tst.raises('stay already over', $$select checkin_booking('d1000000-0000-0000-0000-000000000001')$$, 'STALE_STAY');
SELECT tst.mk('d1000000-0000-0000-0000-000000000002', '102', 'confirmed', -2, 3);
SELECT tst.mk('d1000000-0000-0000-0000-000000000003', '103', 'confirmed', -2, 3);
SELECT tst.ok('check in 2', $$select checkin_booking('d1000000-0000-0000-0000-000000000002')$$);
SELECT tst.ok('check in 3', $$select checkin_booking('d1000000-0000-0000-0000-000000000003')$$);
RESET ROLE; SELECT tst.as_user('mgrA');  -- the unpaid override is a manager's (00036)
SELECT tst.ok('early checkout of 2', $$select checkout_booking('d1000000-0000-0000-0000-000000000002', null, true)$$);
RESET ROLE; SELECT tst.as_user('recA');
SELECT tst.eq('2 charged two nights', tst.val($$select count(*) from folio_lines l join folios f on f.id = l.folio_id where f.booking_id = 'd1000000-0000-0000-0000-000000000002' and l.type = 'room'$$), '2');
SELECT tst.eq('3 not charged by 2''s checkout', tst.val($$select count(*) from folio_lines l join folios f on f.id = l.folio_id where f.booking_id = 'd1000000-0000-0000-0000-000000000003' and l.type = 'room'$$), '0');
SELECT tst.eq('one checkout clean for 102', tst.val($$select count(*) from housekeeping_tasks where apartment_id = 'aaaaaaaa-0000-0000-0001-000000000102' and type = 'checkout_clean'$$), '1');
RESET ROLE;
-- An automation already queued the clean for 103: checkout reuses it.
INSERT INTO housekeeping_tasks (property_id, apartment_id, type, status, priority, scheduled_date)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0001-000000000103', 'checkout_clean', 'pending', 'normal', current_date);
SELECT tst.raises('second open clean for the same unit and day',
  $$insert into housekeeping_tasks (property_id, apartment_id, type, status, priority, scheduled_date) values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0001-000000000103', 'checkout_clean', 'pending', 'normal', current_date)$$, 'uq_housekeeping_open_checkout_clean');
SELECT tst.as_user('mgrA');
SELECT tst.ok('checkout of 3 with a queued clean', $$select checkout_booking('d1000000-0000-0000-0000-000000000003', null, true)$$);
SELECT tst.eq('still one clean for 103', tst.val($$select count(*) from housekeeping_tasks where apartment_id = 'aaaaaaaa-0000-0000-0001-000000000103' and type = 'checkout_clean'$$), '1');
RESET ROLE;
-- A clean that is finished does not block the next one.
UPDATE housekeeping_tasks SET status = 'completed' WHERE apartment_id = 'aaaaaaaa-0000-0000-0001-000000000103';
SELECT tst.allowed('new clean after the last one completed',
  $$insert into housekeeping_tasks (property_id, apartment_id, type, status, priority, scheduled_date) values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0001-000000000103', 'checkout_clean', 'pending', 'normal', current_date)$$);
ROLLBACK;

-- Pricing: one decision per apartment type and day.
BEGIN;
INSERT INTO pricing_decisions (property_id, apartment_type_id, decision_date, base_rate_gbp, recommended_rate_gbp, adjustment_reason)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0002-000000000001', current_date, 100, 110, 'high_demand');
SELECT tst.raises('second decision same day',
  $$insert into pricing_decisions (property_id, apartment_type_id, decision_date, base_rate_gbp, recommended_rate_gbp, adjustment_reason) values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0002-000000000001', current_date, 100, 90, 'low_demand')$$, 'uq_pricing_decisions_type_day');
ROLLBACK;
