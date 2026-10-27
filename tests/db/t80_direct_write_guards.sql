-- Direct writes through PostgREST cannot skip the booking state machine,
-- the quoted price, invoice totals, loyalty or group rules (00036 section
-- 8), admins cannot change VAT, levy or the business date (00036 section
-- 7), the duplicate-clean merge keeps worked-on tasks, and revenue stops at
-- an early departure.
\set ON_ERROR_STOP 1

-- ------------------------------------------------------------
-- Bookings
-- ------------------------------------------------------------
BEGIN;
SELECT tst.mk('f1000000-0000-0000-0000-000000000001', '101', 'confirmed', 0, 3);
SELECT tst.as_user('recA');
SELECT tst.ok('check in', $$select checkin_booking('f1000000-0000-0000-0000-000000000001')$$);
SELECT tst.raises('check out by UPDATE', $$update bookings set status = 'checked_out', checked_out_at = now() where id = 'f1000000-0000-0000-0000-000000000001'$$, 'INVALID_STATUS');
SELECT tst.raises('rewrite the price mid-stay', $$update bookings set total_amount_gbp = 0.03, rate_per_night_gbp = 0.01 where id = 'f1000000-0000-0000-0000-000000000001'$$, 'BOOKING_IMMUTABLE');
SELECT tst.raises('move the dates', $$update bookings set check_out = current_date + 1 where id = 'f1000000-0000-0000-0000-000000000001'$$, 'BOOKING_IMMUTABLE');
SELECT tst.raises('move the room', $$update bookings set apartment_id = 'aaaaaaaa-0000-0000-0001-000000000102' where id = 'f1000000-0000-0000-0000-000000000001'$$, 'BOOKING_IMMUTABLE');
SELECT tst.raises('cancel an in-house stay', $$update bookings set status = 'cancelled' where id = 'f1000000-0000-0000-0000-000000000001'$$, 'INVALID_STATUS');
SELECT tst.raises('delete a booking', $$delete from bookings where id = 'f1000000-0000-0000-0000-000000000001'$$, 'BOOKING_IMMUTABLE');
SELECT tst.allowed('notes and party size (PATCH)', $$update bookings set internal_notes = 'late arrival', adults = 2, special_requests = 'cot' where id = 'f1000000-0000-0000-0000-000000000001'$$);
SELECT tst.raises('unpaid check-out still refused', $$select checkout_booking('f1000000-0000-0000-0000-000000000001')$$, 'OUTSTANDING_BALANCE');
SELECT tst.eq('still in house', tst.val($$select status from bookings where id = 'f1000000-0000-0000-0000-000000000001'$$), 'checked_in');

-- New bookings: pending, at the quoted price, in this property
SELECT tst.eq('book at the quote', tst.book('f1000000-0000-0000-0000-000000000002', '102', 5, 7), 'OK rows=1');
SELECT tst.raises('book at a made-up price', $$insert into bookings(property_id,apartment_id,guest_id,channel_id,reference,status,check_in,check_out,rate_per_night_gbp,total_amount_gbp)
  values ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0001-000000000103','aaaaaaaa-0000-0000-0004-000000000001','cccccccc-0000-0000-0000-000000000001','F1X','pending',current_date+10,current_date+12,0.01,0.02)$$, 'PRICE_MISMATCH');
SELECT tst.raises('book straight in house', $$insert into bookings(property_id,apartment_id,channel_id,reference,status,check_in,check_out,rate_per_night_gbp,total_amount_gbp)
  values ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0001-000000000103','cccccccc-0000-0000-0000-000000000001','F1Y','checked_in',current_date,current_date+2,100,200)$$, 'INVALID_STATUS');
SELECT tst.raises('book with another property''s guest', $$insert into bookings(property_id,apartment_id,guest_id,channel_id,reference,status,check_in,check_out,rate_per_night_gbp,total_amount_gbp)
  values ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0001-000000000103','bbbbbbbb-0000-0000-0004-000000000001','cccccccc-0000-0000-0000-000000000001','F1Z','pending',current_date+10,current_date+12,100,200)$$, 'PROPERTY_FORBIDDEN');
SELECT tst.allowed('confirm (PATCH)', $$update bookings set status = 'confirmed' where id = 'f1000000-0000-0000-0000-000000000002'$$);
SELECT tst.raises('no-show by UPDATE', $$update bookings set status = 'no_show' where id = 'f1000000-0000-0000-0000-000000000002'$$, 'INVALID_STATUS');
SELECT tst.allowed('cancel (cancel route)', $$update bookings set status = 'cancelled', cancelled_at = now(), cancellation_reason = 'changed plans' where id = 'f1000000-0000-0000-0000-000000000002'$$);
SELECT tst.raises('un-cancel', $$update bookings set status = 'confirmed' where id = 'f1000000-0000-0000-0000-000000000002'$$, 'INVALID_STATUS');
ROLLBACK;

-- ------------------------------------------------------------
-- Invoices
-- ------------------------------------------------------------
BEGIN; SELECT tst.as_user('recA');
SELECT tst.raises('raise a paid invoice', $$insert into invoices(property_id, invoice_number, status, subtotal_gbp, total_gbp, due_date) values ('aaaaaaaa-0000-0000-0000-000000000001', 'INV-F1', 'paid', 100, 100, current_date)$$, 'INVALID_STATUS');
SELECT tst.allowed('draft with made-up totals', $$insert into invoices(id, property_id, invoice_number, status, subtotal_gbp, tax_amount_gbp, total_gbp, due_date, line_items, tax_rate_percent)
  values ('f2000000-0000-0000-0008-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'INV-F2', 'draft', 1, 0, 1, current_date, '[{"description":"Spa","quantity":2,"unit_price_gbp":58.75},{"description":"Tea","quantity":1.5,"unit_price_gbp":0.15}]', 14)$$);
SELECT tst.eq('totals are what the lines add up to', tst.val($$select subtotal_gbp || '/' || tax_amount_gbp || '/' || total_gbp || '/' || (line_items->1->>'total_gbp') from invoices where id = 'f2000000-0000-0000-0008-000000000001'$$), '117.73/16.48/134.21/0.23');
SELECT tst.allowed('edit the draft lines (PATCH)', $$update invoices set line_items = '[{"description":"Spa","quantity":1,"unit_price_gbp":100}]' where id = 'f2000000-0000-0000-0008-000000000001'$$);
SELECT tst.eq('re-totalled at the stored rate', tst.val($$select subtotal_gbp || '/' || tax_amount_gbp || '/' || total_gbp from invoices where id = 'f2000000-0000-0000-0008-000000000001'$$), '100.00/14.00/114.00');
SELECT tst.raises('mark it paid', $$update invoices set status = 'paid', paid_at = now() where id = 'f2000000-0000-0000-0008-000000000001'$$, 'INVALID_STATUS');
SELECT tst.raises('a discount nobody approved', $$update invoices set discount_amount_gbp = 50 where id = 'f2000000-0000-0000-0008-000000000001'$$, 'INVOICE_IMMUTABLE');
SELECT tst.allowed('send it', $$update invoices set status = 'sent', sent_at = now() where id = 'f2000000-0000-0000-0008-000000000001'$$);
SELECT tst.raises('mark the sent invoice paid', $$update invoices set status = 'paid' where id = 'f2000000-0000-0000-0008-000000000001'$$, 'INVOICE_IMMUTABLE');
SELECT tst.eq('a payment pays it', tst.val($$select record_invoice_payment('f2000000-0000-0000-0008-000000000001', 114, 'card')->>'invoice_status'$$), 'paid');
ROLLBACK;

-- ------------------------------------------------------------
-- Guests
-- ------------------------------------------------------------
BEGIN; SELECT tst.as_user('recA');
SELECT tst.raises('award loyalty points', $$update guests set loyalty_points = 50000, loyalty_tier = 'platinum' where id = 'aaaaaaaa-0000-0000-0004-000000000001'$$, 'ROLE_FORBIDDEN');
SELECT tst.raises('link a login to a guest', $$update guests set auth_user_id = '00000000-0000-0000-0000-0000000000c9' where id = 'aaaaaaaa-0000-0000-0004-000000000001'$$, 'ROLE_FORBIDDEN');
SELECT tst.allowed('edit contact details (PUT)', $$update guests set phone = '+20 100 000 0000', vip_status = true where id = 'aaaaaaaa-0000-0000-0004-000000000001'$$);
SELECT tst.allowed('new guest', $$insert into guests(id, property_id, first_name, last_name, loyalty_points, loyalty_tier, total_spend_gbp) values ('f3000000-0000-0000-0004-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'New', 'Guest', 99999, 'platinum', 1000000)$$);
SELECT tst.eq('starts with no loyalty', tst.val($$select loyalty_tier || '/' || loyalty_points || '/' || total_spend_gbp from guests where id = 'f3000000-0000-0000-0004-000000000001'$$), 'bronze/0/0.00');
ROLLBACK;

-- ------------------------------------------------------------
-- Groups
-- ------------------------------------------------------------
BEGIN; SELECT tst.as_user('recA');
SELECT tst.allowed('create group', $$insert into booking_groups(id, property_id, reference, name, check_in, check_out, status) values ('f4000000-0000-0000-000a-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'GRP-F', 'Conference', current_date + 30, current_date + 32, 'confirmed')$$);
SELECT tst.ok('block two rooms', $$select add_group_rooms('f4000000-0000-0000-000a-000000000001', array['aaaaaaaa-0000-0000-0001-000000000101'::uuid, 'aaaaaaaa-0000-0000-0001-000000000102'::uuid])$$);
SELECT tst.eq('rooms confirmed with the group', tst.val($$select string_agg(distinct status, ',') from bookings where group_id = 'f4000000-0000-0000-000a-000000000001'$$), 'confirmed');
SELECT tst.raises('move dates with rooms blocked', $$update booking_groups set check_out = current_date + 33 where id = 'f4000000-0000-0000-000a-000000000001'$$, 'ROOMS_BLOCKED');
SELECT tst.raises('cancel by UPDATE, leaving rooms sold', $$update booking_groups set status = 'cancelled' where id = 'f4000000-0000-0000-000a-000000000001'$$, 'INVALID_STATUS');
SELECT tst.raises('delete a group with rooms', $$delete from booking_groups where id = 'f4000000-0000-0000-000a-000000000001'$$, 'ROOMS_BLOCKED');
SELECT tst.eq('cancel_group cancels rooms and group', tst.val($$select cancel_group('f4000000-0000-0000-000a-000000000001', 'event moved')->>'rooms_cancelled'$$), '2');
SELECT tst.eq('group cancelled', tst.val($$select status from booking_groups where id = 'f4000000-0000-0000-000a-000000000001'$$), 'cancelled');
SELECT tst.raises('revive a cancelled group', $$update booking_groups set status = 'confirmed' where id = 'f4000000-0000-0000-000a-000000000001'$$, 'INVALID_STATUS');
ROLLBACK;

-- ------------------------------------------------------------
-- Properties: the settings an admin may edit
-- ------------------------------------------------------------
BEGIN; SELECT tst.as_user('adminA');
SELECT tst.raises('zero the VAT', $$update properties set vat_rate_percent = 0 where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'permission denied');
SELECT tst.raises('zero the levy', $$update properties set tourism_levy_per_night_gbp = 0 where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'permission denied');
SELECT tst.raises('rewind the business date', $$update properties set last_business_date = '2000-01-01' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'permission denied');
SELECT tst.allowed('rename the property (PUT)', $$update properties set name = 'Prop A Hurghada', phone = '+20 65 000' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$);
RESET ROLE;
SELECT tst.eq('VAT unchanged', (SELECT vat_rate_percent::text FROM properties WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'), '14.00');
ROLLBACK;

-- ------------------------------------------------------------
-- Staff move: the old automatic home membership goes, explicit grants stay
-- ------------------------------------------------------------
BEGIN;
INSERT INTO staff_properties (staff_id, property_id, granted_by)
SELECT s.id, 'bbbbbbbb-0000-0000-0000-000000000001', (SELECT id FROM staff WHERE first_name = 'ownerA')
  FROM staff s WHERE s.first_name = 'mgrA';
UPDATE staff SET property_id = 'bbbbbbbb-0000-0000-0000-000000000001' WHERE first_name = 'recA';
UPDATE staff SET property_id = 'bbbbbbbb-0000-0000-0000-000000000001' WHERE first_name = 'mgrA';
UPDATE staff SET property_id = 'aaaaaaaa-0000-0000-0000-000000000001' WHERE first_name = 'mgrA';
SELECT tst.eq('moved receptionist: new home only',
  (SELECT string_agg(p.name, ',' ORDER BY p.name) FROM staff_properties sp JOIN properties p ON p.id = sp.property_id JOIN staff s ON s.id = sp.staff_id WHERE s.first_name = 'recA'), 'Prop B');
SELECT tst.eq('explicit grant survives a move back',
  (SELECT string_agg(p.name, ',' ORDER BY p.name) FROM staff_properties sp JOIN properties p ON p.id = sp.property_id JOIN staff s ON s.id = sp.staff_id WHERE s.first_name = 'mgrA'), 'Prop A,Prop B');
ROLLBACK;

-- ------------------------------------------------------------
-- Revenue by stay date stops at an early departure
-- ------------------------------------------------------------
BEGIN;
SELECT tst.mk('f5000000-0000-0000-0000-000000000001', '103', 'checked_out', -1, 4);
UPDATE bookings SET checked_in_at = now() - interval '1 day', checked_out_at = now() WHERE id = 'f5000000-0000-0000-0000-000000000001';
SELECT tst.eq('only the night stayed is revenue',
  (SELECT string_agg(room_nights || ':' || room_revenue_gbp, ',' ORDER BY stay_date)
     FROM revenue_by_stay_date('aaaaaaaa-0000-0000-0000-000000000001', current_date - 1, current_date + 3)),
  '1:100.00,0:0.00,0:0.00,0:0.00,0:0.00');
ROLLBACK;

-- ------------------------------------------------------------
-- Duplicate checkout cleans: worked-on copies are kept, not deleted
-- ------------------------------------------------------------
DROP INDEX uq_housekeeping_open_checkout_clean;
INSERT INTO housekeeping_tasks (id, property_id, apartment_id, type, status, scheduled_date, created_at, notes, photo_before, assigned_to, checklist) VALUES
 ('f6000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0001-000000000101', 'checkout_clean', 'pending',     current_date, now() - interval '3 hours', NULL, NULL, NULL, '[]'),
 ('f6000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0001-000000000101', 'checkout_clean', 'issue_found', current_date, now() - interval '2 hours', 'Broken window, guest damage', ARRAY['before.jpg'], NULL, '[]'),
 ('f6000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0001-000000000101', 'checkout_clean', 'assigned',    current_date, now() - interval '1 hour', NULL, NULL, (SELECT id FROM staff WHERE first_name = 'hkA'), '[{"item":"bed","done":true}]'),
 ('f6000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0001-000000000101', 'checkout_clean', 'pending',     current_date, now(), NULL, NULL, NULL, '[]');
\ir ../../supabase/migrations/00036_review_fixes.sql
SELECT tst.eq('pristine copies deleted, worked-on ones kept',
  (SELECT string_agg(right(id::text, 1) || ':' || status, ',' ORDER BY id) FROM housekeeping_tasks WHERE id::text LIKE 'f6000000-%'),
  '2:issue_found,3:completed');
SELECT tst.eq('the closed copy keeps its work and says why',
  (SELECT (checklist <> '[]')::text || '/' || (notes LIKE 'Closed by migration 00036 (was assigned): duplicate of checkout clean f6000000-0000-0000-0000-000000000002')::text
     FROM housekeeping_tasks WHERE id = 'f6000000-0000-0000-0000-000000000003'), 'true/true');
SELECT tst.eq('index back in place', (SELECT count(*)::text FROM pg_indexes WHERE indexname = 'uq_housekeeping_open_checkout_clean'), '1');
