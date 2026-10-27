-- Fixtures: property A (full staff ladder) and property B (one of everything).
INSERT INTO tst.users VALUES
 ('ownerA','00000000-0000-0000-0000-0000000000a1'),('adminA','00000000-0000-0000-0000-0000000000a2'),
 ('mgrA','00000000-0000-0000-0000-0000000000a3'),('recA','00000000-0000-0000-0000-0000000000a4'),
 ('hkA','00000000-0000-0000-0000-0000000000a5'),('roA','00000000-0000-0000-0000-0000000000a6'),
 ('exA','00000000-0000-0000-0000-0000000000a7'),('mntA','00000000-0000-0000-0000-0000000000a8'),
 ('adminB','00000000-0000-0000-0000-0000000000b2'),('mgrB','00000000-0000-0000-0000-0000000000b3'),
 ('recB','00000000-0000-0000-0000-0000000000b4'),
 ('guestA','00000000-0000-0000-0000-0000000000c1'),('nobody','00000000-0000-0000-0000-0000000000d1');
INSERT INTO auth.users(id,email) SELECT id, name||'@x.test' FROM tst.users;

INSERT INTO properties(id,name,slug,address,email,status,vat_rate_percent,tourism_levy_per_night_gbp) VALUES
 ('aaaaaaaa-0000-0000-0000-000000000001','Prop A','prop-a','1 A st','a@x.test','active',14,2),
 ('bbbbbbbb-0000-0000-0000-000000000001','Prop B','prop-b','1 B st','b@x.test','active',20,0);
INSERT INTO staff(auth_user_id,property_id,first_name,last_name,email,role,is_active)
SELECT u.id, CASE WHEN u.name LIKE '%A' THEN 'aaaaaaaa-0000-0000-0000-000000000001'::uuid ELSE 'bbbbbbbb-0000-0000-0000-000000000001'::uuid END,
       u.name,'x',u.name||'@staff.test',
       CASE u.name WHEN 'ownerA' THEN 'owner' WHEN 'adminA' THEN 'admin' WHEN 'mgrA' THEN 'manager' WHEN 'recA' THEN 'receptionist'
         WHEN 'hkA' THEN 'housekeeping' WHEN 'roA' THEN 'readonly' WHEN 'exA' THEN 'receptionist' WHEN 'mntA' THEN 'maintenance'
         WHEN 'adminB' THEN 'admin' WHEN 'mgrB' THEN 'manager' WHEN 'recB' THEN 'receptionist' END,
       u.name <> 'exA'
FROM tst.users u WHERE u.name NOT IN ('guestA','nobody');

INSERT INTO booking_channels(id,name,code) VALUES ('cccccccc-0000-0000-0000-000000000001','Direct','direct');
INSERT INTO buildings(id,property_id,name,code) VALUES
 ('aaaaaaaa-0000-0000-0003-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Bldg A','A'),
 ('bbbbbbbb-0000-0000-0003-000000000001','bbbbbbbb-0000-0000-0000-000000000001','Bldg B','B');
INSERT INTO apartment_types(id,property_id,name,slug,base_weekly_rate_gbp) VALUES
 ('aaaaaaaa-0000-0000-0002-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Studio A','studio',700),
 ('bbbbbbbb-0000-0000-0002-000000000001','bbbbbbbb-0000-0000-0000-000000000001','Studio B','studio',1000);
INSERT INTO apartments(id,property_id,building_id,apartment_type_id,number,floor) VALUES
 ('aaaaaaaa-0000-0000-0001-000000000101','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0003-000000000001','aaaaaaaa-0000-0000-0002-000000000001','A101',1),
 ('aaaaaaaa-0000-0000-0001-000000000102','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0003-000000000001','aaaaaaaa-0000-0000-0002-000000000001','A102',1),
 ('aaaaaaaa-0000-0000-0001-000000000103','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0003-000000000001','aaaaaaaa-0000-0000-0002-000000000001','A103',1),
 ('bbbbbbbb-0000-0000-0001-000000000101','bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0003-000000000001','bbbbbbbb-0000-0000-0002-000000000001','B101',1);
INSERT INTO guests(id,property_id,first_name,last_name,email,auth_user_id) VALUES
 ('aaaaaaaa-0000-0000-0004-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Gina','A','gina@g.test','00000000-0000-0000-0000-0000000000c1'),
 ('bbbbbbbb-0000-0000-0004-000000000001','bbbbbbbb-0000-0000-0000-000000000001','Bob','B','bob@g.test',NULL);
-- BAR rate plans and GL accounts come from trg_properties_seed_defaults (00033).
-- Property B: an in-house booking with folio, invoice, payment, group, token, pos ticket
INSERT INTO bookings(id,property_id,apartment_id,guest_id,channel_id,reference,status,check_in,check_out,rate_per_night_gbp,total_amount_gbp) VALUES
 ('bbbbbbbb-0000-0000-0005-000000000001','bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0001-000000000101','bbbbbbbb-0000-0000-0004-000000000001','cccccccc-0000-0000-0000-000000000001','B-REF-1','checked_in', current_date-2, current_date+3, 100, 500);
INSERT INTO folios(id,property_id,booking_id,guest_id) VALUES ('bbbbbbbb-0000-0000-0006-000000000001','bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0005-000000000001','bbbbbbbb-0000-0000-0004-000000000001');
INSERT INTO folio_lines(id,folio_id,business_date,type,description,debit_gbp) VALUES ('bbbbbbbb-0000-0000-0007-000000000001','bbbbbbbb-0000-0000-0006-000000000001',current_date-2,'room','night',100);
INSERT INTO invoices(id,property_id,booking_id,guest_id,invoice_number,status,subtotal_gbp,total_gbp,due_date) VALUES
 ('bbbbbbbb-0000-0000-0008-000000000001','bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0005-000000000001','bbbbbbbb-0000-0000-0004-000000000001','INV-B-1','sent',500,500,current_date+10);
INSERT INTO payments(id,invoice_id,amount_gbp,amount_original,method,status) VALUES ('bbbbbbbb-0000-0000-0009-000000000001','bbbbbbbb-0000-0000-0008-000000000001',50,50,'cash','completed');
INSERT INTO booking_groups(id,property_id,reference,name,check_in,check_out) VALUES ('bbbbbbbb-0000-0000-000a-000000000001','bbbbbbbb-0000-0000-0000-000000000001','GRP-B','Group B',current_date+20,current_date+22);
INSERT INTO booking_access_tokens(id,booking_id,property_id,token_hash,expires_at) VALUES ('bbbbbbbb-0000-0000-000b-000000000001','bbbbbbbb-0000-0000-0005-000000000001','bbbbbbbb-0000-0000-0000-000000000001',repeat('b',64),now()+interval '7 days');
INSERT INTO pos_outlets(id,property_id,code,name,type) VALUES ('bbbbbbbb-0000-0000-000c-000000000001','bbbbbbbb-0000-0000-0000-000000000001','BAR','Bar B','bar');
INSERT INTO pos_tickets(id,property_id,outlet_id,booking_id,folio_id,items,subtotal_gbp,tax_gbp,total_gbp,business_date) VALUES ('bbbbbbbb-0000-0000-000d-000000000001','bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-000c-000000000001','bbbbbbbb-0000-0000-0005-000000000001','bbbbbbbb-0000-0000-0006-000000000001','[]',0,0,0,current_date);
INSERT INTO audit_log(user_id,user_email,action,category,description,metadata) VALUES ('adminB','adminB@x','x','finance','prop B audit','{"property_id":"bbbbbbbb-0000-0000-0000-000000000001"}');
INSERT INTO expenses(property_id,category,description,amount_gbp,expense_date) SELECT 'bbbbbbbb-0000-0000-0000-000000000001', 'utilities','B expense',10,current_date WHERE false;
-- Business date = current_date in the tests (avoid midnight drift in other zones).
UPDATE properties SET timezone = 'UTC';
