-- ============================================================
-- Migration 00002: Bookings & Pricing Module (6 tables)
-- Tables: booking_channels, bookings, rates, availability,
--         promotions, booking_addons
-- ============================================================

-- 1. booking_channels
CREATE TABLE booking_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL UNIQUE,
  code VARCHAR(20) NOT NULL UNIQUE,
  commission_rate DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  is_active BOOLEAN NOT NULL DEFAULT true,
  api_connection JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER booking_channels_updated_at
  BEFORE UPDATE ON booking_channels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- R&D NOTE: Variable-length booking model
-- Challenge: No standard PMS handles 1-night to 6-month stays with tiered discounts
-- Approach: Store rates weekly, calculate nightly, apply breakpoint discounts at 7/14/21/28 nights
-- 2. bookings
-- Note: guest_id FK will be added in migration 00003
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id),
  apartment_id UUID NOT NULL REFERENCES apartments(id),
  guest_id UUID, -- FK added in 00003
  channel_id UUID NOT NULL REFERENCES booking_channels(id),
  reference VARCHAR(20) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show')),
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  nights INT NOT NULL GENERATED ALWAYS AS (check_out - check_in) STORED,
  adults INT NOT NULL DEFAULT 1,
  children INT NOT NULL DEFAULT 0,
  infants INT NOT NULL DEFAULT 0,
  rate_per_night_gbp DECIMAL(10,2) NOT NULL,
  discount_percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
  total_amount_gbp DECIMAL(10,2) NOT NULL,
  total_amount_guest_currency DECIMAL(10,2),
  guest_currency VARCHAR(3) NOT NULL DEFAULT 'GBP',
  special_requests TEXT,
  internal_notes TEXT,
  checked_in_at TIMESTAMPTZ,
  checked_out_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (check_out > check_in)
);

CREATE TRIGGER bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3. rates
CREATE TABLE rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id),
  apartment_type_id UUID NOT NULL REFERENCES apartment_types(id),
  season_name VARCHAR(50) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  weekly_rate_gbp DECIMAL(10,2) NOT NULL,
  nightly_rate_gbp DECIMAL(10,2) NOT NULL,
  min_stay_nights INT NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date > start_date)
);

CREATE TRIGGER rates_updated_at
  BEFORE UPDATE ON rates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. availability
CREATE TABLE availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apartment_id UUID NOT NULL REFERENCES apartments(id),
  date DATE NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT true,
  price_override_gbp DECIMAL(10,2),
  block_reason VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(apartment_id, date)
);

-- 5. promotions
CREATE TABLE promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id),
  name VARCHAR(100) NOT NULL,
  code VARCHAR(20) UNIQUE,
  type VARCHAR(20) NOT NULL
    CHECK (type IN ('percentage', 'fixed_amount', 'free_nights', 'package')),
  value DECIMAL(10,2) NOT NULL,
  min_nights INT,
  max_uses INT,
  current_uses INT NOT NULL DEFAULT 0,
  valid_from DATE NOT NULL,
  valid_until DATE NOT NULL,
  applicable_apartment_types UUID[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (valid_until > valid_from)
);

CREATE TRIGGER promotions_updated_at
  BEFORE UPDATE ON promotions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. booking_addons
CREATE TABLE booking_addons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  quantity INT NOT NULL DEFAULT 1,
  unit_price_gbp DECIMAL(10,2) NOT NULL,
  total_price_gbp DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
