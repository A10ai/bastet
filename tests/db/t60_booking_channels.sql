-- Booking channels are shared by every property: only an owner edits them,
-- only the editable columns, and nobody reads the API credentials (00035).
-- Booking / invoice numbering is staff-only.
\set ON_ERROR_STOP 1

BEGIN;
UPDATE booking_channels SET api_connection = '{"api_key":"secret"}' WHERE code = 'direct';

SELECT tst.as_user('ownerA');
SELECT tst.allowed('owner renames channel', $$update booking_channels set name = 'Direct web' where code = 'direct'$$);
SELECT tst.allowed('owner sets commission', $$update booking_channels set commission_rate = 12.5, is_active = false where code = 'direct'$$);
SELECT tst.raises('owner writes api_connection', $$update booking_channels set api_connection = '{}' where code = 'direct'$$, 'permission denied');
SELECT tst.raises('owner changes code', $$update booking_channels set code = 'x' where code = 'direct'$$, 'permission denied');
SELECT tst.raises('owner reads api_connection', $$select api_connection from booking_channels$$, 'permission denied');
RESET ROLE;
SELECT tst.eq('owner edit stored', (SELECT name || '/' || commission_rate || '/' || is_active FROM booking_channels WHERE code = 'direct'), 'Direct web/12.50/false');

SELECT tst.as_user('adminA');
SELECT tst.denied('admin sets commission', $$update booking_channels set commission_rate = 99 where code = 'direct'$$);
SELECT tst.raises('admin reads api_connection', $$select api_connection from booking_channels$$, 'permission denied');
SELECT tst.eq('admin still lists channels', tst.n('select id, name, commission_rate from booking_channels')::text, '1');
RESET ROLE;

SELECT tst.as_user('mgrA');
SELECT tst.denied('manager sets commission', $$update booking_channels set commission_rate = 99 where code = 'direct'$$);
RESET ROLE;

SELECT tst.as_user('nobody');
SELECT tst.denied('non-staff sets commission', $$update booking_channels set commission_rate = 99 where code = 'direct'$$);
SELECT tst.raises('non-staff reads api_connection', $$select api_connection from booking_channels$$, 'permission denied');
RESET ROLE;

SELECT tst.as_user('anon');
SELECT tst.raises('anon updates channel', $$update booking_channels set commission_rate = 99$$, 'permission denied');
SELECT tst.raises('anon burns a booking reference', $$select next_booking_reference()$$, 'permission denied');
SELECT tst.raises('anon burns an invoice number', $$select next_invoice_number()$$, 'permission denied');
RESET ROLE;

SELECT tst.as_user('recA');
SELECT tst.ok('staff gets a booking reference', $$select next_booking_reference()$$);
SELECT tst.ok('staff gets an invoice number', $$select next_invoice_number()$$);
RESET ROLE;

SELECT tst.eq('commission unchanged by non-owners', (SELECT commission_rate::text FROM booking_channels WHERE code = 'direct'), '12.50');
ROLLBACK;
