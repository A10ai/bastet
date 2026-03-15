-- ============================================================
-- Reseed Apartments: 270 units (180 studios, 76 one-bed, 10 two-bed, 4 penthouses)
-- Run this in Supabase SQL Editor
-- ============================================================

-- Clear existing apartments (cascades to bookings, housekeeping, maintenance)
DELETE FROM housekeeping_tasks;
DELETE FROM maintenance_requests;
DELETE FROM bookings;
DELETE FROM apartments;

-- Update property total
UPDATE properties SET total_apartments = 270, address = 'Kawthar District, Hurghada' WHERE slug = 'bastet-hrg';

DO $$
DECLARE
  v_property_id UUID;
  v_building_a UUID;
  v_building_b UUID;
  v_building_c UUID;
  v_type_studio UUID;
  v_type_1bed UUID;
  v_type_2bed UUID;
  v_type_penthouse UUID;
  v_views TEXT[] := ARRAY['garden', 'pool', 'city', 'partial_sea', 'sea'];
  v_statuses TEXT[] := ARRAY['available', 'available', 'available', 'available', 'occupied', 'occupied', 'occupied', 'cleaning', 'maintenance'];
  v_b INT;
  v_f INT;
  v_u INT;
  v_n INT := 0;
  v_blocks UUID[];
  v_codes TEXT[] := ARRAY['A', 'B', 'C'];
BEGIN
  -- Get existing IDs
  SELECT id INTO v_property_id FROM properties WHERE slug = 'bastet-hrg';
  SELECT id INTO v_building_a FROM buildings WHERE code = 'A' AND property_id = v_property_id;
  SELECT id INTO v_building_b FROM buildings WHERE code = 'B' AND property_id = v_property_id;
  SELECT id INTO v_building_c FROM buildings WHERE code = 'C' AND property_id = v_property_id;
  SELECT id INTO v_type_studio FROM apartment_types WHERE slug = 'studio' AND property_id = v_property_id;
  SELECT id INTO v_type_1bed FROM apartment_types WHERE slug = '1-bed' AND property_id = v_property_id;
  SELECT id INTO v_type_2bed FROM apartment_types WHERE slug = '2-bed' AND property_id = v_property_id;
  SELECT id INTO v_type_penthouse FROM apartment_types WHERE slug = 'penthouse' AND property_id = v_property_id;

  v_blocks := ARRAY[v_building_a, v_building_b, v_building_c];

  -- Update building specs
  UPDATE buildings SET floors = 5, apartments_per_floor = 18 WHERE property_id = v_property_id;

  FOR v_b IN 1..3 LOOP

    -- ====== STUDIOS: 60 per block = 180 total ======
    -- Floors 0-3, 15 per floor
    FOR v_f IN 0..3 LOOP
      FOR v_u IN 1..15 LOOP
        v_n := v_n + 1;
        INSERT INTO apartments (property_id, building_id, apartment_type_id, number, floor, view_type, status)
        VALUES (
          v_property_id,
          v_blocks[v_b],
          v_type_studio,
          v_codes[v_b] || v_f || LPAD(v_u::TEXT, 2, '0'),
          v_f,
          v_views[1 + (v_n % 5)],
          v_statuses[1 + (v_n % 9)]
        );
      END LOOP;
    END LOOP;

    -- ====== 1-BEDS: 25 or 26 per block = 76 total ======
    -- Floors 1-4, 6 per floor (Block C floor 4 gets 5)
    FOR v_f IN 1..4 LOOP
      FOR v_u IN 1..CASE WHEN v_b = 3 AND v_f = 4 THEN 5 ELSE 6 END LOOP
        v_n := v_n + 1;
        INSERT INTO apartments (property_id, building_id, apartment_type_id, number, floor, view_type, status)
        VALUES (
          v_property_id,
          v_blocks[v_b],
          v_type_1bed,
          v_codes[v_b] || v_f || LPAD((15 + v_u)::TEXT, 2, '0'),
          v_f,
          v_views[1 + ((v_n + v_f) % 5)],
          v_statuses[1 + (v_n % 9)]
        );
      END LOOP;
    END LOOP;

    -- ====== 2-BEDS: 4 + 4 + 2 = 10 total ======
    -- Floors 3-4
    FOR v_u IN 1..CASE WHEN v_b <= 2 THEN 4 ELSE 2 END LOOP
      v_n := v_n + 1;
      INSERT INTO apartments (property_id, building_id, apartment_type_id, number, floor, view_type, status)
      VALUES (
        v_property_id,
        v_blocks[v_b],
        v_type_2bed,
        v_codes[v_b] || (3 + (v_u - 1) / 2) || LPAD((21 + v_u)::TEXT, 2, '0'),
        3 + (v_u - 1) / 2,
        'sea',
        v_statuses[1 + (v_n % 9)]
      );
    END LOOP;

    -- ====== PENTHOUSES: 2 in A, 2 in B = 4 total ======
    -- Floor 4 only
    IF v_b <= 2 THEN
      FOR v_u IN 1..2 LOOP
        INSERT INTO apartments (property_id, building_id, apartment_type_id, number, floor, view_type, status)
        VALUES (
          v_property_id,
          v_blocks[v_b],
          v_type_penthouse,
          v_codes[v_b] || '4' || LPAD((25 + v_u)::TEXT, 2, '0'),
          4,
          'sea',
          'available'
        );
      END LOOP;
    END IF;

  END LOOP;

  -- Log result
  RAISE NOTICE 'Created % apartments', v_n + 4;
END $$;

-- Verify counts
SELECT
  at.name AS type,
  COUNT(*) AS count
FROM apartments a
JOIN apartment_types at ON a.apartment_type_id = at.id
GROUP BY at.name
ORDER BY count DESC;

SELECT COUNT(*) AS total_apartments FROM apartments;
