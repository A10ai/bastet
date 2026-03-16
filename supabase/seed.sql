-- ============================================================
-- Bastet PMS — Development Seed Data
-- ============================================================
-- BEFORE RUNNING:
-- 1. Run all migrations (00001-00010) in your Supabase SQL editor
-- 2. Create 5 auth users in Supabase Dashboard > Authentication:
--    - owner@bastet.com (password: BastetDev2026!)
--    - manager@bastet.com
--    - reception@bastet.com
--    - housekeeping@bastet.com
--    - maintenance@bastet.com
-- 3. Replace the auth_user_id placeholders below with actual UUIDs
-- ============================================================

DO $$
DECLARE
  -- Replace these with actual auth.users UUIDs after creating them
  v_owner_auth_id UUID := '00000000-0000-0000-0000-000000000001';
  v_manager_auth_id UUID := '00000000-0000-0000-0000-000000000002';
  v_reception_auth_id UUID := '00000000-0000-0000-0000-000000000003';
  v_housekeeping_auth_id UUID := '00000000-0000-0000-0000-000000000004';
  v_maintenance_auth_id UUID := '00000000-0000-0000-0000-000000000005';

  -- Auto-generated IDs
  v_property_id UUID;
  v_building_a UUID;
  v_building_b UUID;
  v_building_c UUID;
  v_type_studio UUID;
  v_type_1bed UUID;
  v_type_2bed UUID;
  v_type_penthouse UUID;
  v_channel_direct UUID;
  v_channel_booking UUID;
  v_channel_airbnb UUID;
  v_channel_expedia UUID;
  v_channel_phone UUID;
  v_channel_walkin UUID;
  v_staff_owner UUID;
  v_staff_manager UUID;
  v_staff_reception UUID;
  v_staff_hk UUID;
  v_staff_maint UUID;
  v_apt_ids UUID[];
  v_guest_ids UUID[];
  v_segment_tourist UUID;
  v_segment_nomad UUID;
  v_segment_domestic UUID;
  v_segment_corporate UUID;
  v_blocks UUID[];
  v_codes TEXT[] := ARRAY['A', 'B', 'C'];
  v_views TEXT[] := ARRAY['garden', 'pool', 'city', 'partial_sea', 'sea'];
  v_apt_statuses TEXT[] := ARRAY['available', 'available', 'available', 'available', 'occupied', 'occupied', 'occupied', 'cleaning', 'maintenance'];
  v_b INT;
  v_f INT;
  v_u INT;
  v_n INT := 0;

BEGIN

-- ============================================================
-- 1. Property
-- ============================================================
INSERT INTO properties (name, slug, address, city, country, latitude, longitude, timezone, default_currency, reporting_currency, star_rating, total_apartments, status, phone, email, website)
VALUES ('Bastet Aparthotels', 'bastet-hrg', 'Kawthar District, Hurghada', 'Hurghada', 'EG', 27.1783880, 33.8612450, 'Africa/Cairo', 'EGP', 'GBP', 4, 270, 'construction', '+20 65 344 0000', 'info@bastetaparthotels.com', 'https://bastetaparthotels.com')
RETURNING id INTO v_property_id;

-- ============================================================
-- 2. Buildings (Ground + 4 floors + rooftop = 5 blocks)
-- ============================================================
INSERT INTO buildings (property_id, name, code, floors, apartments_per_floor, has_elevator, has_parking, status)
VALUES (v_property_id, 'Block A', 'A', 5, 14, true, false, 'active')
RETURNING id INTO v_building_a;

INSERT INTO buildings (property_id, name, code, floors, apartments_per_floor, has_elevator, has_parking, status)
VALUES (v_property_id, 'Block B', 'B', 5, 14, true, false, 'active')
RETURNING id INTO v_building_b;

INSERT INTO buildings (property_id, name, code, floors, apartments_per_floor, has_elevator, has_parking, status)
VALUES (v_property_id, 'Block C', 'C', 5, 14, true, true, 'active')
RETURNING id INTO v_building_c;

-- ============================================================
-- 3. Apartment Types
-- ============================================================
INSERT INTO apartment_types (property_id, name, slug, description, bedrooms, bathrooms, max_occupancy, size_sqm, base_weekly_rate_gbp, amenities)
VALUES (v_property_id, 'Studio', 'studio', 'Compact studio with kitchenette, perfect for solo travellers and couples', 0, 1, 2, 35.0, 280.00, '["WiFi", "AC", "Kitchenette", "Smart TV", "Safe"]')
RETURNING id INTO v_type_studio;

INSERT INTO apartment_types (property_id, name, slug, description, bedrooms, bathrooms, max_occupancy, size_sqm, base_weekly_rate_gbp, amenities)
VALUES (v_property_id, '1-Bed Apartment', '1-bed', 'Spacious one-bedroom with separate living area and full kitchen', 1, 1, 3, 55.0, 450.00, '["WiFi", "AC", "Full Kitchen", "Washing Machine", "Smart TV", "Balcony", "Safe"]')
RETURNING id INTO v_type_1bed;

INSERT INTO apartment_types (property_id, name, slug, description, bedrooms, bathrooms, max_occupancy, size_sqm, base_weekly_rate_gbp, amenities)
VALUES (v_property_id, '2-Bed Apartment', '2-bed', 'Family-sized two-bedroom with living room, dining area, and full kitchen', 2, 2, 5, 85.0, 650.00, '["WiFi", "AC", "Full Kitchen", "Washing Machine", "Dryer", "Smart TV", "Balcony", "Safe", "Dishwasher"]')
RETURNING id INTO v_type_2bed;

INSERT INTO apartment_types (property_id, name, slug, description, bedrooms, bathrooms, max_occupancy, size_sqm, base_weekly_rate_gbp, amenities)
VALUES (v_property_id, 'Penthouse', 'penthouse', 'Premium top-floor penthouse with panoramic sea views and luxury finishes', 3, 2, 4, 120.0, 1200.00, '["WiFi", "AC", "Full Kitchen", "Washing Machine", "Dryer", "Smart TV", "Large Terrace", "Hot Tub", "Safe", "Dishwasher", "Wine Cooler"]')
RETURNING id INTO v_type_penthouse;

-- ============================================================
-- 4. Apartments (270 units: 180 studios, 76 one-bed, 10 two-bed, 4 penthouses)
-- ============================================================
v_apt_ids := ARRAY[]::UUID[];
v_blocks := ARRAY[v_building_a, v_building_b, v_building_c];

FOR v_b IN 1..3 LOOP
  -- Studios: 60 per block = 180 total (floors 0-3, 15 per floor)
  FOR v_f IN 0..3 LOOP
    FOR v_u IN 1..15 LOOP
      v_n := v_n + 1;
      INSERT INTO apartments (property_id, building_id, apartment_type_id, number, floor, view_type, status)
      VALUES (
        v_property_id, v_blocks[v_b], v_type_studio,
        v_codes[v_b] || v_f || LPAD(v_u::TEXT, 2, '0'),
        v_f,
        v_views[1 + (v_n % 5)],
        v_apt_statuses[1 + (v_n % 9)]
      );
    END LOOP;
  END LOOP;

  -- 1-Beds: 26 + 26 + 24 = 76 total (floors 1-4)
  -- Block A: 7+7+6+6=26, Block B: 7+7+6+6=26, Block C: 7+7+5+5=24
  FOR v_f IN 1..4 LOOP
    FOR v_u IN 1..7 LOOP
      IF (v_f <= 2 AND v_u <= 7) OR (v_f >= 3 AND v_b <= 2 AND v_u <= 6) OR (v_f >= 3 AND v_b = 3 AND v_u <= 5) THEN
        v_n := v_n + 1;
        INSERT INTO apartments (property_id, building_id, apartment_type_id, number, floor, view_type, status)
        VALUES (
          v_property_id, v_blocks[v_b], v_type_1bed,
          v_codes[v_b] || v_f || LPAD((15 + v_u)::TEXT, 2, '0'),
          v_f,
          v_views[1 + ((v_n + v_f) % 5)],
          v_apt_statuses[1 + (v_n % 9)]
        );
      END IF;
    END LOOP;
  END LOOP;

  -- 2-Beds: 4 + 4 + 2 = 10 total (floors 3-4)
  FOR v_u IN 1..4 LOOP
    IF NOT (v_b = 3 AND v_u > 2) THEN
      v_n := v_n + 1;
      INSERT INTO apartments (property_id, building_id, apartment_type_id, number, floor, view_type, status)
      VALUES (
        v_property_id, v_blocks[v_b], v_type_2bed,
        v_codes[v_b] || (3 + (v_u - 1) / 2) || LPAD((21 + v_u)::TEXT, 2, '0'),
        3 + (v_u - 1) / 2,
        'sea',
        v_apt_statuses[1 + (v_n % 9)]
      );
    END IF;
  END LOOP;

  -- Penthouses: 2 in A, 2 in B = 4 total (floor 4)
  IF v_b <= 2 THEN
    FOR v_u IN 1..2 LOOP
      INSERT INTO apartments (property_id, building_id, apartment_type_id, number, floor, view_type, status)
      VALUES (
        v_property_id, v_blocks[v_b], v_type_penthouse,
        v_codes[v_b] || '4' || LPAD((25 + v_u)::TEXT, 2, '0'),
        4, 'sea', 'available'
      );
    END LOOP;
  END IF;
END LOOP;

-- ============================================================
-- 5. Booking Channels
-- ============================================================
INSERT INTO booking_channels (name, code, commission_rate) VALUES
  ('Direct', 'direct', 0.00) RETURNING id INTO v_channel_direct;
INSERT INTO booking_channels (name, code, commission_rate) VALUES
  ('Booking.com', 'booking_com', 15.00) RETURNING id INTO v_channel_booking;
INSERT INTO booking_channels (name, code, commission_rate) VALUES
  ('Airbnb', 'airbnb', 14.00) RETURNING id INTO v_channel_airbnb;
INSERT INTO booking_channels (name, code, commission_rate) VALUES
  ('Expedia', 'expedia', 18.00) RETURNING id INTO v_channel_expedia;
INSERT INTO booking_channels (name, code, commission_rate) VALUES
  ('Phone', 'phone', 0.00) RETURNING id INTO v_channel_phone;
INSERT INTO booking_channels (name, code, commission_rate) VALUES
  ('Walk-in', 'walkin', 0.00) RETURNING id INTO v_channel_walkin;

-- ============================================================
-- 6. Guest Segments
-- ============================================================
INSERT INTO guest_segments (name, code, description) VALUES
  ('UK/EU Tourist', 'tourist', 'Short to medium stay holiday guests from UK and Europe')
  RETURNING id INTO v_segment_tourist;
INSERT INTO guest_segments (name, code, description) VALUES
  ('Digital Nomad', 'nomad', 'Remote workers on extended stays, typically 14-90 days')
  RETURNING id INTO v_segment_nomad;
INSERT INTO guest_segments (name, code, description) VALUES
  ('Egyptian Domestic', 'domestic', 'Egyptian residents on holiday or weekend breaks')
  RETURNING id INTO v_segment_domestic;
INSERT INTO guest_segments (name, code, description) VALUES
  ('Corporate', 'corporate', 'Business travellers and corporate bookings')
  RETURNING id INTO v_segment_corporate;

-- ============================================================
-- 7. Guests (10)
-- ============================================================
v_guest_ids := ARRAY[]::UUID[];

INSERT INTO guests (segment_id, first_name, last_name, email, phone, nationality, language, preferred_currency, city, country, postcode, loyalty_tier, loyalty_points, total_stays, total_nights, total_spend_gbp, marketing_consent)
VALUES
  (v_segment_tourist, 'James', 'Wilson', 'james.wilson@gmail.com', '+447700900001', 'GB', 'en', 'GBP', 'Manchester', 'GB', 'M1 1AA', 'gold', 5200, 4, 56, 8400.00, true),
  (v_segment_tourist, 'Sarah', 'Mueller', 'sarah.mueller@web.de', '+49170000002', 'DE', 'de', 'EUR', 'Berlin', 'DE', '10115', 'silver', 2100, 2, 21, 3150.00, true),
  (v_segment_nomad, 'Alex', 'Thompson', 'alex@remotework.io', '+447700900003', 'GB', 'en', 'GBP', 'London', 'GB', 'EC1A 1BB', 'platinum', 18500, 6, 180, 27000.00, true),
  (v_segment_tourist, 'Elena', 'Petrova', 'elena.petrova@mail.ru', '+79001234567', 'RU', 'ru', 'USD', 'Moscow', 'RU', '101000', 'bronze', 800, 1, 14, 1200.00, false),
  (v_segment_domestic, 'Ahmed', 'Hassan', 'ahmed.hassan@gmail.com', '+201001234567', 'EG', 'ar', 'EGP', 'Cairo', 'EG', '11511', 'bronze', 300, 1, 3, 450.00, true),
  (v_segment_corporate, 'David', 'Chen', 'david.chen@techcorp.com', '+447700900006', 'GB', 'en', 'GBP', 'London', 'GB', 'SW1A 1AA', 'silver', 3800, 3, 30, 5700.00, false),
  (v_segment_tourist, 'Maria', 'Garcia', 'maria.garcia@outlook.es', '+34600000007', 'ES', 'en', 'EUR', 'Madrid', 'ES', '28001', 'bronze', 400, 1, 7, 650.00, true),
  (v_segment_nomad, 'Lisa', 'Anderson', 'lisa@freelance.dev', '+46701234568', 'SE', 'en', 'EUR', 'Stockholm', 'SE', '11120', 'gold', 7500, 3, 90, 11250.00, true),
  (v_segment_domestic, 'Omar', 'Farouk', 'omar.farouk@yahoo.com', '+201112345678', 'EG', 'ar', 'EGP', 'Alexandria', 'EG', '21500', 'bronze', 150, 1, 2, 200.00, false),
  (v_segment_corporate, 'Sophie', 'Laurent', 'sophie.laurent@bigco.fr', '+33600000010', 'FR', 'en', 'EUR', 'Paris', 'FR', '75001', 'silver', 2800, 2, 28, 4200.00, true);

-- Store guest IDs for booking references
SELECT array_agg(id ORDER BY created_at) INTO v_guest_ids FROM guests;

-- ============================================================
-- 8. Staff (5)
-- ============================================================
INSERT INTO staff (auth_user_id, property_id, first_name, last_name, email, phone, role, department, language, hire_date)
VALUES (v_owner_auth_id, v_property_id, 'Tariq', 'Bastet', 'owner@bastet.com', '+447700900100', 'owner', 'management', 'en', '2025-01-01')
RETURNING id INTO v_staff_owner;

INSERT INTO staff (auth_user_id, property_id, first_name, last_name, email, phone, role, department, language, hire_date)
VALUES (v_manager_auth_id, v_property_id, 'Nadia', 'El-Sayed', 'manager@bastet.com', '+201001234500', 'manager', 'management', 'ar', '2025-06-01')
RETURNING id INTO v_staff_manager;

INSERT INTO staff (auth_user_id, property_id, first_name, last_name, email, phone, role, department, language, hire_date)
VALUES (v_reception_auth_id, v_property_id, 'Youssef', 'Ibrahim', 'reception@bastet.com', '+201001234501', 'receptionist', 'front_desk', 'ar', '2025-09-01')
RETURNING id INTO v_staff_reception;

INSERT INTO staff (auth_user_id, property_id, first_name, last_name, email, phone, role, department, language, hire_date)
VALUES (v_housekeeping_auth_id, v_property_id, 'Fatma', 'Ali', 'housekeeping@bastet.com', '+201001234502', 'housekeeping', 'housekeeping', 'ar', '2025-09-01')
RETURNING id INTO v_staff_hk;

INSERT INTO staff (auth_user_id, property_id, first_name, last_name, email, phone, role, department, language, hire_date)
VALUES (v_maintenance_auth_id, v_property_id, 'Hassan', 'Mohamed', 'maintenance@bastet.com', '+201001234503', 'maintenance', 'maintenance', 'ar', '2025-10-01')
RETURNING id INTO v_staff_maint;

-- ============================================================
-- 9. Rates (3 seasons)
-- ============================================================
-- Low season (Nov-Feb)
INSERT INTO rates (property_id, apartment_type_id, season_name, start_date, end_date, weekly_rate_gbp, nightly_rate_gbp, min_stay_nights) VALUES
  (v_property_id, v_type_studio, 'Low Season', '2026-11-01', '2027-02-28', 210.00, 35.00, 1),
  (v_property_id, v_type_1bed, 'Low Season', '2026-11-01', '2027-02-28', 340.00, 55.00, 1),
  (v_property_id, v_type_2bed, 'Low Season', '2026-11-01', '2027-02-28', 490.00, 80.00, 1),
  (v_property_id, v_type_penthouse, 'Low Season', '2026-11-01', '2027-02-28', 900.00, 150.00, 3);

-- Mid season (Mar-May, Sep-Oct)
INSERT INTO rates (property_id, apartment_type_id, season_name, start_date, end_date, weekly_rate_gbp, nightly_rate_gbp, min_stay_nights) VALUES
  (v_property_id, v_type_studio, 'Mid Season', '2026-03-01', '2026-05-31', 280.00, 45.00, 1),
  (v_property_id, v_type_1bed, 'Mid Season', '2026-03-01', '2026-05-31', 450.00, 70.00, 1),
  (v_property_id, v_type_2bed, 'Mid Season', '2026-03-01', '2026-05-31', 650.00, 100.00, 1),
  (v_property_id, v_type_penthouse, 'Mid Season', '2026-03-01', '2026-05-31', 1200.00, 190.00, 3);

-- High season (Jun-Aug)
INSERT INTO rates (property_id, apartment_type_id, season_name, start_date, end_date, weekly_rate_gbp, nightly_rate_gbp, min_stay_nights) VALUES
  (v_property_id, v_type_studio, 'High Season', '2026-06-01', '2026-08-31', 350.00, 55.00, 1),
  (v_property_id, v_type_1bed, 'High Season', '2026-06-01', '2026-08-31', 560.00, 85.00, 1),
  (v_property_id, v_type_2bed, 'High Season', '2026-06-01', '2026-08-31', 800.00, 125.00, 1),
  (v_property_id, v_type_penthouse, 'High Season', '2026-06-01', '2026-08-31', 1500.00, 230.00, 3);

-- ============================================================
-- 10. Sample Bookings (15) — using apartment numbers to find IDs
-- ============================================================
INSERT INTO bookings (property_id, apartment_id, guest_id, channel_id, reference, status, check_in, check_out, adults, children, rate_per_night_gbp, discount_percentage, total_amount_gbp, guest_currency, special_requests)
SELECT v_property_id, a.id, v_guest_ids[1], v_channel_direct, 'BAS-HRG-260001', 'checked_in', '2026-03-01', '2026-03-15', 2, 0, 63.00, 10.00, 793.80, 'GBP', 'High floor, sea view please'
FROM apartments a WHERE a.number = 'A301' AND a.property_id = v_property_id;

INSERT INTO bookings (property_id, apartment_id, guest_id, channel_id, reference, status, check_in, check_out, adults, children, rate_per_night_gbp, discount_percentage, total_amount_gbp, guest_currency)
SELECT v_property_id, a.id, v_guest_ids[2], v_channel_booking, 'BAS-HRG-260002', 'confirmed', '2026-03-20', '2026-03-27', 1, 0, 45.00, 0.00, 315.00, 'EUR'
FROM apartments a WHERE a.number = 'A101' AND a.property_id = v_property_id;

INSERT INTO bookings (property_id, apartment_id, guest_id, channel_id, reference, status, check_in, check_out, adults, children, rate_per_night_gbp, discount_percentage, total_amount_gbp, guest_currency)
SELECT v_property_id, a.id, v_guest_ids[3], v_channel_direct, 'BAS-HRG-260003', 'checked_in', '2026-02-15', '2026-04-15', 1, 0, 54.00, 20.00, 2592.00, 'GBP'
FROM apartments a WHERE a.number = 'B301' AND a.property_id = v_property_id;

INSERT INTO bookings (property_id, apartment_id, guest_id, channel_id, reference, status, check_in, check_out, adults, children, rate_per_night_gbp, discount_percentage, total_amount_gbp, guest_currency)
SELECT v_property_id, a.id, v_guest_ids[4], v_channel_airbnb, 'BAS-HRG-260004', 'confirmed', '2026-04-01', '2026-04-15', 2, 0, 63.00, 10.00, 793.80, 'USD'
FROM apartments a WHERE a.number = 'A201' AND a.property_id = v_property_id;

INSERT INTO bookings (property_id, apartment_id, guest_id, channel_id, reference, status, check_in, check_out, adults, children, rate_per_night_gbp, discount_percentage, total_amount_gbp, guest_currency)
SELECT v_property_id, a.id, v_guest_ids[5], v_channel_phone, 'BAS-HRG-260005', 'pending', '2026-03-25', '2026-03-28', 2, 1, 45.00, 0.00, 135.00, 'EGP'
FROM apartments a WHERE a.number = 'C101' AND a.property_id = v_property_id;

INSERT INTO bookings (property_id, apartment_id, guest_id, channel_id, reference, status, check_in, check_out, adults, children, rate_per_night_gbp, discount_percentage, total_amount_gbp, guest_currency)
SELECT v_property_id, a.id, v_guest_ids[6], v_channel_direct, 'BAS-HRG-260006', 'checked_in', '2026-03-05', '2026-04-02', 1, 0, 85.00, 20.00, 1904.00, 'GBP'
FROM apartments a WHERE a.number = 'A202' AND a.property_id = v_property_id;

INSERT INTO bookings (property_id, apartment_id, guest_id, channel_id, reference, status, check_in, check_out, adults, children, rate_per_night_gbp, discount_percentage, total_amount_gbp, guest_currency)
SELECT v_property_id, a.id, v_guest_ids[7], v_channel_booking, 'BAS-HRG-260007', 'confirmed', '2026-03-18', '2026-03-25', 2, 0, 45.00, 5.00, 299.25, 'EUR'
FROM apartments a WHERE a.number = 'B101' AND a.property_id = v_property_id;

INSERT INTO bookings (property_id, apartment_id, guest_id, channel_id, reference, status, check_in, check_out, adults, children, rate_per_night_gbp, discount_percentage, total_amount_gbp, guest_currency)
SELECT v_property_id, a.id, v_guest_ids[8], v_channel_direct, 'BAS-HRG-260008', 'checked_in', '2026-02-01', '2026-05-01', 1, 0, 54.00, 20.00, 3844.80, 'EUR'
FROM apartments a WHERE a.number = 'B201' AND a.property_id = v_property_id;

INSERT INTO bookings (property_id, apartment_id, guest_id, channel_id, reference, status, check_in, check_out, adults, children, rate_per_night_gbp, discount_percentage, total_amount_gbp, guest_currency)
SELECT v_property_id, a.id, v_guest_ids[9], v_channel_walkin, 'BAS-HRG-260009', 'checked_out', '2026-03-05', '2026-03-07', 2, 0, 45.00, 0.00, 90.00, 'EGP'
FROM apartments a WHERE a.number = 'C202' AND a.property_id = v_property_id;

INSERT INTO bookings (property_id, apartment_id, guest_id, channel_id, reference, status, check_in, check_out, adults, children, rate_per_night_gbp, discount_percentage, total_amount_gbp, guest_currency)
SELECT v_property_id, a.id, v_guest_ids[10], v_channel_expedia, 'BAS-HRG-260010', 'confirmed', '2026-04-10', '2026-04-24', 1, 0, 63.00, 10.00, 793.80, 'EUR'
FROM apartments a WHERE a.number = 'C301' AND a.property_id = v_property_id;

INSERT INTO bookings (property_id, apartment_id, guest_id, channel_id, reference, status, check_in, check_out, adults, children, rate_per_night_gbp, discount_percentage, total_amount_gbp, guest_currency)
SELECT v_property_id, a.id, v_guest_ids[1], v_channel_direct, 'BAS-HRG-260011', 'checked_out', '2026-01-10', '2026-01-24', 2, 0, 50.00, 10.00, 630.00, 'GBP'
FROM apartments a WHERE a.number = 'A102' AND a.property_id = v_property_id;

INSERT INTO bookings (property_id, apartment_id, guest_id, channel_id, reference, status, check_in, check_out, adults, children, rate_per_night_gbp, discount_percentage, total_amount_gbp, guest_currency)
SELECT v_property_id, a.id, v_guest_ids[3], v_channel_direct, 'BAS-HRG-260012', 'cancelled', '2026-05-01', '2026-05-15', 1, 0, 70.00, 10.00, 882.00, 'GBP'
FROM apartments a WHERE a.number = 'A401' AND a.property_id = v_property_id;

INSERT INTO bookings (property_id, apartment_id, guest_id, channel_id, reference, status, check_in, check_out, adults, children, rate_per_night_gbp, discount_percentage, total_amount_gbp, guest_currency)
SELECT v_property_id, a.id, v_guest_ids[5], v_channel_phone, 'BAS-HRG-260013', 'no_show', '2026-03-10', '2026-03-12', 2, 2, 100.00, 0.00, 200.00, 'EGP'
FROM apartments a WHERE a.number = 'C201' AND a.property_id = v_property_id;

INSERT INTO bookings (property_id, apartment_id, guest_id, channel_id, reference, status, check_in, check_out, adults, children, rate_per_night_gbp, discount_percentage, total_amount_gbp, guest_currency)
SELECT v_property_id, a.id, v_guest_ids[2], v_channel_booking, 'BAS-HRG-260014', 'pending', '2026-04-05', '2026-04-12', 1, 0, 45.00, 5.00, 299.25, 'EUR'
FROM apartments a WHERE a.number = 'B202' AND a.property_id = v_property_id;

INSERT INTO bookings (property_id, apartment_id, guest_id, channel_id, reference, status, check_in, check_out, adults, children, rate_per_night_gbp, discount_percentage, total_amount_gbp, guest_currency)
SELECT v_property_id, a.id, v_guest_ids[10], v_channel_direct, 'BAS-HRG-260015', 'pending', '2026-06-15', '2026-06-29', 2, 0, 85.00, 10.00, 1071.00, 'EUR'
FROM apartments a WHERE a.number = 'A102' AND a.property_id = v_property_id;

-- ============================================================
-- 11. Partners (5)
-- ============================================================
DECLARE
  v_partner_beach UUID;
  v_partner_dive UUID;
  v_partner_desert UUID;
  v_partner_spa UUID;
  v_partner_restaurant UUID;
BEGIN

INSERT INTO partners (property_id, name, type, contact_name, contact_email, contact_phone, commission_rate, quality_score, status, contract_start)
VALUES (v_property_id, 'Red Sea Divers', 'excursion_operator', 'Captain Ahmed', 'info@redseadivers.com', '+201001111111', 15.00, 4.8, 'active', '2026-01-01')
RETURNING id INTO v_partner_dive;

INSERT INTO partners (property_id, name, type, contact_name, contact_email, contact_phone, commission_rate, quality_score, status, contract_start)
VALUES (v_property_id, 'Desert Safari Egypt', 'excursion_operator', 'Mohamed Ali', 'book@desertsafari.eg', '+201002222222', 12.00, 4.5, 'active', '2026-01-01')
RETURNING id INTO v_partner_desert;

INSERT INTO partners (property_id, name, type, contact_name, contact_email, contact_phone, commission_rate, quality_score, status, contract_start)
VALUES (v_property_id, 'Soma Bay Beach Club', 'beach_club', 'Layla Nasser', 'info@somabaybeach.com', '+201003333333', 10.00, 4.7, 'active', '2026-02-01')
RETURNING id INTO v_partner_beach;

INSERT INTO partners (property_id, name, type, contact_name, contact_email, contact_phone, commission_rate, quality_score, status, contract_start)
VALUES (v_property_id, 'Cleopatra Spa', 'spa', 'Hana Ibrahim', 'bookings@cleopatraspa.eg', '+201004444444', 20.00, 4.3, 'active', '2026-01-15')
RETURNING id INTO v_partner_spa;

INSERT INTO partners (property_id, name, type, contact_name, contact_email, contact_phone, commission_rate, quality_score, status, contract_start)
VALUES (v_property_id, 'The Catch Seafood', 'restaurant', 'Chef Karim', 'reserve@thecatch.eg', '+201005555555', 8.00, 4.6, 'active', '2026-02-15')
RETURNING id INTO v_partner_restaurant;

-- ============================================================
-- 12. Excursions (3)
-- ============================================================
INSERT INTO excursions (property_id, partner_id, name, slug, description, short_description, type, duration_hours, price_gbp, price_egp, max_participants, difficulty, includes, meeting_point, average_rating, total_reviews)
VALUES
  (v_property_id, v_partner_dive, 'Red Sea Diving Adventure', 'red-sea-diving', 'Experience the spectacular coral reefs and marine life of the Red Sea with our certified PADI instructors. Suitable for beginners and experienced divers.', 'Explore stunning coral reefs with PADI-certified guides', 'water_sports', 4.0, 65.00, 4000.00, 12, 'moderate', ARRAY['Equipment rental', 'PADI instructor', 'Boat transfer', 'Snacks & drinks', 'Underwater photos'], 'Hurghada Marina, Dock 5', 4.80, 156),
  (v_property_id, v_partner_desert, 'Desert Safari & Bedouin Camp', 'desert-safari', 'Thrilling quad bike ride through the Eastern Desert, followed by a traditional Bedouin dinner under the stars with live entertainment.', 'Quad bikes, Bedouin dinner, and stargazing', 'desert', 6.0, 45.00, 2800.00, 20, 'easy', ARRAY['Quad bike & helmet', 'Bedouin dinner', 'Tea ceremony', 'Camel ride', 'Hotel pickup'], 'Hotel lobby pickup', 4.50, 89),
  (v_property_id, v_partner_dive, 'Glass Bottom Boat Tour', 'glass-bottom-boat', 'See the beautiful coral reefs without getting wet! Perfect for families and non-swimmers. Includes snorkelling stop.', 'See coral reefs from a glass-bottom boat', 'water_sports', 3.0, 25.00, 1500.00, 30, 'easy', ARRAY['Boat trip', 'Snorkelling equipment', 'Soft drinks', 'Snorkelling stop'], 'Hurghada Marina, Dock 3', 4.30, 234);

-- Beach partnership
INSERT INTO beach_partnerships (property_id, partner_id, beach_name, location, day_pass_price_gbp, includes, shuttle_available, shuttle_duration_mins, max_daily_capacity)
VALUES (v_property_id, v_partner_beach, 'Soma Bay Beach', 'Soma Bay, 30km south of Hurghada', 15.00, ARRAY['Sunbed', 'Umbrella', 'Towel', 'Pool access', 'WiFi'], true, 25, 100);

-- ============================================================
-- 13. Shuttle Routes (2)
-- ============================================================
DECLARE v_route_airport UUID; v_route_beach UUID;
BEGIN

INSERT INTO shuttle_routes (property_id, name, description, origin, destination, estimated_duration_mins, distance_km, price_per_person_gbp, vehicle_capacity)
VALUES (v_property_id, 'Airport Transfer', 'Hurghada International Airport to Bastet Aparthotels', 'Hurghada International Airport (HRG)', 'Bastet Aparthotels', 20, 12.5, 10.00, 8)
RETURNING id INTO v_route_airport;

INSERT INTO shuttle_routes (property_id, name, description, origin, destination, estimated_duration_mins, distance_km, price_per_person_gbp, vehicle_capacity)
VALUES (v_property_id, 'Beach Shuttle', 'Bastet Aparthotels to Soma Bay Beach Club', 'Bastet Aparthotels', 'Soma Bay Beach Club', 25, 30.0, 5.00, 12)
RETURNING id INTO v_route_beach;

-- Beach shuttle schedules (daily departures)
INSERT INTO shuttle_schedules (route_id, day_of_week, departure_time) VALUES
  (v_route_beach, 0, '09:00'), (v_route_beach, 0, '11:00'), (v_route_beach, 0, '14:00'),
  (v_route_beach, 1, '09:00'), (v_route_beach, 1, '11:00'), (v_route_beach, 1, '14:00'),
  (v_route_beach, 2, '09:00'), (v_route_beach, 2, '11:00'), (v_route_beach, 2, '14:00'),
  (v_route_beach, 3, '09:00'), (v_route_beach, 3, '11:00'), (v_route_beach, 3, '14:00'),
  (v_route_beach, 4, '09:00'), (v_route_beach, 4, '11:00'), (v_route_beach, 4, '14:00'),
  (v_route_beach, 5, '09:00'), (v_route_beach, 5, '11:00'), (v_route_beach, 5, '14:00'),
  (v_route_beach, 6, '09:00'), (v_route_beach, 6, '11:00'), (v_route_beach, 6, '14:00');

END; -- shuttle routes block

-- ============================================================
-- 14. Housekeeping Tasks (5)
-- ============================================================
INSERT INTO housekeeping_tasks (property_id, apartment_id, assigned_to, type, status, priority, scheduled_date)
SELECT v_property_id, a.id, v_staff_hk, 'checkout_clean', 'pending', 'high', CURRENT_DATE
FROM apartments a WHERE a.number = 'A401' AND a.property_id = v_property_id;

INSERT INTO housekeeping_tasks (property_id, apartment_id, assigned_to, type, status, priority, scheduled_date)
SELECT v_property_id, a.id, v_staff_hk, 'midstay_clean', 'in_progress', 'normal', CURRENT_DATE
FROM apartments a WHERE a.number = 'A301' AND a.property_id = v_property_id;

INSERT INTO housekeeping_tasks (property_id, apartment_id, type, status, priority, scheduled_date)
SELECT v_property_id, a.id, 'midstay_clean', 'pending', 'normal', CURRENT_DATE + 1
FROM apartments a WHERE a.number = 'B301' AND a.property_id = v_property_id;

INSERT INTO housekeeping_tasks (property_id, apartment_id, type, status, priority, scheduled_date)
SELECT v_property_id, a.id, 'deep_clean', 'pending', 'low', CURRENT_DATE + 2
FROM apartments a WHERE a.number = 'C202' AND a.property_id = v_property_id;

INSERT INTO housekeeping_tasks (property_id, apartment_id, assigned_to, type, status, priority, scheduled_date)
SELECT v_property_id, a.id, v_staff_hk, 'inspection', 'pending', 'normal', CURRENT_DATE
FROM apartments a WHERE a.number = 'B201' AND a.property_id = v_property_id;

-- ============================================================
-- 15. Maintenance Requests (3)
-- ============================================================
INSERT INTO maintenance_requests (property_id, apartment_id, reported_by_staff, category, priority, status, title, description)
SELECT v_property_id, a.id, v_staff_reception, 'plumbing', 'high', 'open', 'Bathroom tap leaking', 'Guest reported constant dripping from the bathroom sink tap. Needs washer replacement.'
FROM apartments a WHERE a.number = 'B102' AND a.property_id = v_property_id;

INSERT INTO maintenance_requests (property_id, apartment_id, reported_by_staff, assigned_to, category, priority, status, title, description)
SELECT v_property_id, a.id, v_staff_manager, v_staff_maint, 'hvac', 'normal', 'assigned', 'AC not cooling efficiently', 'AC in unit A202 is running but not reaching set temperature. May need filter cleaning or gas refill.'
FROM apartments a WHERE a.number = 'A202' AND a.property_id = v_property_id;

INSERT INTO maintenance_requests (property_id, apartment_id, reported_by_staff, assigned_to, category, priority, status, title, description, started_at)
SELECT v_property_id, a.id, v_staff_hk, v_staff_maint, 'electrical', 'urgent', 'in_progress', 'Bathroom light flickering', 'Bathroom ceiling light in C102 is flickering intermittently. May be a loose connection.', NOW() - INTERVAL '2 hours'
FROM apartments a WHERE a.number = 'C102' AND a.property_id = v_property_id;

-- ============================================================
-- 16. Currency Rates
-- ============================================================
INSERT INTO currency_rates (base_currency, target_currency, rate, source) VALUES
  ('GBP', 'EUR', 1.1700, 'manual_seed'),
  ('GBP', 'USD', 1.2700, 'manual_seed'),
  ('GBP', 'EGP', 62.5000, 'manual_seed');

END; -- partners block

END $$; -- main block
