-- Role floors match the API role groups: what each role may and may not do
-- directly through PostgREST with its own token.
\set ON_ERROR_STOP 1

BEGIN;
SELECT tst.mk('b0000000-0000-0000-0000-000000000001', '101', 'confirmed', 1, 3);
INSERT INTO invoices(id, property_id, booking_id, invoice_number, status, subtotal_gbp, total_gbp, due_date)
VALUES ('b0000000-0000-0000-0008-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'INV-A-D', 'draft', 200, 200, current_date);

-- Housekeeping: reads operations, writes tasks and apartment status only.
SELECT tst.as_user('hkA');
SELECT tst.eq('hk reads bookings', tst.n('select 1 from bookings')::text, '1');
SELECT tst.denied('hk edits draft invoice', $$update invoices set total_gbp = 1$$);
SELECT tst.denied('hk inserts paid invoice', $$insert into invoices(property_id, invoice_number, status, subtotal_gbp, total_gbp, due_date) values ('aaaaaaaa-0000-0000-0000-000000000001', 'HK-1', 'paid', 0, 0, current_date)$$);
SELECT tst.denied('hk deletes invoice', $$delete from invoices$$);
SELECT tst.denied('hk inserts expense', $$insert into expenses(property_id, category, description, amount_egp, expense_date) values ('aaaaaaaa-0000-0000-0000-000000000001', 'other', 'x', 9, current_date)$$);
SELECT tst.denied('hk zeroes booking rate', $$update bookings set rate_per_night_gbp = 0$$);
SELECT tst.denied('hk cancels booking', $$update bookings set status = 'cancelled'$$);
SELECT tst.denied('hk edits rates', $$insert into rates(property_id, apartment_type_id, season_name, start_date, end_date, weekly_rate_gbp, nightly_rate_gbp) values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0002-000000000001', 'hk', current_date, current_date + 3, 7, 1)$$);
SELECT tst.raises('hk inserts payment', $$insert into payments(invoice_id, amount_gbp, amount_original, method, status) values ('b0000000-0000-0000-0008-000000000001', 1, 1, 'cash', 'completed')$$, 'permission denied');
SELECT tst.allowed('hk marks apartment clean', $$update apartments set status = 'cleaning' where number = 'A101'$$);
SELECT tst.raises('hk renames apartment', $$update apartments set number = 'X1' where number = 'A102'$$, 'ROLE_FORBIDDEN');
SELECT tst.allowed('hk creates a cleaning task', $$insert into housekeeping_tasks(property_id, apartment_id, type, status, priority, scheduled_date) values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0001-000000000102', 'midstay_clean', 'pending', 'normal', current_date)$$);
SELECT tst.allowed('hk updates a cleaning task', $$update housekeeping_tasks set status = 'in_progress'$$);
RESET ROLE;

-- Readonly: reads, never writes.
SELECT tst.as_user('roA');
SELECT tst.eq('readonly reads bookings', tst.n('select 1 from bookings')::text, '1');
SELECT tst.eq('readonly reads apartments', tst.n('select 1 from apartments')::text, '3');
SELECT tst.denied('readonly updates booking', $$update bookings set internal_notes = 'ro'$$);
SELECT tst.denied('readonly inserts expense', $$insert into expenses(property_id, category, description, amount_egp, expense_date) values ('aaaaaaaa-0000-0000-0000-000000000001', 'other', 'x', 1, current_date)$$);
SELECT tst.denied('readonly takes units out of service', $$update apartments set status = 'out_of_service'$$);
SELECT tst.denied('readonly deletes availability', $$delete from availability$$);
SELECT tst.denied('readonly deletes partner certifications', $$delete from partner_certifications$$);
SELECT tst.denied('readonly deletes shuttle schedules', $$delete from shuttle_schedules$$);
RESET ROLE;

-- Receptionist: stays and invoices, not expenses or rates.
SELECT tst.as_user('recA');
SELECT tst.allowed('receptionist edits booking notes', $$update bookings set internal_notes = 'rec'$$);
SELECT tst.allowed('receptionist edits draft invoice', $$update invoices set notes = 'n'$$);
SELECT tst.eq('receptionist books a stay', tst.mk('b0000000-0000-0000-0000-000000000002', '102', 'confirmed', 5, 7), 'OK rows=1');
SELECT tst.denied('receptionist deletes draft invoice', $$delete from invoices$$);
SELECT tst.denied('receptionist inserts expense', $$insert into expenses(property_id, category, description, amount_egp, expense_date) values ('aaaaaaaa-0000-0000-0000-000000000001', 'other', 'x', 1, current_date)$$);
RESET ROLE;

-- Manager: expenses, rates, unit details, draft invoice deletion.
SELECT tst.as_user('mgrA');
SELECT tst.allowed('manager inserts expense', $$insert into expenses(property_id, category, description, amount_egp, expense_date) values ('aaaaaaaa-0000-0000-0000-000000000001', 'other', 'x', 1, current_date)$$);
SELECT tst.allowed('manager renames apartment', $$update apartments set number = 'A102b' where number = 'A102'$$);
SELECT tst.allowed('manager deletes draft invoice', $$delete from invoices where status = 'draft'$$);
RESET ROLE;

-- Inactive receptionist: nothing.
SELECT tst.as_user('exA');
SELECT tst.denied('inactive receptionist edits booking', $$update bookings set internal_notes = 'ex'$$);
SELECT tst.raises('inactive receptionist checks in', $$select checkin_booking('b0000000-0000-0000-0000-000000000001')$$, 'BOOKING_NOT_FOUND');
ROLLBACK;
