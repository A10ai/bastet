-- ============================================================
-- Migration 00006: Experience Marketplace Module (6 tables)
-- Tables: partners, partner_certifications, excursions,
--         excursion_bookings, beach_partnerships, flash_deals
-- ============================================================

-- 1. partners
CREATE TABLE partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id),
  name VARCHAR(100) NOT NULL,
  type VARCHAR(30) NOT NULL
    CHECK (type IN ('beach_club', 'excursion_operator', 'restaurant', 'spa', 'transport', 'retail', 'other')),
  contact_name VARCHAR(100),
  contact_email VARCHAR(100),
  contact_phone VARCHAR(20),
  address TEXT,
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  commission_rate DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  quality_score DECIMAL(3,1) DEFAULT 5.0,
  total_bookings INT NOT NULL DEFAULT 0,
  total_revenue_gbp DECIMAL(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending', 'active', 'suspended', 'terminated')),
  auto_suspended BOOLEAN NOT NULL DEFAULT false,
  contract_start DATE,
  contract_end DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER partners_updated_at
  BEFORE UPDATE ON partners
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. partner_certifications
CREATE TABLE partner_certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL
    CHECK (type IN ('insurance', 'license', 'safety', 'environmental', 'quality', 'other')),
  name VARCHAR(100) NOT NULL,
  issuer VARCHAR(100),
  certificate_number VARCHAR(50),
  issued_date DATE NOT NULL,
  expiry_date DATE,
  document_url TEXT,
  is_valid BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. excursions
CREATE TABLE excursions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id),
  partner_id UUID NOT NULL REFERENCES partners(id),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  short_description VARCHAR(200),
  type VARCHAR(30) NOT NULL
    CHECK (type IN ('water_sports', 'desert', 'cultural', 'relaxation', 'adventure', 'food', 'nightlife', 'family')),
  duration_hours DECIMAL(4,1) NOT NULL,
  price_gbp DECIMAL(10,2) NOT NULL,
  price_egp DECIMAL(10,2),
  max_participants INT,
  min_participants INT DEFAULT 1,
  difficulty VARCHAR(10) DEFAULT 'easy'
    CHECK (difficulty IN ('easy', 'moderate', 'challenging', 'extreme')),
  includes TEXT[],
  excludes TEXT[],
  meeting_point TEXT,
  meeting_latitude DECIMAL(10,7),
  meeting_longitude DECIMAL(10,7),
  image_url TEXT,
  gallery_urls TEXT[],
  average_rating DECIMAL(3,2) DEFAULT 0,
  total_reviews INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(property_id, slug)
);

CREATE TRIGGER excursions_updated_at
  BEFORE UPDATE ON excursions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. excursion_bookings
CREATE TABLE excursion_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  excursion_id UUID NOT NULL REFERENCES excursions(id),
  guest_id UUID NOT NULL REFERENCES guests(id),
  booking_id UUID REFERENCES bookings(id),
  date DATE NOT NULL,
  participants INT NOT NULL DEFAULT 1,
  total_price_gbp DECIMAL(10,2) NOT NULL,
  commission_gbp DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
  special_requests TEXT,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. beach_partnerships
CREATE TABLE beach_partnerships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id),
  partner_id UUID NOT NULL REFERENCES partners(id),
  beach_name VARCHAR(100) NOT NULL,
  location TEXT,
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  day_pass_price_gbp DECIMAL(10,2) NOT NULL,
  includes TEXT[],
  shuttle_available BOOLEAN NOT NULL DEFAULT false,
  shuttle_duration_mins INT,
  max_daily_capacity INT,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER beach_partnerships_updated_at
  BEFORE UPDATE ON beach_partnerships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- R&D NOTE: Flash deals engine
-- Challenge: Real-time capacity-filling mechanism matching partner availability gaps with guest preferences
-- Approach: Time-limited offers (max 48hrs) with minimum 25% discount, linked to partner capacity
-- 6. flash_deals
CREATE TABLE flash_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id),
  partner_id UUID REFERENCES partners(id),
  excursion_id UUID REFERENCES excursions(id),
  title VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  original_price_gbp DECIMAL(10,2) NOT NULL,
  deal_price_gbp DECIMAL(10,2) NOT NULL,
  discount_percentage DECIMAL(5,2) NOT NULL,
  max_claims INT NOT NULL,
  current_claims INT NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (discount_percentage >= 25),
  CHECK (expires_at > starts_at),
  CHECK (expires_at <= starts_at + INTERVAL '48 hours')
);
