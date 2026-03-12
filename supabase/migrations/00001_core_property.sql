-- ============================================================
-- Migration 00001: Core Property Module (7 tables)
-- Tables: properties, buildings, apartment_types, apartments,
--         apartment_images, facilities, facility_bookings
-- ============================================================

-- Reusable trigger function for updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. properties
CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(50) NOT NULL UNIQUE,
  address TEXT NOT NULL,
  city VARCHAR(50) NOT NULL DEFAULT 'Hurghada',
  country VARCHAR(2) NOT NULL DEFAULT 'EG',
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  timezone VARCHAR(40) NOT NULL DEFAULT 'Africa/Cairo',
  default_currency VARCHAR(3) NOT NULL DEFAULT 'EGP',
  reporting_currency VARCHAR(3) NOT NULL DEFAULT 'GBP',
  star_rating SMALLINT DEFAULT 4,
  total_apartments INT NOT NULL DEFAULT 250,
  opening_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'construction'
    CHECK (status IN ('construction', 'pre_opening', 'active', 'maintenance', 'closed')),
  phone VARCHAR(20),
  email VARCHAR(100) NOT NULL,
  website VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER properties_updated_at
  BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. buildings
CREATE TABLE buildings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  code VARCHAR(10) NOT NULL,
  floors INT NOT NULL DEFAULT 7,
  apartments_per_floor INT NOT NULL DEFAULT 10,
  has_elevator BOOLEAN NOT NULL DEFAULT true,
  has_parking BOOLEAN NOT NULL DEFAULT false,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'maintenance', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(property_id, code)
);

CREATE TRIGGER buildings_updated_at
  BEFORE UPDATE ON buildings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3. apartment_types
CREATE TABLE apartment_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  slug VARCHAR(50) NOT NULL,
  description TEXT,
  bedrooms INT NOT NULL DEFAULT 0,
  bathrooms INT NOT NULL DEFAULT 1,
  max_occupancy INT NOT NULL DEFAULT 2,
  size_sqm DECIMAL(6,1),
  base_weekly_rate_gbp DECIMAL(10,2) NOT NULL,
  amenities JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(property_id, slug)
);

CREATE TRIGGER apartment_types_updated_at
  BEFORE UPDATE ON apartment_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. apartments
CREATE TABLE apartments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  apartment_type_id UUID NOT NULL REFERENCES apartment_types(id),
  number VARCHAR(10) NOT NULL,
  floor INT NOT NULL,
  view_type VARCHAR(30) DEFAULT 'garden'
    CHECK (view_type IN ('sea', 'pool', 'garden', 'city', 'partial_sea')),
  status VARCHAR(20) NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'occupied', 'maintenance', 'cleaning', 'blocked', 'out_of_service')),
  is_accessible BOOLEAN NOT NULL DEFAULT false,
  smart_lock_id VARCHAR(50),
  ac_unit_id VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(property_id, number)
);

CREATE TRIGGER apartments_updated_at
  BEFORE UPDATE ON apartments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. apartment_images
CREATE TABLE apartment_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apartment_id UUID REFERENCES apartments(id) ON DELETE CASCADE,
  apartment_type_id UUID REFERENCES apartment_types(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  alt_text VARCHAR(200),
  sort_order INT NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (apartment_id IS NOT NULL OR apartment_type_id IS NOT NULL)
);

-- 6. facilities
CREATE TABLE facilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(30) NOT NULL
    CHECK (type IN ('pool', 'restaurant', 'gym', 'spa', 'kids_club', 'parking', 'business_center', 'laundry', 'other')),
  description TEXT,
  capacity INT,
  opening_time TIME,
  closing_time TIME,
  is_reservable BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER facilities_updated_at
  BEFORE UPDATE ON facilities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 7. facility_bookings
-- Note: guest_id FK will be added in migration 00003 after guests table is created
CREATE TABLE facility_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  guest_id UUID, -- FK added in 00003
  booking_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  guests_count INT NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
