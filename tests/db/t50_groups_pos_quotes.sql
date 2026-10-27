-- Groups (deposits per room until the stay is covered), POS (idempotent,
-- whole quantities, managers for free text, housekeeping minibar), quotes
-- and rate-plan defaults.
\set ON_ERROR_STOP 1

-- Groups. Studio A: 700/week = 100/night; 2 nights + 14% VAT + 2 x 2 levy = 232 per room.
BEGIN; SELECT tst.as_user('recA');
SELECT tst.allowed('create group', $$insert into booking_groups(id, property_id, reference, name, check_in, check_out, status) values ('e0000000-0000-0000-000a-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'GRP-A', 'Wedding', current_date + 20, current_date + 22, 'confirmed')$$);
SELECT tst.raises('guest from another property', $$select add_group_rooms('e0000000-0000-0000-000a-000000000001', array['aaaaaaaa-0000-0000-0001-000000000101'::uuid], array['bbbbbbbb-0000-0000-0004-000000000001'::uuid])$$, 'PROPERTY_FORBIDDEN');
SELECT tst.eq('two rooms', tst.val($$select add_group_rooms('e0000000-0000-0000-000a-000000000001', array['aaaaaaaa-0000-0000-0001-000000000101'::uuid, 'aaaaaaaa-0000-0000-0001-000000000102'::uuid])->>'total_gbp'$$), '400.00');
SELECT tst.ok('deposit 1', $$select record_group_payment('e0000000-0000-0000-000a-000000000001', 100, 'bank_transfer')$$);
SELECT tst.ok('deposit 2', $$select record_group_payment('e0000000-0000-0000-000a-000000000001', 100, 'bank_transfer')$$);
SELECT tst.ok('deposit 3 (rooms still owe 264)', $$select record_group_payment('e0000000-0000-0000-000a-000000000001', 100, 'bank_transfer')$$);
SELECT tst.ok('balance 164', $$select record_group_payment('e0000000-0000-0000-000a-000000000001', 164, 'bank_transfer')$$);
SELECT tst.eq('paid in full', tst.val($$select group_statement('e0000000-0000-0000-000a-000000000001')->>'paid_gbp'$$), '464.00');
SELECT tst.raises('a penny too much', $$select record_group_payment('e0000000-0000-0000-000a-000000000001', 0.01, 'bank_transfer')$$, 'OVERPAYMENT');
SELECT tst.raises('sub-penny', $$select record_group_payment('e0000000-0000-0000-000a-000000000001', 0.004, 'bank_transfer')$$, 'INVALID_AMOUNT');
ROLLBACK;

-- POS
BEGIN;
INSERT INTO pos_outlets(id, property_id, code, name, type) VALUES ('e0000000-0000-0000-000c-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'BAR', 'Bar A', 'bar');
INSERT INTO pos_items(id, outlet_id, name, unit_price_gbp) VALUES ('e0000000-0000-0000-000e-000000000001', 'e0000000-0000-0000-000c-000000000001', 'Beer', 5);
SELECT tst.mk('e0000000-0000-0000-0000-000000000001', '103', 'confirmed', -1, 2);
SELECT tst.as_user('recA');
SELECT tst.ok('check in', $$select checkin_booking('e0000000-0000-0000-0000-000000000001')$$);
SELECT tst.eq('post ticket T1', tst.val($$select post_pos_ticket('e0000000-0000-0000-000c-000000000001', 'e0000000-0000-0000-0000-000000000001', '[{"item_id":"e0000000-0000-0000-000e-000000000001","quantity":2}]', 'T1')->>'total_gbp'$$), '11.40');
SELECT tst.eq('replayed T1 is not charged again', tst.val($$select post_pos_ticket('e0000000-0000-0000-000c-000000000001', 'e0000000-0000-0000-0000-000000000001', '[{"item_id":"e0000000-0000-0000-000e-000000000001","quantity":2}]', 'T1')->>'duplicate'$$), 'true');
SELECT tst.eq('one ticket T1', tst.n($$select 1 from pos_tickets where ticket_reference = 'T1'$$)::text, '1');
SELECT tst.raises('fractional quantity', $$select post_pos_ticket('e0000000-0000-0000-000c-000000000001', 'e0000000-0000-0000-0000-000000000001', '[{"item_id":"e0000000-0000-0000-000e-000000000001","quantity":0.001}]')$$, 'INVALID_AMOUNT');
SELECT tst.raises('receptionist free-text price', $$select post_pos_ticket('e0000000-0000-0000-000c-000000000001', 'e0000000-0000-0000-0000-000000000001', '[{"name":"Champagne","unit_price_gbp":0.01,"tax_rate_percent":0}]')$$, 'ROLE_FORBIDDEN');
SELECT tst.raises('insert ticket directly', $$insert into pos_tickets(property_id, outlet_id, booking_id, folio_id, items, subtotal_gbp, tax_gbp, total_gbp, business_date) select property_id, 'e0000000-0000-0000-000c-000000000001', booking_id, id, '[]', 0, 0, 0, current_date from folios$$, 'permission denied');
SELECT tst.raises('mark ticket voided directly', $$update pos_tickets set status = 'voided'$$, 'permission denied');
SELECT tst.raises('receptionist voids ticket', $$select void_pos_ticket(id, 'mistake') from pos_tickets where ticket_reference = 'T1'$$, 'ROLE_FORBIDDEN');
RESET ROLE; SELECT tst.as_user('hkA');
SELECT tst.ok('housekeeping posts minibar from the catalogue', $$select post_pos_ticket('e0000000-0000-0000-000c-000000000001', 'e0000000-0000-0000-0000-000000000001', '[{"item_id":"e0000000-0000-0000-000e-000000000001"}]', 'MB1')$$);
SELECT tst.raises('housekeeping free-text', $$select post_pos_ticket('e0000000-0000-0000-000c-000000000001', 'e0000000-0000-0000-0000-000000000001', '[{"name":"x","unit_price_gbp":3}]')$$, 'ROLE_FORBIDDEN');
RESET ROLE; SELECT tst.as_user('mgrA');
SELECT tst.raises('negative VAT on free text', $$select post_pos_ticket('e0000000-0000-0000-000c-000000000001', 'e0000000-0000-0000-0000-000000000001', '[{"name":"Spa","unit_price_gbp":30,"tax_rate_percent":-14}]')$$, 'INVALID_AMOUNT');
SELECT tst.eq('manager free text', tst.val($$select post_pos_ticket('e0000000-0000-0000-000c-000000000001', 'e0000000-0000-0000-0000-000000000001', '[{"name":"Spa","unit_price_gbp":30}]')->>'total_gbp'$$), '34.20');
SELECT tst.eq('manager voids T1', tst.val($$select void_pos_ticket(id, 'mistake')->>'lines_voided' from pos_tickets where ticket_reference = 'T1'$$), '1');
SELECT tst.raises('void twice', $$select void_pos_ticket(id, 'mistake') from pos_tickets where ticket_reference = 'T1'$$, 'ALREADY_VOIDED');
SELECT tst.eq('folio after void: minibar 5.70 + spa 34.20', tst.val($$select folio_balance(id) from folios where booking_id = 'e0000000-0000-0000-0000-000000000001'$$), '39.90');
ROLLBACK;

-- Quotes: a weekly rate sums exactly over seven nights.
SELECT tst.eq('7 nights at 1000/week', (quote_stay('bbbbbbbb-0000-0000-0002-000000000001', current_date + 30, current_date + 37)->>'total_gbp'), '1000.00');

-- Rate plans: one default even when a statement sets many.
BEGIN;
INSERT INTO rate_plans(property_id, code, name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'NRF', 'Non-refundable');
UPDATE rate_plans SET is_default = true WHERE property_id = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT tst.eq('single default after a multi-row update', (SELECT count(*) FROM rate_plans WHERE property_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND is_default)::text, '1');
INSERT INTO rate_plans(property_id, code, name, is_default) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'PROMO', 'Promo', true);
SELECT tst.eq('new default replaces the old', (SELECT code FROM rate_plans WHERE property_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND is_default), 'PROMO');
ROLLBACK;

-- New properties get a BAR plan and the chart of accounts.
BEGIN;
INSERT INTO properties(id, name, slug, address, email) VALUES ('ffffffff-0000-0000-0000-000000000001', 'Prop C', 'prop-c', 'x', 'c@x.test');
SELECT tst.eq('BAR plan', (SELECT code || ':' || is_default FROM rate_plans WHERE property_id = 'ffffffff-0000-0000-0000-000000000001'), 'BAR:true');
SELECT tst.eq('GL accounts', (SELECT count(*) FROM gl_accounts WHERE property_id = 'ffffffff-0000-0000-0000-000000000001')::text, '11');
ROLLBACK;
