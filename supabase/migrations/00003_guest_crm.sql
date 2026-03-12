-- ============================================================
-- Migration 00003: Guest & CRM Module (7 tables)
-- Tables: guests, guest_preferences, guest_communications,
--         guest_activity_log, loyalty_programme, reviews, guest_segments
-- Also: ALTER facility_bookings and bookings to add guest FK
-- ============================================================

-- 1. guest_segments
CREATE TABLE guest_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL UNIQUE,
  code VARCHAR(20) NOT NULL UNIQUE,
  description TEXT,
  criteria JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. guests
CREATE TABLE guests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE,
  segment_id UUID REFERENCES guest_segments(id),
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  email VARCHAR(100) UNIQUE,
  phone VARCHAR(20),
  date_of_birth DATE,
  nationality VARCHAR(2),
  language VARCHAR(5) NOT NULL DEFAULT 'en',
  preferred_currency VARCHAR(3) NOT NULL DEFAULT 'GBP',
  passport_number VARCHAR(20),
  address_line1 VARCHAR(200),
  address_line2 VARCHAR(200),
  city VARCHAR(100),
  country VARCHAR(2),
  postcode VARCHAR(20),
  loyalty_tier VARCHAR(20) NOT NULL DEFAULT 'bronze'
    CHECK (loyalty_tier IN ('bronze', 'silver', 'gold', 'platinum')),
  loyalty_points INT NOT NULL DEFAULT 0,
  total_stays INT NOT NULL DEFAULT 0,
  total_nights INT NOT NULL DEFAULT 0,
  total_spend_gbp DECIMAL(12,2) NOT NULL DEFAULT 0,
  vip_status BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  marketing_consent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER guests_updated_at
  BEFORE UPDATE ON guests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- R&D NOTE: 58-field Guest Preference DNA
-- Challenge: Building a comprehensive guest preference profile that auto-learns
-- Approach: JSONB storage for flexible schema + typed fields for critical preferences
-- This enables AI-driven personalisation without rigid schema constraints
-- 3. guest_preferences (58-field Preference DNA)
CREATE TABLE guest_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id UUID NOT NULL UNIQUE REFERENCES guests(id) ON DELETE CASCADE,
  -- Accommodation preferences
  floor_preference VARCHAR(10) CHECK (floor_preference IN ('low', 'mid', 'high', 'any')),
  view_preference VARCHAR(20) CHECK (view_preference IN ('sea', 'pool', 'garden', 'city', 'any')),
  bed_type VARCHAR(20) CHECK (bed_type IN ('single', 'double', 'king', 'twin', 'any')),
  pillow_type VARCHAR(20) CHECK (pillow_type IN ('soft', 'firm', 'memory_foam', 'any')),
  mattress_firmness VARCHAR(10) CHECK (mattress_firmness IN ('soft', 'medium', 'firm', 'any')),
  -- Climate preferences
  ac_temperature_c INT CHECK (ac_temperature_c BETWEEN 16 AND 30),
  ac_mode VARCHAR(10) CHECK (ac_mode IN ('cool', 'heat', 'auto', 'fan')),
  -- Housekeeping preferences
  housekeeping_frequency VARCHAR(20) CHECK (housekeeping_frequency IN ('daily', 'every_other_day', 'twice_weekly', 'weekly', 'on_request')),
  housekeeping_time VARCHAR(20) CHECK (housekeeping_time IN ('morning', 'afternoon', 'evening', 'any')),
  towel_change_frequency VARCHAR(20),
  linen_change_frequency VARCHAR(20),
  -- Dietary preferences
  dietary_needs VARCHAR(50)[] DEFAULT '{}',
  food_allergies VARCHAR(50)[] DEFAULT '{}',
  cuisine_preferences VARCHAR(50)[] DEFAULT '{}',
  -- Beverage preferences
  coffee_type VARCHAR(30),
  tea_type VARCHAR(30),
  milk_preference VARCHAR(20),
  minibar_preferences JSONB DEFAULT '[]'::jsonb,
  -- Communication preferences
  contact_method VARCHAR(20) CHECK (contact_method IN ('email', 'phone', 'whatsapp', 'sms', 'app')),
  contact_language VARCHAR(5) DEFAULT 'en',
  notification_preferences JSONB DEFAULT '{"deals": true, "events": true, "reminders": true}'::jsonb,
  -- Activity preferences
  interests VARCHAR(50)[] DEFAULT '{}',
  activity_level VARCHAR(10) CHECK (activity_level IN ('relaxed', 'moderate', 'active', 'adventure')),
  pool_preference VARCHAR(20),
  beach_preference VARCHAR(20),
  spa_preferences JSONB DEFAULT '[]'::jsonb,
  -- Family preferences
  has_children BOOLEAN DEFAULT false,
  children_ages INT[] DEFAULT '{}',
  childcare_needed BOOLEAN DEFAULT false,
  -- Transport preferences
  airport_transfer BOOLEAN DEFAULT false,
  shuttle_preference VARCHAR(20),
  -- Special occasions
  anniversary_date DATE,
  birthday_celebrations BOOLEAN DEFAULT false,
  -- Arrival/departure
  typical_arrival_time TIME,
  typical_departure_time TIME,
  early_checkin_preference BOOLEAN DEFAULT false,
  late_checkout_preference BOOLEAN DEFAULT false,
  -- Extras (JSONB for flexible additional preferences)
  extra_preferences JSONB DEFAULT '{}'::jsonb,
  -- Meta
  auto_learned BOOLEAN NOT NULL DEFAULT false,
  confidence_score DECIMAL(3,2) DEFAULT 0.00,
  last_updated_from VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER guest_preferences_updated_at
  BEFORE UPDATE ON guest_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. guest_communications
CREATE TABLE guest_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL
    CHECK (type IN ('email', 'sms', 'whatsapp', 'push', 'in_app', 'phone_call')),
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  subject VARCHAR(200),
  body TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'sent'
    CHECK (status IN ('draft', 'sent', 'delivered', 'read', 'failed')),
  sent_by UUID, -- FK to staff added in 00004
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. guest_activity_log
CREATE TABLE guest_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  activity_type VARCHAR(30) NOT NULL,
  activity_detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  source VARCHAR(20) NOT NULL DEFAULT 'app'
    CHECK (source IN ('app', 'web', 'reception', 'system', 'iot')),
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. loyalty_programme
CREATE TABLE loyalty_programme (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  transaction_type VARCHAR(20) NOT NULL
    CHECK (transaction_type IN ('earn', 'redeem', 'expire', 'adjust', 'bonus')),
  points INT NOT NULL,
  balance_after INT NOT NULL,
  description VARCHAR(200) NOT NULL,
  reference_type VARCHAR(30),
  reference_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. reviews
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id),
  guest_id UUID NOT NULL REFERENCES guests(id),
  overall_rating SMALLINT NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  cleanliness_rating SMALLINT CHECK (cleanliness_rating BETWEEN 1 AND 5),
  location_rating SMALLINT CHECK (location_rating BETWEEN 1 AND 5),
  service_rating SMALLINT CHECK (service_rating BETWEEN 1 AND 5),
  value_rating SMALLINT CHECK (value_rating BETWEEN 1 AND 5),
  title VARCHAR(200),
  body TEXT,
  response TEXT,
  responded_at TIMESTAMPTZ,
  is_public BOOLEAN NOT NULL DEFAULT true,
  source VARCHAR(20) NOT NULL DEFAULT 'direct'
    CHECK (source IN ('direct', 'booking_com', 'airbnb', 'google', 'tripadvisor')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER reviews_updated_at
  BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Now add guest FK constraints to previously created tables
ALTER TABLE facility_bookings
  ADD CONSTRAINT fk_facility_bookings_guest
  FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE SET NULL;

ALTER TABLE bookings
  ADD CONSTRAINT fk_bookings_guest
  FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE SET NULL;
