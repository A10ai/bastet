-- ============================================================
-- Migration 00037: Online (direct) booking engine — Sales module, slice 1
--
-- Bastet phase-1 strategy: sell the first units online, direct + OTA, at a
-- premium rate. This migration gives the public booking flow its storage
-- and its transactional core:
--
--   1. booking_channels: a 'web' channel (0% commission) for the website
--   2. bookings: source / hold_expires_at / external_ref / locale columns
--      A web booking is an ordinary *pending* booking with a hold expiry,
--      so the 00020 exclusion constraint protects it from double-selling
--      while the guest pays. Unpaid holds are cancelled by the cron.
--   3. sales_settings: per-property online-sales policy (deposit %, hold
--      minutes, lead/advance limits). Pricing bands are added in slice 4.
--   4. online_availability(): sellable apartments per type for a stay
--   5. create_online_booking(): pick a free apartment of the requested
--      type and insert the pending booking atomically (SKIP LOCKED +
--      exclusion constraint as the backstop), priced by quote_stay()
--   6. confirm_online_booking(): record the deposit on the folio and
--      confirm the booking; idempotent on the payment reference
--   7. expire_online_holds(): cancel unpaid holds past their expiry
--
-- Idempotent. All functions are callable by service_role (public routes)
-- and authenticated staff (front desk tools); anon has no access.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Website channel
-- ------------------------------------------------------------
INSERT INTO booking_channels (name, code, commission_rate)
VALUES ('Website', 'web', 0.00)
ON CONFLICT (code) DO NOTHING;

-- ------------------------------------------------------------
-- 2. Booking provenance and holds
-- ------------------------------------------------------------
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS source varchar(12) NOT NULL DEFAULT 'staff';
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_source_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_source_check
  CHECK (source IN ('staff', 'web', 'concierge', 'channel', 'import'));
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS hold_expires_at timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS external_ref varchar(80);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS locale varchar(5);
CREATE INDEX IF NOT EXISTS idx_bookings_hold_expiry ON bookings (hold_expires_at) WHERE hold_expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_external_ref ON bookings (channel_id, external_ref) WHERE external_ref IS NOT NULL;

COMMENT ON COLUMN bookings.source IS 'Who created the booking: staff UI, website, AI concierge, channel manager, import';
COMMENT ON COLUMN bookings.hold_expires_at IS 'Pending online booking: inventory is held until this time; expire_online_holds() cancels it after';
COMMENT ON COLUMN bookings.external_ref IS 'Reservation id at the originating channel (OTA / channel manager)';

-- ------------------------------------------------------------
-- 3. Online-sales policy per property
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales_settings (
  property_id uuid PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,
  online_enabled boolean NOT NULL DEFAULT true,
  deposit_percent numeric(5,2) NOT NULL DEFAULT 20 CHECK (deposit_percent >= 0 AND deposit_percent <= 100),
  hold_minutes integer NOT NULL DEFAULT 30 CHECK (hold_minutes BETWEEN 5 AND 1440),
  request_hold_hours integer NOT NULL DEFAULT 48 CHECK (request_hold_hours BETWEEN 1 AND 168),
  min_lead_days integer NOT NULL DEFAULT 0 CHECK (min_lead_days >= 0),
  max_advance_days integer NOT NULL DEFAULT 540 CHECK (max_advance_days BETWEEN 1 AND 1095),
  max_nights integer NOT NULL DEFAULT 90 CHECK (max_nights BETWEEN 1 AND 365),
  max_guests_per_booking integer NOT NULL DEFAULT 8 CHECK (max_guests_per_booking BETWEEN 1 AND 30),
  currencies text[] NOT NULL DEFAULT ARRAY['GBP','EUR','USD','EGP'],
  terms_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS sales_settings_updated_at ON sales_settings;
CREATE TRIGGER sales_settings_updated_at BEFORE UPDATE ON sales_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO sales_settings (property_id) SELECT id FROM properties ON CONFLICT (property_id) DO NOTHING;

ALTER TABLE sales_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sales_settings_select ON sales_settings;
DROP POLICY IF EXISTS sales_settings_insert ON sales_settings;
DROP POLICY IF EXISTS sales_settings_update ON sales_settings;
CREATE POLICY sales_settings_select ON sales_settings FOR SELECT TO authenticated
  USING (role_at_least(10) AND can_access_property(property_id));
CREATE POLICY sales_settings_insert ON sales_settings FOR INSERT TO authenticated
  WITH CHECK (role_at_least(70) AND can_access_property(property_id));
CREATE POLICY sales_settings_update ON sales_settings FOR UPDATE TO authenticated
  USING (role_at_least(70) AND can_access_property(property_id))
  WITH CHECK (role_at_least(70) AND can_access_property(property_id));
GRANT SELECT, INSERT, UPDATE ON sales_settings TO authenticated;
GRANT ALL ON sales_settings TO service_role;

-- ------------------------------------------------------------
-- 4. Sellable inventory per apartment type for a stay
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION sellable_apartments(p_property_id uuid, p_apartment_type_id uuid, p_check_in date, p_check_out date)
RETURNS SETOF apartments
LANGUAGE sql STABLE
SET search_path = public, pg_temp AS $$
  SELECT a.*
  FROM apartments a
  WHERE a.property_id = p_property_id
    AND (p_apartment_type_id IS NULL OR a.apartment_type_id = p_apartment_type_id)
    AND a.status NOT IN ('maintenance', 'blocked', 'out_of_service')
    AND NOT EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.apartment_id = a.id
        AND b.status NOT IN ('cancelled', 'no_show')
        AND b.check_in < p_check_out AND b.check_out > p_check_in)
    AND NOT EXISTS (
      SELECT 1 FROM availability av
      WHERE av.apartment_id = a.id AND av.is_available = false
        AND av.date >= p_check_in AND av.date < p_check_out)
  ORDER BY a.number
$$;

CREATE OR REPLACE FUNCTION online_availability(p_property_id uuid, p_check_in date, p_check_out date)
RETURNS TABLE (apartment_type_id uuid, available_count integer)
LANGUAGE sql STABLE
SET search_path = public, pg_temp AS $$
  SELECT t.id, COUNT(s.id)::integer
  FROM apartment_types t
  LEFT JOIN LATERAL (SELECT id FROM sellable_apartments(p_property_id, t.id, p_check_in, p_check_out)) s ON true
  WHERE t.property_id = p_property_id
  GROUP BY t.id
$$;

-- ------------------------------------------------------------
-- 5. Create a pending online booking with a hold
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_online_booking(
  p_property_id uuid,
  p_apartment_type_id uuid,
  p_check_in date,
  p_check_out date,
  p_adults integer,
  p_children integer DEFAULT 0,
  p_guest_id uuid DEFAULT NULL,
  p_rate_plan_id uuid DEFAULT NULL,
  p_channel_code text DEFAULT 'web',
  p_source text DEFAULT 'web',
  p_locale text DEFAULT NULL,
  p_guest_currency text DEFAULT 'GBP',
  p_special_requests text DEFAULT NULL,
  p_hold_minutes integer DEFAULT NULL,
  p_external_ref text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp AS $$
DECLARE
  v_settings sales_settings%ROWTYPE;
  v_type apartment_types%ROWTYPE;
  v_channel booking_channels%ROWTYPE;
  v_quote jsonb;
  v_apt apartments%ROWTYPE;
  v_booking bookings%ROWTYPE;
  v_hold integer;
  v_nights integer;
  v_tried integer := 0;
BEGIN
  SELECT * INTO v_settings FROM sales_settings WHERE property_id = p_property_id;
  IF NOT FOUND THEN
    INSERT INTO sales_settings (property_id) VALUES (p_property_id) RETURNING * INTO v_settings;
  END IF;
  IF NOT v_settings.online_enabled AND p_source IN ('web', 'concierge') THEN
    RAISE EXCEPTION 'ONLINE_SALES_CLOSED: online booking is not open for this property' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_type FROM apartment_types WHERE id = p_apartment_type_id AND property_id = p_property_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'TYPE_NOT_FOUND: apartment type not found' USING ERRCODE = 'P0002'; END IF;

  v_nights := p_check_out - p_check_in;
  IF v_nights < 1 THEN RAISE EXCEPTION 'INVALID_DATES: check-out must be after check-in' USING ERRCODE = 'P0001'; END IF;
  IF p_source IN ('web', 'concierge') THEN
    IF p_check_in < CURRENT_DATE + v_settings.min_lead_days THEN
      RAISE EXCEPTION 'TOO_SOON: arrivals must be booked at least % day(s) ahead', v_settings.min_lead_days USING ERRCODE = 'P0001';
    END IF;
    IF p_check_in > CURRENT_DATE + v_settings.max_advance_days THEN
      RAISE EXCEPTION 'TOO_FAR: arrivals can be booked up to % days ahead', v_settings.max_advance_days USING ERRCODE = 'P0001';
    END IF;
    IF v_nights > v_settings.max_nights THEN
      RAISE EXCEPTION 'MAX_NIGHTS: online bookings are limited to % nights', v_settings.max_nights USING ERRCODE = 'P0001';
    END IF;
    IF COALESCE(p_adults, 0) + COALESCE(p_children, 0) > v_settings.max_guests_per_booking THEN
      RAISE EXCEPTION 'TOO_MANY_GUESTS: at most % guests per booking', v_settings.max_guests_per_booking USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF COALESCE(p_adults, 0) < 1 THEN RAISE EXCEPTION 'INVALID_GUESTS: at least one adult' USING ERRCODE = 'P0001'; END IF;
  IF COALESCE(p_adults, 0) + COALESCE(p_children, 0) > v_type.max_occupancy THEN
    RAISE EXCEPTION 'OCCUPANCY: % sleeps at most % guests', v_type.name, v_type.max_occupancy USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_channel FROM booking_channels WHERE code = COALESCE(p_channel_code, 'web') AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHANNEL_NOT_FOUND: channel % is not configured', p_channel_code USING ERRCODE = 'P0002'; END IF;

  IF p_external_ref IS NOT NULL THEN
    SELECT * INTO v_booking FROM bookings WHERE channel_id = v_channel.id AND external_ref = p_external_ref;
    IF FOUND THEN RETURN jsonb_build_object('booking', to_jsonb(v_booking), 'duplicate', true); END IF;
  END IF;

  -- One pricing truth for staff, web and channels.
  v_quote := quote_stay(p_apartment_type_id, p_check_in, p_check_out, p_rate_plan_id, v_channel.code);

  v_hold := COALESCE(p_hold_minutes, v_settings.hold_minutes);

  -- Take the first free apartment of the type. SKIP LOCKED keeps two
  -- concurrent guests off the same row; the 00020 exclusion constraint
  -- catches anything that slips through, in which case we try the next one.
  FOR v_apt IN
    SELECT a.*
      FROM apartments a
     WHERE a.property_id = p_property_id
       AND a.apartment_type_id = p_apartment_type_id
       AND a.status NOT IN ('maintenance', 'blocked', 'out_of_service')
       AND NOT EXISTS (
         SELECT 1 FROM bookings b
          WHERE b.apartment_id = a.id AND b.status NOT IN ('cancelled', 'no_show')
            AND b.check_in < p_check_out AND b.check_out > p_check_in)
       AND NOT EXISTS (
         SELECT 1 FROM availability av
          WHERE av.apartment_id = a.id AND av.is_available = false
            AND av.date >= p_check_in AND av.date < p_check_out)
     ORDER BY a.number
     FOR UPDATE OF a SKIP LOCKED
  LOOP
    v_tried := v_tried + 1;
    BEGIN
      INSERT INTO bookings (
        property_id, apartment_id, guest_id, channel_id, reference, status,
        check_in, check_out, adults, children, infants,
        rate_per_night_gbp, discount_percentage, total_amount_gbp,
        rate_plan_id, rate_plan_snapshot, guest_currency, special_requests,
        source, hold_expires_at, locale, external_ref
      ) VALUES (
        p_property_id, v_apt.id, p_guest_id, v_channel.id, next_booking_reference(), 'pending',
        p_check_in, p_check_out, p_adults, COALESCE(p_children, 0), 0,
        (v_quote->>'rate_per_night_gbp')::numeric, (v_quote->>'discount_percentage')::numeric, (v_quote->>'total_gbp')::numeric,
        NULLIF(v_quote->'rate_plan'->>'id', '')::uuid, v_quote->'rate_plan', COALESCE(p_guest_currency, 'GBP'), p_special_requests,
        p_source, CASE WHEN p_source IN ('web', 'concierge') THEN now() + make_interval(mins => v_hold) ELSE NULL END, p_locale, p_external_ref
      ) RETURNING * INTO v_booking;
      RETURN jsonb_build_object('booking', to_jsonb(v_booking), 'quote', v_quote, 'duplicate', false);
    EXCEPTION WHEN exclusion_violation THEN
      -- lost the race for this apartment; try the next candidate
      NULL;
    END;
    EXIT WHEN v_tried >= 5;
  END LOOP;

  RAISE EXCEPTION 'NO_AVAILABILITY: no % is available for these dates', v_type.name USING ERRCODE = 'P0001';
END $$;

-- ------------------------------------------------------------
-- 6. Confirm on payment (idempotent on reference)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION confirm_online_booking(
  p_booking_id uuid,
  p_amount_gbp numeric,
  p_method text DEFAULT 'stripe',
  p_reference text DEFAULT NULL,
  p_currency text DEFAULT 'GBP',
  p_amount_original numeric DEFAULT NULL,
  p_fx_rate numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp AS $$
DECLARE v_b bookings%ROWTYPE; v_folio uuid; v_pay jsonb; v_existing payments%ROWTYPE;
BEGIN
  SELECT * INTO v_b FROM bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_b.status IN ('cancelled', 'no_show') THEN
    RAISE EXCEPTION 'INVALID_STATUS: booking is %', v_b.status USING ERRCODE = 'P0001';
  END IF;
  v_folio := open_folio(p_booking_id);

  IF p_reference IS NOT NULL THEN
    SELECT * INTO v_existing FROM payments WHERE folio_id = v_folio AND reference = p_reference LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('booking_id', v_b.id, 'status', v_b.status, 'payment_id', v_existing.id, 'duplicate', true);
    END IF;
  END IF;

  IF p_amount_gbp IS NOT NULL AND p_amount_gbp > 0 THEN
    v_pay := record_folio_payment(v_folio, p_amount_gbp, p_method, p_amount_original, p_currency, p_fx_rate, p_reference, NULL, 'Online deposit', 'guest');
  END IF;

  IF v_b.status = 'pending' THEN
    UPDATE bookings SET status = 'confirmed', hold_expires_at = NULL WHERE id = p_booking_id RETURNING * INTO v_b;
  ELSE
    UPDATE bookings SET hold_expires_at = NULL WHERE id = p_booking_id RETURNING * INTO v_b;
  END IF;
  RETURN jsonb_build_object('booking_id', v_b.id, 'status', v_b.status, 'payment_id', v_pay->'payment'->>'id', 'balance_gbp', v_pay->'balance_gbp', 'duplicate', false);
END $$;

-- ------------------------------------------------------------
-- 7. Expire unpaid holds (cron)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION expire_online_holds()
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp AS $$
DECLARE v_count integer;
BEGIN
  WITH expired AS (
    UPDATE bookings b
       SET status = 'cancelled', cancelled_at = now(), hold_expires_at = NULL,
           cancellation_reason = 'Hold expired: payment not received'
     WHERE b.status = 'pending' AND b.hold_expires_at IS NOT NULL AND b.hold_expires_at < now()
       AND NOT EXISTS (
         SELECT 1 FROM folios f JOIN payments p ON p.folio_id = f.id
         WHERE f.booking_id = b.id AND p.status IN ('completed', 'partially_refunded'))
    RETURNING b.id)
  SELECT COUNT(*) INTO v_count FROM expired;
  RETURN v_count;
END $$;

-- ------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------
GRANT EXECUTE ON FUNCTION sellable_apartments(uuid, uuid, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION online_availability(uuid, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION create_online_booking(uuid, uuid, date, date, integer, integer, uuid, uuid, text, text, text, text, text, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION confirm_online_booking(uuid, numeric, text, text, text, numeric, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION expire_online_holds() TO service_role;
REVOKE EXECUTE ON FUNCTION sellable_apartments(uuid, uuid, date, date) FROM anon;
REVOKE EXECUTE ON FUNCTION online_availability(uuid, date, date) FROM anon;
REVOKE EXECUTE ON FUNCTION create_online_booking(uuid, uuid, date, date, integer, integer, uuid, uuid, text, text, text, text, text, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION confirm_online_booking(uuid, numeric, text, text, text, numeric, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION expire_online_holds() FROM anon;
