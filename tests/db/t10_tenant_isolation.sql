-- Tenant isolation: staff of property A never reach property B, and the
-- membership table cannot be used to get there.
\set ON_ERROR_STOP 1

-- Memberships: no self-grant, no granting a property you do not reach.
BEGIN; SELECT tst.as_user('adminA');
SELECT tst.denied('admin self-grants property B',
  $$insert into staff_properties(staff_id, property_id) values (get_staff_id(), 'bbbbbbbb-0000-0000-0000-000000000001')$$);
SELECT tst.denied('admin grants a colleague property B',
  $$insert into staff_properties(staff_id, property_id) select id, 'bbbbbbbb-0000-0000-0000-000000000001' from staff where email = 'recA@staff.test'$$);
SELECT tst.eq('B guests still invisible', tst.n($$select 1 from guests where property_id = 'bbbbbbbb-0000-0000-0000-000000000001'$$)::text, '0');
SELECT tst.eq('only own-property memberships visible',
  tst.n($$select 1 from staff_properties where property_id = 'bbbbbbbb-0000-0000-0000-000000000001'$$)::text, '0');
ROLLBACK;

-- An admin who genuinely belongs to both properties may add a receptionist
-- to B, but not the owner (higher level) and not themselves.
BEGIN;
INSERT INTO staff_properties(staff_id, property_id)
  SELECT id, 'bbbbbbbb-0000-0000-0000-000000000001' FROM staff WHERE email = 'adminA@staff.test';
SELECT tst.as_user('adminA');
SELECT tst.allowed('multi-property admin adds receptionist to B',
  $$insert into staff_properties(staff_id, property_id) select id, 'bbbbbbbb-0000-0000-0000-000000000001' from staff where email = 'recA@staff.test'$$);
SELECT tst.denied('admin cannot manage the owner''s memberships',
  $$insert into staff_properties(staff_id, property_id) select id, 'bbbbbbbb-0000-0000-0000-000000000001' from staff where email = 'ownerA@staff.test'$$);
SELECT tst.denied('admin cannot remove own membership',
  $$delete from staff_properties where staff_id = get_staff_id()$$);
-- Multi-property members now see B's operational data (00009 used the home property only).
SELECT tst.eq('member of B sees B bookings', tst.n($$select 1 from bookings where property_id = 'bbbbbbbb-0000-0000-0000-000000000001'$$)::text, '1');
SELECT tst.eq('member of B sees B apartments', tst.n($$select 1 from apartments where property_id = 'bbbbbbbb-0000-0000-0000-000000000001'$$)::text, '1');
ROLLBACK;

-- Guests: an unfiltered DELETE by an admin of A removes only A's guests.
BEGIN; SELECT tst.as_user('adminA');
SELECT tst.try($$delete from guests$$);
RESET ROLE;
SELECT tst.eq('B guest survives admin A''s unfiltered delete',
  (SELECT count(*) FROM guests WHERE property_id = 'bbbbbbbb-0000-0000-0000-000000000001')::text, '1');
ROLLBACK;

-- Deactivated staff lose everything.
BEGIN;
SELECT tst.mk('a0000000-0000-0000-0000-000000000001', '101', 'confirmed', 1, 3);
SELECT tst.as_user('exA');
SELECT tst.eq('inactive: bookings', tst.n('select 1 from bookings')::text, '0');
SELECT tst.eq('inactive: staff list', tst.n('select 1 from staff')::text, '0');
SELECT tst.eq('inactive: properties', tst.n('select 1 from properties')::text, '0');
SELECT tst.denied('inactive: update booking', $$update bookings set rate_per_night_gbp = 1$$);
SELECT tst.eq('inactive: can_access_property is strictly false', can_access_property('aaaaaaaa-0000-0000-0000-000000000001')::text, 'false');
ROLLBACK;

-- A signed-up user with no staff row (or a guest account) reaches nothing.
BEGIN; SELECT tst.as_user('nobody');
SELECT tst.eq('stranger: bookings', tst.n('select 1 from bookings')::text, '0');
SELECT tst.eq('stranger: guests', tst.n('select 1 from guests')::text, '0');
SELECT tst.eq('stranger: brain_config', tst.n('select 1 from brain_config')::text, '0');
SELECT tst.eq('stranger: booking channels', tst.n('select id from booking_channels')::text, '0');
ROLLBACK;

-- Cross-tenant reads of B data by every role of A are empty.
BEGIN; SELECT tst.as_user('ownerA');
SELECT tst.eq('owner A: B ' || t, tst.n(format('select 1 from %I where %s', t, c))::text, '0')
  FROM (VALUES
    ('bookings', $$property_id = 'bbbbbbbb-0000-0000-0000-000000000001'$$),
    ('guests', $$property_id = 'bbbbbbbb-0000-0000-0000-000000000001'$$),
    ('invoices', $$property_id = 'bbbbbbbb-0000-0000-0000-000000000001'$$),
    ('folios', $$property_id = 'bbbbbbbb-0000-0000-0000-000000000001'$$),
    ('folio_lines', $$folio_id = 'bbbbbbbb-0000-0000-0006-000000000001'$$),
    ('payments', $$id = 'bbbbbbbb-0000-0000-0009-000000000001'$$),
    ('booking_groups', $$property_id = 'bbbbbbbb-0000-0000-0000-000000000001'$$),
    ('booking_access_tokens', $$property_id = 'bbbbbbbb-0000-0000-0000-000000000001'$$),
    ('pos_tickets', $$property_id = 'bbbbbbbb-0000-0000-0000-000000000001'$$),
    ('rate_plans', $$property_id = 'bbbbbbbb-0000-0000-0000-000000000001'$$),
    ('gl_accounts', $$property_id = 'bbbbbbbb-0000-0000-0000-000000000001'$$),
    ('audit_log', $$property_id = 'bbbbbbbb-0000-0000-0000-000000000001'$$),
    ('properties', $$id = 'bbbbbbbb-0000-0000-0000-000000000001'$$),
    ('staff', $$property_id = 'bbbbbbbb-0000-0000-0000-000000000001'$$)
  ) AS v(t, c);
ROLLBACK;

-- Ledger functions refuse B's records for A's staff.
BEGIN; SELECT tst.as_user('adminA');
SELECT tst.raises('charge to B folio', $$select post_folio_charge('bbbbbbbb-0000-0000-0006-000000000001','extra','x',1,10)$$, 'FOLIO_NOT_FOUND');
SELECT tst.raises('pay B folio', $$select record_folio_payment('bbbbbbbb-0000-0000-0006-000000000001',10,'cash')$$, 'FOLIO_NOT_FOUND');
SELECT tst.raises('pay B invoice', $$select record_invoice_payment('bbbbbbbb-0000-0000-0008-000000000001',10,'cash')$$, 'INVOICE_NOT_FOUND');
SELECT tst.raises('refund B payment', $$select refund_payment('bbbbbbbb-0000-0000-0009-000000000001',10,'because')$$, 'PAYMENT_NOT_FOUND');
SELECT tst.raises('void B line', $$select void_folio_line('bbbbbbbb-0000-0000-0007-000000000001','because')$$, 'LINE_NOT_FOUND');
SELECT tst.raises('open B folio', $$select open_folio('bbbbbbbb-0000-0000-0005-000000000001')$$, 'BOOKING_NOT_FOUND');
SELECT tst.raises('check out B booking', $$select checkout_booking('bbbbbbbb-0000-0000-0005-000000000001')$$, 'BOOKING_NOT_FOUND');
SELECT tst.raises('night audit of B', $$select run_night_audit('bbbbbbbb-0000-0000-0000-000000000001')$$, 'PROPERTY_FORBIDDEN');
SELECT tst.raises('void B POS ticket', $$select void_pos_ticket('bbbbbbbb-0000-0000-000d-000000000001','because')$$, 'TICKET_NOT_FOUND');
SELECT tst.raises('post to B outlet', $$select post_pos_ticket('bbbbbbbb-0000-0000-000c-000000000001','bbbbbbbb-0000-0000-0005-000000000001','[{"name":"x","unit_price_gbp":1}]')$$, 'OUTLET_NOT_FOUND');
ROLLBACK;

-- Anonymous callers cannot run the ledger entry points at all.
BEGIN; SELECT tst.as_user('anon');
SELECT tst.raises('anon pays a folio', $$select record_folio_payment('bbbbbbbb-0000-0000-0006-000000000001',10,'cash')$$, 'permission denied');
SELECT tst.raises('anon night audit', $$select run_night_audit('bbbbbbbb-0000-0000-0000-000000000001')$$, 'permission denied');
ROLLBACK;

-- Notifications: no cross-tenant sends or reads.
BEGIN;
INSERT INTO notifications(staff_id, property_id, title, message) VALUES (NULL, 'bbbbbbbb-0000-0000-0000-000000000001', 'B only', 'broadcast');
SELECT tst.as_user('recA');
SELECT tst.eq('B broadcast invisible to A', tst.n($$select 1 from notifications where title = 'B only'$$)::text, '0');
SELECT tst.denied('notify B''s admin',
  $$insert into notifications(staff_id, title, message, link) select id, 'x', 'y', 'https://evil.test' from staff where email = 'adminB@staff.test'$$);
SELECT tst.denied('label a broadcast as B',
  $$insert into notifications(property_id, title, message) values ('bbbbbbbb-0000-0000-0000-000000000001', 'x', 'y')$$);
SELECT tst.allowed('notify a colleague',
  $$insert into notifications(staff_id, title, message) select id, 'x', 'y' from staff where email = 'mgrA@staff.test'$$);
ROLLBACK;

-- system_events: emitters see their own; housekeeping does not read others'.
BEGIN;
INSERT INTO system_events(type, source_system, payload) VALUES ('guest.created', 'test', '{"property_id":"bbbbbbbb-0000-0000-0000-000000000001","email":"bob@g.test"}');
SELECT tst.eq('event got B''s property', (SELECT property_id::text FROM system_events WHERE type = 'guest.created'), 'bbbbbbbb-0000-0000-0000-000000000001');
SELECT tst.as_user('hkA');
SELECT tst.eq('housekeeping reads no events', tst.n('select 1 from system_events')::text, '0');
SELECT tst.allowed('housekeeping emits an event and reads it back',
  $$insert into system_events(type, source_system, payload) values ('hk.done', 'test', '{}')$$);
SELECT tst.eq('own event visible', tst.n($$select 1 from system_events where type = 'hk.done'$$)::text, '1');
SELECT tst.allowed('own event updated (processed)', $$update system_events set processed = true where type = 'hk.done'$$);
RESET ROLE; SELECT tst.as_user('mgrA');
SELECT tst.eq('manager A cannot read B event', tst.n($$select 1 from system_events where type = 'guest.created'$$)::text, '0');
SELECT tst.eq('manager A reads A event', tst.n($$select 1 from system_events where type = 'hk.done'$$)::text, '1');
ROLLBACK;

-- audit_log: honest authorship, admins read their own property only.
BEGIN; SELECT tst.as_user('recA');
SELECT tst.allowed('log as myself', format($$insert into audit_log(user_id, user_email, action, category, description) values (%L, 'recA@x', 'a', 'finance', 'mine')$$, tst.id('recA')));
SELECT tst.denied('log as someone else', format($$insert into audit_log(user_id, user_email, action, category, description) values (%L, 'x', 'a', 'finance', 'forged')$$, tst.id('ownerA')));
SELECT tst.denied('log into B', format($$insert into audit_log(user_id, user_email, action, category, description, property_id) values (%L, 'x', 'a', 'finance', 'b', 'bbbbbbbb-0000-0000-0000-000000000001')$$, tst.id('recA')));
RESET ROLE; SELECT tst.as_user('adminA');
SELECT tst.eq('admin A sees A''s entry', tst.n($$select 1 from audit_log where description = 'mine'$$)::text, '1');
SELECT tst.eq('admin A does not see B''s entry', tst.n($$select 1 from audit_log where description = 'prop B audit'$$)::text, '0');
ROLLBACK;

-- GDPR requests, consent, predictions, workflows, images, marketplace, shuttle.
BEGIN;
INSERT INTO gdpr_requests(guest_id, request_type) VALUES ('bbbbbbbb-0000-0000-0004-000000000001', 'export');
INSERT INTO guest_consent(guest_id, consent_type, granted) VALUES ('bbbbbbbb-0000-0000-0004-000000000001', 'marketing', false);
INSERT INTO apartment_images(apartment_type_id, url) VALUES ('bbbbbbbb-0000-0000-0002-000000000001', 'https://b/img.jpg');
SELECT tst.as_user('mgrA');
SELECT tst.eq('B gdpr requests hidden', tst.n('select 1 from gdpr_requests')::text, '0');
SELECT tst.denied('flip B consent', $$update guest_consent set granted = true$$);
SELECT tst.denied('consent for B guest', $$insert into guest_consent(guest_id, consent_type, granted) values ('bbbbbbbb-0000-0000-0004-000000000001', 'analytics', true)$$);
SELECT tst.denied('prediction on B guest', $$insert into guest_predictions(guest_id, prediction_type, predicted_value, confidence) values ('bbbbbbbb-0000-0000-0004-000000000001', 'churn', '{}', 1)$$);
SELECT tst.denied('workflow for B', $$insert into workflows(property_id, title, source) values ('bbbbbbbb-0000-0000-0000-000000000001', 'x', 'manual')$$);
SELECT tst.allowed('workflow without property lands on A', $$insert into workflows(title, source) values ('mine', 'manual')$$);
SELECT tst.eq('workflow property defaulted', (SELECT property_id::text FROM workflows WHERE title = 'mine'), 'aaaaaaaa-0000-0000-0000-000000000001');
SELECT tst.eq('B type image hidden', tst.n('select 1 from apartment_images')::text, '0');
SELECT tst.denied('delete B type image', $$delete from apartment_images$$);
SELECT tst.denied('image on B apartment', $$insert into apartment_images(apartment_id, url) values ('bbbbbbbb-0000-0000-0001-000000000101', 'x')$$);
ROLLBACK;
BEGIN; SELECT tst.as_user('nobody');
SELECT tst.denied('stranger deletes images', $$delete from apartment_images$$);
ROLLBACK;

-- booking_channels: the API credentials column is not readable by staff.
BEGIN;
UPDATE booking_channels SET api_connection = '{"api_key":"sk_live_secret"}';
SELECT tst.as_user('recA');
SELECT tst.raises('api_connection unreadable', $$select api_connection from booking_channels$$, 'permission denied');
SELECT tst.eq('other columns readable', tst.val($$select code from booking_channels$$), 'direct');
ROLLBACK;

-- brain_config: owner only writes.
BEGIN; SELECT tst.as_user('adminB');
SELECT tst.denied('admin changes global brain config', $$update brain_config set mode = 'autonomous'$$);
RESET ROLE; SELECT tst.as_user('ownerA');
SELECT tst.allowed('owner changes brain config', $$update brain_config set mode = 'supervised'$$);
ROLLBACK;

-- daily_closes cannot be forged to suppress a night audit.
BEGIN; SELECT tst.as_user('adminB');
SELECT tst.raises('insert daily close', $$insert into daily_closes(property_id, business_date) values ('bbbbbbbb-0000-0000-0000-000000000001', current_date - 1)$$, 'permission denied');
ROLLBACK;

-- Portal links: the property is the booking's; revocation is final.
BEGIN; SELECT tst.as_user('recA');
SELECT tst.mk('a0000000-0000-0000-0000-000000000002', '101', 'confirmed', 1, 3);
SELECT tst.denied('link with B property on A booking',
  $$insert into booking_access_tokens(booking_id, property_id, token_hash, expires_at) values ('a0000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', repeat('c', 64), now() + interval '2 days')$$);
SELECT tst.denied('link to B booking',
  $$insert into booking_access_tokens(booking_id, property_id, token_hash, expires_at) values ('bbbbbbbb-0000-0000-0005-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', repeat('d', 64), now() + interval '2 days')$$);
SELECT tst.allowed('valid link',
  $$insert into booking_access_tokens(booking_id, property_id, token_hash, expires_at) values ('a0000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', repeat('e', 64), now() + interval '2 days')$$);
SELECT tst.denied('link valid for a year', format($$insert into booking_access_tokens(booking_id, property_id, token_hash, expires_at) values ('a0000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', repeat('f', 64), now() + interval '1 year')$$));
SELECT tst.allowed('revoke', $$update booking_access_tokens set revoked_at = now() where token_hash = repeat('e', 64)$$);
SELECT tst.denied('un-revoke', $$update booking_access_tokens set revoked_at = null where token_hash = repeat('e', 64)$$);
SELECT tst.denied('extend', $$update booking_access_tokens set expires_at = expires_at + interval '30 days' where token_hash = repeat('e', 64)$$);
SELECT tst.denied('bump usage counter', $$update booking_access_tokens set use_count = 99 where token_hash = repeat('e', 64)$$);
ROLLBACK;

-- TRUNCATE is not available to application roles.
BEGIN; SELECT tst.as_user('ownerA');
SELECT tst.raises('truncate folio_lines', 'truncate folio_lines', 'permission denied');
SELECT tst.raises('truncate bookings', 'truncate bookings', 'permission denied');
ROLLBACK;
BEGIN; SELECT tst.as_user('service');
SELECT tst.raises('service truncates the ledger', 'truncate folio_lines', 'permission denied');
ROLLBACK;

-- SECURITY DEFINER helpers ignore a temp table named "staff".
BEGIN; SELECT tst.as_user('nobody');
CREATE TEMP TABLE staff (id uuid, auth_user_id uuid, property_id uuid, role text, is_active boolean);
INSERT INTO pg_temp.staff VALUES (gen_random_uuid(), auth.uid(), 'bbbbbbbb-0000-0000-0000-000000000001', 'owner', true);
SELECT tst.eq('temp table does not hijack can_access_property',
  coalesce(public.can_access_property('bbbbbbbb-0000-0000-0000-000000000001'), false)::text, 'false');
SELECT tst.eq('temp table does not hijack role level', coalesce(public.staff_role_level(), 0)::text, '0');
ROLLBACK;

-- Every SECURITY DEFINER function in public pins its search_path.
SELECT tst.eq('definer functions without search_path',
  (SELECT string_agg(p.proname, ', ') FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')), NULL);
-- No policy is open to everyone.
SELECT tst.eq('policies with USING (true)',
  (SELECT string_agg(tablename || '.' || policyname, ', ') FROM pg_policies
    WHERE schemaname = 'public' AND (qual = 'true' OR with_check = 'true')), NULL);
SELECT tst.eq('tables without RLS',
  (SELECT string_agg(c.relname, ', ') FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity), NULL);
