-- Ledger integrity: money only moves through the checked functions, issued
-- invoices are frozen, an invoice payment settles the stay, voids and
-- reissues keep the bill complete. Property A: VAT 14%, levy 2 per night.
\set ON_ERROR_STOP 1

BEGIN; SELECT tst.as_user('recA');
-- Stay c1: arrived two nights ago, leaves in three. Two nights = 2 x (100 + 14 + 2).
SELECT tst.mk('c1000000-0000-0000-0000-000000000001', '101', 'confirmed', -2, 3);
SELECT tst.eq('check in', tst.val($$select checkin_booking('c1000000-0000-0000-0000-000000000001')->>'status'$$), 'checked_in');

-- No direct writes to the ledger.
SELECT tst.raises('forge a payment line', $$insert into folio_lines(folio_id, business_date, type, description, credit_gbp) select id, current_date, 'payment', 'cash', 232 from folios$$, 'permission denied');
SELECT tst.raises('forge a charge line', $$insert into folio_lines(folio_id, business_date, type, description, debit_gbp) select id, current_date, 'extra', 'x', 1 from folios$$, 'permission denied');
SELECT tst.raises('insert a payment row', $$insert into payments(folio_id, amount_gbp, amount_original, method, status) select id, 232, 232, 'cash', 'completed' from folios$$, 'permission denied');
SELECT tst.raises('detach folio invoice', $$update folios set invoice_id = null$$, 'permission denied');
SELECT tst.raises('close folio by hand', $$update folios set status = 'closed'$$, 'permission denied');

SELECT tst.eq('nights posted', tst.val($$select post_booking_room_charges('c1000000-0000-0000-0000-000000000001')$$), '2');
SELECT tst.eq('folio balance', tst.val($$select folio_balance(id) from folios where booking_id = 'c1000000-0000-0000-0000-000000000001'$$), '232.00');

-- Paying the folio-issued invoice settles the stay (no second charge at checkout).
SELECT tst.eq('issue invoice', tst.val($$select issue_folio_invoice(id)->'invoice'->>'total_gbp' from folios where booking_id = 'c1000000-0000-0000-0000-000000000001'$$), '232.00');
SELECT tst.eq('pay the invoice', tst.val($$select record_invoice_payment(f.invoice_id, 232, 'card')->>'invoice_status' from folios f where booking_id = 'c1000000-0000-0000-0000-000000000001'$$), 'paid');
SELECT tst.eq('folio settled by the invoice payment', tst.val($$select folio_balance(id) from folios where booking_id = 'c1000000-0000-0000-0000-000000000001'$$), '0.00');
SELECT tst.eq('check out', tst.val($$select checkout_booking('c1000000-0000-0000-0000-000000000001')->>'outstanding_gbp'$$), '0.00');
SELECT tst.eq('folio closed', tst.val($$select status from folios where booking_id = 'c1000000-0000-0000-0000-000000000001'$$), 'closed');
SELECT tst.eq('collected once', tst.val($$select sum(amount_gbp) from payments p join folios f on f.id = p.folio_id where f.booking_id = 'c1000000-0000-0000-0000-000000000001'$$), '232.00');
SELECT tst.raises('no payments on a closed folio', $$select record_folio_payment(id, 1, 'cash') from folios where booking_id = 'c1000000-0000-0000-0000-000000000001'$$, 'FOLIO_CLOSED');
SELECT tst.raises('receptionist cannot refund', $$select refund_payment(p.id, 32, 'goodwill') from payments p join folios f on f.id = p.folio_id where f.booking_id = 'c1000000-0000-0000-0000-000000000001'$$, 'ROLE_FORBIDDEN');
RESET ROLE;

-- A partial refund re-opens the invoice's balance.
SELECT tst.as_user('mgrA');
SELECT tst.ok('manager refunds 32', $$select refund_payment(p.id, 32, 'goodwill') from payments p join folios f on f.id = p.folio_id where f.booking_id = 'c1000000-0000-0000-0000-000000000001'$$);
SELECT tst.eq('invoice partially paid after refund', tst.val($$select i.status from invoices i join folios f on f.invoice_id = i.id where f.booking_id = 'c1000000-0000-0000-0000-000000000001'$$), 'partially_paid');
SELECT tst.raises('sub-penny refund', $$select refund_payment(p.id, 0.001, 'goodwill') from payments p join folios f on f.id = p.folio_id where f.booking_id = 'c1000000-0000-0000-0000-000000000001'$$, 'INVALID_AMOUNT');
RESET ROLE;

-- Issued invoices are frozen and never deleted.
SELECT tst.as_user('recA');
SELECT tst.raises('back to draft', $$update invoices i set status = 'draft' from folios f where f.invoice_id = i.id and f.booking_id = 'c1000000-0000-0000-0000-000000000001'$$, 'INVOICE_IMMUTABLE');
SELECT tst.raises('edit total', $$update invoices i set total_gbp = 1 from folios f where f.invoice_id = i.id and f.booking_id = 'c1000000-0000-0000-0000-000000000001'$$, 'INVOICE_IMMUTABLE');
RESET ROLE;
SELECT tst.as_user('mgrA');
SELECT tst.raises('delete issued invoice', $$delete from invoices i using folios f where f.invoice_id = i.id and f.booking_id = 'c1000000-0000-0000-0000-000000000001'$$, 'INVOICE_IMMUTABLE');
RESET ROLE;
SELECT tst.eq('superuser cannot delete it either', (tst.try($$delete from invoices i using folios f where f.invoice_id = i.id and f.booking_id = 'c1000000-0000-0000-0000-000000000001'$$) LIKE 'ERR P0001: INVOICE_IMMUTABLE%')::text, 'true');
ROLLBACK;

-- Charges after the invoice: reissue; voiding a night takes its VAT and levy.
BEGIN; SELECT tst.as_user('recA');
SELECT tst.mk('c3000000-0000-0000-0000-000000000001', '102', 'confirmed', -2, 3);
SELECT tst.ok('check in c3', $$select checkin_booking('c3000000-0000-0000-0000-000000000001')$$);
SELECT tst.ok('post nights', $$select post_booking_room_charges('c3000000-0000-0000-0000-000000000001')$$);
SELECT tst.eq('first invoice', tst.val($$select issue_folio_invoice(id)->'invoice'->>'total_gbp' from folios where booking_id = 'c3000000-0000-0000-0000-000000000001'$$), '232.00');
SELECT tst.eq('unchanged folio: same invoice', tst.val($$select issue_folio_invoice(id)->>'already_issued' from folios where booking_id = 'c3000000-0000-0000-0000-000000000001'$$), 'true');
SELECT tst.ok('minibar charge', $$select post_folio_charge(id, 'fnb', 'Minibar', 1, 50) from folios where booking_id = 'c3000000-0000-0000-0000-000000000001'$$);
SELECT tst.eq('reissued with the new charge', tst.val($$select issue_folio_invoice(id)->'invoice'->>'total_gbp' from folios where booking_id = 'c3000000-0000-0000-0000-000000000001'$$), '289.00');
SELECT tst.eq('old invoice cancelled', tst.val($$select string_agg(status || ':' || total_gbp, ',' order by total_gbp) from invoices where booking_id = 'c3000000-0000-0000-0000-000000000001'$$), 'cancelled:232.00,sent:289.00');
SELECT tst.raises('receptionist cannot void', $$select void_folio_line(l.id, 'wrong night') from folio_lines l join folios f on f.id = l.folio_id where f.booking_id = 'c3000000-0000-0000-0000-000000000001' and l.type = 'room' and l.business_date = current_date - 1$$, 'ROLE_FORBIDDEN');
RESET ROLE; SELECT tst.as_user('mgrA');
SELECT tst.eq('void a room night: room, VAT and levy reversed', tst.val($$select void_folio_line(l.id, 'wrong night')->>'balance_gbp' from folio_lines l join folios f on f.id = l.folio_id where f.booking_id = 'c3000000-0000-0000-0000-000000000001' and l.type = 'room' and l.business_date = current_date - 1$$), '173.00');
SELECT tst.eq('three reversal lines', tst.val($$select count(*) from folio_lines l join folios f on f.id = l.folio_id where f.booking_id = 'c3000000-0000-0000-0000-000000000001' and l.type = 'reversal'$$), '3');
SELECT tst.eq('invoice after void', tst.val($$select issue_folio_invoice(id)->'invoice'->>'total_gbp' from folios where booking_id = 'c3000000-0000-0000-0000-000000000001'$$), '173.00');
ROLLBACK;

-- Standalone invoices: payment, full refund marks the invoice refunded.
BEGIN; SELECT tst.as_user('recA');
SELECT tst.mk('c2000000-0000-0000-0000-000000000001', '103', 'confirmed', 10, 12);
SELECT tst.allowed('receptionist raises invoice', $$insert into invoices(id, property_id, booking_id, invoice_number, status, subtotal_gbp, total_gbp, due_date, line_items, tax_rate_percent) values ('c2000000-0000-0000-0008-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'INV-C2', 'draft', 100, 100, current_date + 7, '[{"description":"Transfer","quantity":1,"unit_price_gbp":100}]', 0)$$);
SELECT tst.allowed('receptionist sends it', $$update invoices set status = 'sent', sent_at = now() where id = 'c2000000-0000-0000-0008-000000000001'$$);
SELECT tst.raises('sub-penny payment', $$select record_invoice_payment('c2000000-0000-0000-0008-000000000001', 0.001, 'cash')$$, 'INVALID_AMOUNT');
SELECT tst.raises('fraction of a penny', $$select record_invoice_payment('c2000000-0000-0000-0008-000000000001', 10.005, 'cash')$$, 'INVALID_AMOUNT');
SELECT tst.raises('NaN', $$select record_invoice_payment('c2000000-0000-0000-0008-000000000001', 'NaN', 'cash')$$, 'INVALID_AMOUNT');
SELECT tst.raises('overpayment', $$select record_invoice_payment('c2000000-0000-0000-0008-000000000001', 100.01, 'cash')$$, 'OVERPAYMENT');
SELECT tst.eq('pay 60', tst.val($$select record_invoice_payment('c2000000-0000-0000-0008-000000000001', 60, 'card')->>'invoice_status'$$), 'partially_paid');
SELECT tst.eq('pay 40', tst.val($$select record_invoice_payment('c2000000-0000-0000-0008-000000000001', 40, 'card')->>'invoice_status'$$), 'paid');
RESET ROLE; SELECT tst.as_user('mgrA');
SELECT tst.ok('refund 60', $$select refund_payment(id, 60, 'cancelled stay') from payments where invoice_id = 'c2000000-0000-0000-0008-000000000001' and amount_gbp = 60$$);
SELECT tst.eq('after refunding 60', tst.val($$select status from invoices where id = 'c2000000-0000-0000-0008-000000000001'$$), 'partially_paid');
SELECT tst.ok('refund 40', $$select refund_payment(id, 40, 'cancelled stay') from payments where invoice_id = 'c2000000-0000-0000-0008-000000000001' and amount_gbp = 40$$);
SELECT tst.eq('fully refunded invoice', tst.val($$select status from invoices where id = 'c2000000-0000-0000-0008-000000000001'$$), 'refunded');
SELECT tst.raises('refund again', $$select refund_payment(id, 1, 'again') from payments where invoice_id = 'c2000000-0000-0000-0008-000000000001' and amount_gbp = 40$$, 'INVALID_STATUS');
SELECT tst.raises('direct refund row', $$insert into refunds(payment_id, amount_gbp, method, reason) select id, 999999, 'cash', 'x' from payments limit 1$$, 'permission denied');
ROLLBACK;

-- Deposits before arrival are capped at the expected cost of the stay.
BEGIN; SELECT tst.as_user('recA');
SELECT tst.mk('c4000000-0000-0000-0000-000000000001', '103', 'confirmed', 5, 7);
SELECT tst.raises('a million deposit', $$select record_folio_payment(open_folio('c4000000-0000-0000-0000-000000000001'), 1000000, 'card')$$, 'OVERPAYMENT');
-- 2 nights x 100 + 14% VAT + 2 x 2 levy = 232
SELECT tst.eq('full prepayment', tst.val($$select record_folio_payment(open_folio('c4000000-0000-0000-0000-000000000001'), 232, 'card')->>'balance_gbp'$$), '-232.00');
SELECT tst.raises('a penny more', $$select record_folio_payment(open_folio('c4000000-0000-0000-0000-000000000001'), 0.01, 'card')$$, 'OVERPAYMENT');
ROLLBACK;

-- Charges: validation.
BEGIN; SELECT tst.as_user('recA');
SELECT tst.mk('c5000000-0000-0000-0000-000000000001', '103', 'confirmed', 5, 7);
SELECT tst.raises('negative VAT', $$select post_folio_charge(open_folio('c5000000-0000-0000-0000-000000000001'), 'extra', 'x', 1, 10, -20)$$, 'INVALID_AMOUNT');
SELECT tst.raises('sub-penny price', $$select post_folio_charge(open_folio('c5000000-0000-0000-0000-000000000001'), 'extra', 'x', 1, 0.001)$$, 'INVALID_AMOUNT');
SELECT tst.raises('payment as a charge type', $$select post_folio_charge(open_folio('c5000000-0000-0000-0000-000000000001'), 'payment', 'x', 1, 10)$$, 'INVALID_CHARGE_TYPE');
SELECT tst.raises('internal charge function is not callable', $$select post_folio_charge_unchecked(open_folio('c5000000-0000-0000-0000-000000000001'), 'extra', 'x', 1, 10, null, 'x')$$, 'permission denied');
SELECT tst.raises('internal room charge function is not callable', $$select post_room_charges('aaaaaaaa-0000-0000-0000-000000000001', current_date)$$, 'permission denied');
ROLLBACK;
BEGIN; SELECT tst.as_user('hkA');
SELECT tst.mk('c5000000-0000-0000-0000-000000000002', '103', 'confirmed', 5, 7);
RESET ROLE; SELECT tst.mk('c5000000-0000-0000-0000-000000000002', '103', 'confirmed', 5, 7); SELECT tst.as_user('hkA');
SELECT tst.raises('housekeeping cannot post arbitrary charges', $$select post_folio_charge(open_folio('c5000000-0000-0000-0000-000000000002'), 'extra', 'x', 1, 10)$$, 'ROLE_FORBIDDEN');
ROLLBACK;
