-- Review fixes (00036): early departures, checkout override, honest actors,
-- refunds after re-issue, contract = posted charges, audit property, event
-- replays, duplicate merging, and the write policies routes rely on.
\set ON_ERROR_STOP 1

-- 1. An early departure is not charged again by the night audit.
BEGIN; SELECT tst.as_user('recA');
SELECT tst.mk('e1000000-0000-0000-0000-000000000001', '101', 'confirmed', -2, 2);
SELECT tst.ok('check in', $$select checkin_booking('e1000000-0000-0000-0000-000000000001')$$);
SELECT tst.ok('post nights so far', $$select post_booking_room_charges('e1000000-0000-0000-0000-000000000001')$$);
SELECT tst.ok('pay the two nights', $$select record_folio_payment((select id from folios where booking_id = 'e1000000-0000-0000-0000-000000000001'), 232, 'card')$$);
SELECT tst.eq('leaves early with nothing owed', tst.val($$select checkout_booking('e1000000-0000-0000-0000-000000000001')->>'outstanding_gbp'$$), '0.00');
RESET ROLE;
SELECT tst.eq('tonight''s audit posts nothing for the departed stay',
  post_room_charges('aaaaaaaa-0000-0000-0000-000000000001', current_date, 'night_audit', 'e1000000-0000-0000-0000-000000000001')::text, '0');
SELECT tst.eq('balance still zero', (SELECT folio_balance(id)::text FROM folios WHERE booking_id = 'e1000000-0000-0000-0000-000000000001'), '0.00');
ROLLBACK;

-- 2. The unpaid override needs a manager; actors and the points rate are
--    the server's, not the caller's.
BEGIN; SELECT tst.as_user('recA');
SELECT tst.mk('e2000000-0000-0000-0000-000000000001', '102', 'confirmed', -2, 1);
SELECT tst.ok('check in', $$select checkin_booking('e2000000-0000-0000-0000-000000000001')$$);
SELECT tst.raises('receptionist cannot skip the balance',
  $$select checkout_booking('e2000000-0000-0000-0000-000000000001', null, true)$$, 'ROLE_FORBIDDEN');
SELECT tst.ok('pay 100 naming someone else', format($$select record_folio_payment((select id from folios where booking_id = 'e2000000-0000-0000-0000-000000000001'), 100, 'cash', null, 'GBP', null, null, %L, null, 'forged actor')$$,
  (SELECT id FROM staff WHERE auth_user_id = tst.id('mgrA'))));
RESET ROLE;
SELECT tst.eq('payment received by the caller', (SELECT s.email FROM payments p JOIN staff s ON s.id = p.received_by
  WHERE p.folio_id = (SELECT id FROM folios WHERE booking_id = 'e2000000-0000-0000-0000-000000000001')), 'recA@staff.test');
SELECT tst.eq('ledger line posted by the caller', (SELECT posted_by FROM folio_lines
  WHERE type = 'payment' AND folio_id = (SELECT id FROM folios WHERE booking_id = 'e2000000-0000-0000-0000-000000000001')), 'recA@staff.test');
SELECT tst.as_user('mgrA');
SELECT tst.eq('manager may check out with a balance, points at the house rate',
  tst.val($$select checkout_booking('e2000000-0000-0000-0000-000000000001', null, true, 1000)->>'points_earned'$$), '3000');
ROLLBACK;

-- 3. A refund after the folio invoice was re-issued updates the current invoice.
BEGIN; SELECT tst.as_user('recA');
SELECT tst.mk('e3000000-0000-0000-0000-000000000001', '103', 'confirmed', -2, 1);
SELECT tst.ok('check in', $$select checkin_booking('e3000000-0000-0000-0000-000000000001')$$);
SELECT tst.ok('post', $$select post_booking_room_charges('e3000000-0000-0000-0000-000000000001')$$);
SELECT tst.ok('invoice 1', $$select issue_folio_invoice((select id from folios where booking_id = 'e3000000-0000-0000-0000-000000000001'))$$);
SELECT tst.ok('pay 232', $$select record_folio_payment((select id from folios where booking_id = 'e3000000-0000-0000-0000-000000000001'), 232, 'card')$$);
SELECT tst.ok('minibar', $$select post_folio_charge((select id from folios where booking_id = 'e3000000-0000-0000-0000-000000000001'), 'extra', 'Minibar', 1, 10)$$);
SELECT tst.ok('invoice 2', $$select issue_folio_invoice((select id from folios where booking_id = 'e3000000-0000-0000-0000-000000000001'))$$);
SELECT tst.ok('pay the minibar', $$select record_folio_payment((select id from folios where booking_id = 'e3000000-0000-0000-0000-000000000001'), 11.40, 'card')$$);
SELECT tst.eq('current invoice paid', tst.val($$select i.status from invoices i join folios f on f.invoice_id = i.id where f.booking_id = 'e3000000-0000-0000-0000-000000000001'$$), 'paid');
RESET ROLE; SELECT tst.as_user('mgrA');
SELECT tst.ok('refund 100 of the first payment', $$select refund_payment((select id from payments where amount_gbp = 232 and folio_id = (select id from folios where booking_id = 'e3000000-0000-0000-0000-000000000001')), 100, 'goodwill')$$);
SELECT tst.eq('current invoice now partially paid', tst.val($$select i.status from invoices i join folios f on f.invoice_id = i.id where f.booking_id = 'e3000000-0000-0000-0000-000000000001'$$), 'partially_paid');
ROLLBACK;

-- 4. The contract is what the nights post: a fully prepaid stay closes at 0.00.
BEGIN;
UPDATE apartment_types SET base_weekly_rate_gbp = 1000 WHERE id = 'aaaaaaaa-0000-0000-0002-000000000001';
INSERT INTO rate_plans (id, property_id, code, name, pricing_mode, adjustment, is_active)
VALUES ('e4000000-0000-0000-0000-0000000000aa', 'aaaaaaaa-0000-0000-0000-000000000001', 'NR10', 'Non-refundable', 'percent_off', 10, true);
-- Fixture stays inserted as the owner (confirmed, and c at a hand-made
-- price); the receptionist then checks in, prepays and checks out.
-- (a) weekly rate 1000 over 7 nights; (b) the same with a 10% plan; (c) 40.30 x 7 less a 5% length-of-stay discount; (d) 33.33 x 3
SELECT tst.allowed('book a', $$insert into bookings(id,property_id,apartment_id,guest_id,channel_id,reference,status,check_in,check_out,rate_per_night_gbp,discount_percentage,total_amount_gbp)
  select 'e4000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0001-000000000101','aaaaaaaa-0000-0000-0004-000000000001','cccccccc-0000-0000-0000-000000000001','E4A','confirmed',current_date,current_date+7,
         (q->>'rate_per_night_gbp')::numeric,(q->>'discount_percentage')::numeric,(q->>'total_gbp')::numeric
    from (select quote_stay('aaaaaaaa-0000-0000-0002-000000000001', current_date, current_date+7) q) s$$);
SELECT tst.allowed('book b', $$insert into bookings(id,property_id,apartment_id,guest_id,channel_id,reference,status,check_in,check_out,rate_per_night_gbp,discount_percentage,total_amount_gbp)
  select 'e4000000-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0001-000000000102','aaaaaaaa-0000-0000-0004-000000000001','cccccccc-0000-0000-0000-000000000001','E4B','confirmed',current_date,current_date+7,
         (q->>'rate_per_night_gbp')::numeric,(q->>'discount_percentage')::numeric,(q->>'total_gbp')::numeric
    from (select quote_stay('aaaaaaaa-0000-0000-0002-000000000001', current_date, current_date+7, 'e4000000-0000-0000-0000-0000000000aa') q) s$$);
SELECT tst.allowed('book c', $$insert into bookings(id,property_id,apartment_id,guest_id,channel_id,reference,status,check_in,check_out,rate_per_night_gbp,discount_percentage,total_amount_gbp)
  values ('e4000000-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0001-000000000103','aaaaaaaa-0000-0000-0004-000000000001','cccccccc-0000-0000-0000-000000000001','E4C','confirmed',current_date,current_date+7,40.30,5,268.00)$$);
SELECT tst.as_user('recA');
SELECT tst.eq('quote a total', (SELECT total_amount_gbp::text FROM bookings WHERE id = 'e4000000-0000-0000-0000-000000000001'), '1000.00');
SELECT tst.eq('quote b total', (SELECT total_amount_gbp::text FROM bookings WHERE id = 'e4000000-0000-0000-0000-000000000002'), '900.00');
SELECT tst.ok('check in a', $$select checkin_booking('e4000000-0000-0000-0000-000000000001')$$);
SELECT tst.ok('check in b', $$select checkin_booking('e4000000-0000-0000-0000-000000000002')$$);
SELECT tst.ok('check in c', $$select checkin_booking('e4000000-0000-0000-0000-000000000003')$$);
SELECT tst.ok('prepay a', $$select record_folio_payment((select id from folios where booking_id = 'e4000000-0000-0000-0000-000000000001'), booking_contract_gross('e4000000-0000-0000-0000-000000000001'), 'card')$$);
SELECT tst.ok('prepay b', $$select record_folio_payment((select id from folios where booking_id = 'e4000000-0000-0000-0000-000000000002'), booking_contract_gross('e4000000-0000-0000-0000-000000000002'), 'card')$$);
SELECT tst.ok('prepay c', $$select record_folio_payment((select id from folios where booking_id = 'e4000000-0000-0000-0000-000000000003'), booking_contract_gross('e4000000-0000-0000-0000-000000000003'), 'card')$$);
RESET ROLE;
-- seven night audits
SELECT sum(post_room_charges('aaaaaaaa-0000-0000-0000-000000000001', d::date, 'night_audit')) FROM generate_series(current_date, current_date + 6, '1 day') d;
SELECT tst.eq('a: rooms add up to the booked total', (SELECT sum(l.debit_gbp)::text FROM folio_lines l JOIN folios f ON f.id = l.folio_id WHERE f.booking_id = 'e4000000-0000-0000-0000-000000000001' AND l.type = 'room'), '1000.00');
SELECT tst.eq('b: the plan discount is applied once', (SELECT sum(l.debit_gbp)::text FROM folio_lines l JOIN folios f ON f.id = l.folio_id WHERE f.booking_id = 'e4000000-0000-0000-0000-000000000002' AND l.type = 'room'), '900.00');
SELECT tst.eq('c: rooms add up to the discounted total', (SELECT sum(l.debit_gbp)::text FROM folio_lines l JOIN folios f ON f.id = l.folio_id WHERE f.booking_id = 'e4000000-0000-0000-0000-000000000003' AND l.type = 'room'), '268.00');
SELECT tst.eq('a: prepaid stay owes nothing', (SELECT folio_balance(id)::text FROM folios WHERE booking_id = 'e4000000-0000-0000-0000-000000000001'), '0.00');
SELECT tst.eq('b: prepaid stay owes nothing', (SELECT folio_balance(id)::text FROM folios WHERE booking_id = 'e4000000-0000-0000-0000-000000000002'), '0.00');
SELECT tst.eq('c: prepaid stay owes nothing', (SELECT folio_balance(id)::text FROM folios WHERE booking_id = 'e4000000-0000-0000-0000-000000000003'), '0.00');
SELECT tst.eq('revenue by stay date matches the folio', (SELECT sum(room_revenue_gbp)::text FROM revenue_by_stay_date('aaaaaaaa-0000-0000-0000-000000000001', current_date, current_date + 6)), '2168.00');
SELECT tst.as_user('recA');
SELECT tst.eq('a checks out without an override', tst.val($$select checkout_booking('e4000000-0000-0000-0000-000000000001')->>'outstanding_gbp'$$), '0.00');
ROLLBACK;

BEGIN; SELECT tst.as_user('recA');
SELECT tst.mk('e4100000-0000-0000-0000-000000000001', '101', 'confirmed', 0, 3, 33.33);
SELECT tst.ok('check in', $$select checkin_booking('e4100000-0000-0000-0000-000000000001')$$);
SELECT tst.ok('prepay', $$select record_folio_payment((select id from folios where booking_id = 'e4100000-0000-0000-0000-000000000001'), booking_contract_gross('e4100000-0000-0000-0000-000000000001'), 'card')$$);
RESET ROLE;
SELECT sum(post_room_charges('aaaaaaaa-0000-0000-0000-000000000001', d::date, 'night_audit')) FROM generate_series(current_date, current_date + 2, '1 day') d;
SELECT tst.eq('33.33 x 3 prepaid owes nothing', (SELECT folio_balance(id)::text FROM folios WHERE booking_id = 'e4100000-0000-0000-0000-000000000001'), '0.00');
ROLLBACK;

-- 5. Audit rows written by the service role carry the actor's property.
BEGIN; SELECT tst.as_user('service');
INSERT INTO audit_log(user_id, user_email, action, category, description)
VALUES ('00000000-0000-0000-0000-0000000000a2', 'adminA@x', 'admin.user.create', 'settings', 'created');
RESET ROLE;
SELECT tst.eq('property from the actor', (SELECT property_id::text FROM audit_log WHERE action = 'admin.user.create'), 'aaaaaaaa-0000-0000-0000-000000000001');
SELECT tst.as_user('adminA');
SELECT tst.eq('admin sees it', tst.n($$select id from audit_log where action = 'admin.user.create'$$)::text, '1');
RESET ROLE; SELECT tst.as_user('adminB');
SELECT tst.eq('other property does not', tst.n($$select id from audit_log where action = 'admin.user.create'$$)::text, '0');
ROLLBACK;

-- 6. Event replays find the event id without exposing the row.
BEGIN; SELECT tst.as_user('recA');
SELECT tst.allowed('emit', $$insert into system_events(type, source_system, payload, processed, results, idempotency_key, property_id)
  values ('booking.checked_in', 'test', '{}', false, '[]', 'e6-key', 'aaaaaaaa-0000-0000-0000-000000000001')$$);
RESET ROLE; SELECT tst.as_user('hkA');
SELECT tst.eq('row hidden from another user', tst.n($$select id from system_events where idempotency_key = 'e6-key'$$)::text, '0');
SELECT tst.eq('id found for the same property', tst.val($$select (system_event_id_by_key('e6-key') is not null)::text$$), 'true');
RESET ROLE; SELECT tst.as_user('recB');
SELECT tst.eq('not for another property', tst.val($$select system_event_id_by_key('e6-key')::text$$), '<null>');
ROLLBACK;

-- 7. Duplicates are merged so the protection indexes always exist.
BEGIN;
DROP INDEX uq_housekeeping_open_checkout_clean;
DROP INDEX uq_pos_tickets_reference;
INSERT INTO housekeeping_tasks (id, property_id, apartment_id, type, status, priority, scheduled_date, started_at, created_at) VALUES
 ('e7000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0001-000000000101', 'checkout_clean', 'pending', 'normal', current_date, NULL, now() - interval '3 hours'),
 ('e7000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0001-000000000101', 'checkout_clean', 'in_progress', 'normal', current_date, now() - interval '1 hour', now() - interval '2 hours'),
 ('e7000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0001-000000000101', 'checkout_clean', 'in_progress', 'normal', current_date, now() - interval '30 minutes', now() - interval '1 hour');
INSERT INTO pos_tickets (id, property_id, outlet_id, booking_id, folio_id, ticket_reference, items, subtotal_gbp, tax_gbp, total_gbp, business_date, created_at)
SELECT ('e7100000-0000-0000-0000-00000000000' || n)::uuid, 'bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-000c-000000000001',
       'bbbbbbbb-0000-0000-0005-000000000001', 'bbbbbbbb-0000-0000-0006-000000000001', 'T-1', '[]', 0, 0, 0, current_date, now() - make_interval(mins => 10 - n)
  FROM generate_series(1, 3) n;
\ir ../../supabase/migrations/00036_review_fixes.sql
SELECT tst.eq('clean index exists', (SELECT count(*)::text FROM pg_indexes WHERE indexname = 'uq_housekeeping_open_checkout_clean'), '1');
SELECT tst.eq('pos index exists', (SELECT count(*)::text FROM pg_indexes WHERE indexname = 'uq_pos_tickets_reference'), '1');
SELECT tst.eq('untouched copy removed', (SELECT count(*)::text FROM housekeeping_tasks WHERE id = 'e7000000-0000-0000-0000-000000000001'), '0');
SELECT tst.eq('first started clean kept open', (SELECT status FROM housekeeping_tasks WHERE id = 'e7000000-0000-0000-0000-000000000002'), 'in_progress');
SELECT tst.eq('later started copy closed as duplicate', (SELECT status FROM housekeeping_tasks WHERE id = 'e7000000-0000-0000-0000-000000000003'), 'completed');
SELECT tst.eq('pos references', (SELECT string_agg(ticket_reference, ',' ORDER BY created_at) FROM pos_tickets WHERE id::text LIKE 'e7100000%'), 'T-1,T-1-dup-1,T-1-dup-2');
ROLLBACK;

-- 8. Write policies for staff, properties, currency rates and pricing decisions.
BEGIN; SELECT tst.as_user('adminA');
SELECT tst.allowed('admin adds a receptionist', $$insert into staff(property_id, first_name, last_name, email, role, is_active) values ('aaaaaaaa-0000-0000-0000-000000000001', 'New', 'Rec', 'new.rec@staff.test', 'receptionist', true)$$);
SELECT tst.denied('admin cannot add an admin', $$insert into staff(property_id, first_name, last_name, email, role, is_active) values ('aaaaaaaa-0000-0000-0000-000000000001', 'New', 'Adm', 'new.adm@staff.test', 'admin', true)$$);
SELECT tst.denied('admin cannot add staff to another property', $$insert into staff(property_id, first_name, last_name, email, role, is_active) values ('bbbbbbbb-0000-0000-0000-000000000001', 'New', 'B', 'new.b@staff.test', 'receptionist', true)$$);
SELECT tst.denied('admin cannot link a login', format($$insert into staff(property_id, auth_user_id, first_name, last_name, email, role, is_active) values ('aaaaaaaa-0000-0000-0000-000000000001', %L, 'G', 'A', 'g.a@staff.test', 'readonly', true)$$, tst.id('guestA')));
SELECT tst.allowed('admin edits a receptionist', $$update staff set phone = '+20 100' where email = 'recA@staff.test'$$);
SELECT tst.allowed('admin promotes a receptionist to manager', $$update staff set role = 'manager' where email = 'recA@staff.test'$$);
SELECT tst.denied('admin cannot promote to admin', $$update staff set role = 'admin' where email = 'hkA@staff.test'$$);
SELECT tst.denied('admin cannot edit the owner', $$update staff set phone = '1' where email = 'ownerA@staff.test'$$);
SELECT tst.denied('admin cannot edit another property''s staff', $$update staff set phone = '1' where email = 'recB@staff.test'$$);
SELECT tst.allowed('admin edits own profile', $$update staff set phone = '+20 200' where email = 'adminA@staff.test'$$);
SELECT tst.raises('admin cannot change own role', $$update staff set role = 'owner' where email = 'adminA@staff.test'$$, 'ROLE_FORBIDDEN');
SELECT tst.raises('admin cannot deactivate self', $$update staff set is_active = false where email = 'adminA@staff.test'$$, 'ROLE_FORBIDDEN');
SELECT tst.raises('admin cannot relink a login', $$update staff set auth_user_id = null where email = 'hkA@staff.test'$$, 'ROLE_FORBIDDEN');
SELECT tst.allowed('admin edits own property', $$update properties set phone = '+20 65' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$);
SELECT tst.denied('admin cannot edit another property', $$update properties set phone = '1' where id = 'bbbbbbbb-0000-0000-0000-000000000001'$$);
SELECT tst.denied('admin cannot add currency rates', $$insert into currency_rates(base_currency, target_currency, rate, source) values ('GBP', 'EGP', 60, 'manual')$$);
SELECT tst.allowed('admin records a pricing decision', $$insert into pricing_decisions(property_id, apartment_type_id, decision_date, base_rate_gbp, recommended_rate_gbp, adjustment_reason) values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0002-000000000001', current_date, 700, 770, 'high_demand')$$);
SELECT tst.denied('not for another property', $$insert into pricing_decisions(property_id, apartment_type_id, decision_date, base_rate_gbp, recommended_rate_gbp, adjustment_reason) values ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0002-000000000001', current_date, 1000, 1100, 'high_demand')$$);
RESET ROLE; SELECT tst.as_user('mgrA');
SELECT tst.denied('manager cannot edit staff', $$update staff set phone = '1' where email = 'hkA@staff.test'$$);
SELECT tst.denied('manager cannot add staff', $$insert into staff(property_id, first_name, last_name, email, role, is_active) values ('aaaaaaaa-0000-0000-0000-000000000001', 'M', 'X', 'm.x@staff.test', 'readonly', true)$$);
SELECT tst.denied('manager cannot edit the property', $$update properties set phone = '1' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$);
SELECT tst.denied('manager cannot record pricing decisions', $$insert into pricing_decisions(property_id, apartment_type_id, decision_date, base_rate_gbp, recommended_rate_gbp, adjustment_reason) values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0002-000000000001', current_date + 1, 700, 770, 'high_demand')$$);
RESET ROLE; SELECT tst.as_user('ownerA');
SELECT tst.allowed('owner adds a currency rate', $$insert into currency_rates(base_currency, target_currency, rate, source) values ('GBP', 'EGP', 60, 'manual')$$);
SELECT tst.allowed('owner promotes to admin', $$update staff set role = 'admin' where email = 'mgrA@staff.test'$$);
ROLLBACK;
