-- ============================================================
-- Migration 00008: Shuttle & Transport Module (3 tables)
-- Tables: shuttle_routes, shuttle_schedules, shuttle_bookings
-- ============================================================

-- 1. shuttle_routes
CREATE TABLE shuttle_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  origin_latitude DECIMAL(10,7),
  origin_longitude DECIMAL(10,7),
  destination_latitude DECIMAL(10,7),
  destination_longitude DECIMAL(10,7),
  estimated_duration_mins INT NOT NULL,
  distance_km DECIMAL(6,1),
  price_per_person_gbp DECIMAL(10,2) NOT NULL DEFAULT 0,
  vehicle_capacity INT NOT NULL DEFAULT 12,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER shuttle_routes_updated_at
  BEFORE UPDATE ON shuttle_routes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. shuttle_schedules
CREATE TABLE shuttle_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES shuttle_routes(id) ON DELETE CASCADE,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  departure_time TIME NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(route_id, day_of_week, departure_time)
);

-- 3. shuttle_bookings
CREATE TABLE shuttle_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES shuttle_schedules(id),
  guest_id UUID NOT NULL REFERENCES guests(id),
  booking_id UUID REFERENCES bookings(id),
  travel_date DATE NOT NULL,
  passengers INT NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
  pickup_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
