-- ============================================================
-- Migration 00038: Channel manager connector — Sales module, slice 3
--
-- OTA distribution for the online-first strategy: reservations arrive from
-- a channel manager (or an OTA's connectivity API) and become ordinary
-- bookings; availability, rates and restrictions (ARI) go the other way.
--
--   1. channel_connections   one row per property x channel (provider,
--                            inbound HMAC secret [encrypted], outbound
--                            push endpoint, pricing plan and markup)
--   2. channel_room_mappings OTA room / rate-plan ids -> apartment type
--   3. channel_messages      every inbound event and outbound push, with
--                            an idempotency key (OTA retries are harmless)
--   4. channel_ari()         availability, rate, min-stay and closed flag
--                            per apartment type per day
--   5. create_online_booking gains p_total_gbp (the OTA's price wins) and
--                            p_confirmed (OTA bookings are guaranteed)
--   6. modify_booking_stay() date / party changes with re-assignment when
--                            the same unit is no longer free
--
-- Idempotent. Secrets are never selected by the API (see the view).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Connections
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS channel_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES booking_channels(id),
  provider varchar(30) NOT NULL DEFAULT 'generic'
    CHECK (provider IN ('generic', 'siteminder', 'cloudbeds', 'booking_com', 'expedia', 'airbnb', 'agoda', 'ostrovok')),
  name varchar(80) NOT NULL,
  status varchar(12) NOT NULL DEFAULT 'inactive' CHECK (status IN ('inactive', 'active', 'error')),
  hotel_code varchar(80),
  webhook_secret text,
  push_url text,
  push_auth_ref varchar(60),
  push_days integer NOT NULL DEFAULT 365 CHECK (push_days BETWEEN 1 AND 730),
  rate_plan_id uuid REFERENCES rate_plans(id),
  markup_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (markup_percent BETWEEN -50 AND 100),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_inbound_at timestamptz,
  last_push_at timestamptz,
  last_push_status varchar(12),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, channel_id)
);
DROP TRIGGER IF EXISTS channel_connections_updated_at ON channel_connections;
CREATE TRIGGER channel_connections_updated_at BEFORE UPDATE ON channel_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
COMMENT ON COLUMN channel_connections.webhook_secret IS 'HMAC secret for inbound events, encrypted with PII_ENCRYPTION_KEY; exposed to the API only as has_webhook_secret';
COMMENT ON COLUMN channel_connections.push_auth_ref IS 'Name of the environment variable holding the outbound bearer token; the token itself is never stored';

-- ------------------------------------------------------------
-- 2. Room / rate-plan mappings
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS channel_room_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES channel_connections(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  apartment_type_id uuid NOT NULL REFERENCES apartment_types(id),
  external_room_id varchar(80) NOT NULL,
  external_rate_plan_id varchar(80) NOT NULL DEFAULT 'default',
  rate_plan_id uuid REFERENCES rate_plans(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, external_room_id, external_rate_plan_id)
);
CREATE INDEX IF NOT EXISTS idx_channel_room_mappings_type ON channel_room_mappings (connection_id, apartment_type_id);

-- ------------------------------------------------------------
-- 3. Message log
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS channel_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES channel_connections(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  direction varchar(3) NOT NULL CHECK (direction IN ('in', 'out')),
  kind varchar(20) NOT NULL CHECK (kind IN ('reservation', 'modification', 'cancellation', 'ari_push', 'unknown')),
  idempotency_key varchar(160),
  external_ref varchar(80),
  booking_id uuid REFERENCES bookings(id),
  status varchar(10) NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processed', 'duplicate', 'failed', 'skipped')),
  error text,
  payload jsonb,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_channel_messages_idempotency ON channel_messages (connection_id, direction, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_channel_messages_connection ON channel_messages (connection_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_channel_messages_booking ON channel_messages (booking_id) WHERE booking_id IS NOT NULL;

-- ------------------------------------------------------------
-- RLS: property scoped; reception reads, managers write; the API never
-- selects webhook_secret (it uses the view below).
-- ------------------------------------------------------------
ALTER TABLE channel_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_room_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_messages ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['channel_connections', 'channel_room_mappings', 'channel_messages'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_delete', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (role_at_least(50) AND can_access_property(property_id))', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (role_at_least(70) AND can_access_property(property_id))', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (role_at_least(70) AND can_access_property(property_id)) WITH CHECK (role_at_least(70) AND can_access_property(property_id))', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO authenticated USING (role_at_least(70) AND can_access_property(property_id))', t || '_delete', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated', t);
    EXECUTE format('GRANT ALL ON %I TO service_role', t);
    EXECUTE format('REVOKE ALL ON %I FROM anon', t);
  END LOOP;
END $$;
-- Column privilege: staff sessions cannot read the encrypted secret at all.
-- A table-level SELECT would cover every column, so staff get column-level
-- SELECT on everything except webhook_secret (the API always lists columns).
REVOKE SELECT ON channel_connections FROM authenticated;
GRANT SELECT (id, property_id, channel_id, provider, name, status, hotel_code, push_url, push_auth_ref, push_days, rate_plan_id, markup_percent, settings, last_inbound_at, last_push_at, last_push_status, last_error, created_at, updated_at)
  ON channel_connections TO authenticated;

-- ------------------------------------------------------------
-- 4. ARI per apartment type per day
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION channel_ari(p_property_id uuid, p_from date, p_to date, p_rate_plan_id uuid DEFAULT NULL)
RETURNS TABLE (apartment_type_id uuid, day date, total integer, available integer, bar_gbp numeric, rate_gbp numeric, min_stay integer, closed boolean)
LANGUAGE sql STABLE
SET search_path = public, pg_temp AS $$
  WITH days AS (
    SELECT d::date AS day FROM generate_series(p_from, p_to - 1, interval '1 day') d
  ),
  plan AS (
    SELECT * FROM rate_plans rp
    WHERE rp.property_id = p_property_id AND rp.is_active
      AND (p_rate_plan_id IS NULL OR rp.id = p_rate_plan_id)
    ORDER BY (rp.id = p_rate_plan_id) DESC, rp.is_default DESC, rp.created_at ASC
    LIMIT 1
  ),
  units AS (
    SELECT a.id, a.apartment_type_id FROM apartments a
    WHERE a.property_id = p_property_id AND a.status NOT IN ('out_of_service')
  ),
  per_day AS (
    SELECT t.id AS apartment_type_id, dy.day,
      (SELECT COUNT(*) FROM units u WHERE u.apartment_type_id = t.id)::integer AS total,
      (SELECT COUNT(*) FROM units u
        WHERE u.apartment_type_id = t.id
          AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.apartment_id = u.id AND b.status NOT IN ('cancelled', 'no_show') AND b.check_in <= dy.day AND b.check_out > dy.day)
          AND NOT EXISTS (SELECT 1 FROM availability av WHERE av.apartment_id = u.id AND av.date = dy.day AND av.is_available = false)
          AND NOT EXISTS (SELECT 1 FROM apartments a2 WHERE a2.id = u.id AND a2.status IN ('maintenance', 'blocked'))
      )::integer AS available,
      COALESCE((SELECT COALESCE(r.nightly_rate_gbp, r.weekly_rate_gbp / 7) FROM rates r
                 WHERE r.apartment_type_id = t.id AND r.is_active AND r.start_date <= dy.day AND r.end_date >= dy.day
                 ORDER BY r.start_date DESC LIMIT 1), t.base_weekly_rate_gbp / 7) AS bar,
      COALESCE((SELECT r.min_stay_nights FROM rates r
                 WHERE r.apartment_type_id = t.id AND r.is_active AND r.start_date <= dy.day AND r.end_date >= dy.day
                 ORDER BY r.start_date DESC LIMIT 1), 1) AS min_stay
    FROM apartment_types t CROSS JOIN days dy
    WHERE t.property_id = p_property_id
  )
  SELECT pd.apartment_type_id, pd.day, pd.total, pd.available,
    round(pd.bar, 2) AS bar_gbp,
    round(CASE (SELECT pricing_mode FROM plan)
      WHEN 'percent_off'    THEN pd.bar * (1 - (SELECT adjustment FROM plan) / 100)
      WHEN 'percent_markup' THEN pd.bar * (1 + (SELECT adjustment FROM plan) / 100)
      WHEN 'fixed_nightly'  THEN (SELECT adjustment FROM plan)
      ELSE pd.bar END, 2) AS rate_gbp,
    GREATEST(pd.min_stay, COALESCE((SELECT min_nights FROM plan), 1))::integer AS min_stay,
    (pd.available <= 0 OR pd.bar IS NULL) AS closed
  FROM per_day pd
  ORDER BY pd.apartment_type_id, pd.day
$$;

-- ------------------------------------------------------------
-- 5. create_online_booking: OTA price and guaranteed status
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS create_online_booking(uuid, uuid, date, date, integer, integer, uuid, uuid, text, text, text, text, text, integer, text);
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
  p_external_ref text DEFAULT NULL,
  p_total_gbp numeric DEFAULT NULL,
  p_confirmed boolean DEFAULT false
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
  v_total numeric;
  v_per_night numeric;
  v_discount numeric;
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

  PERFORM expire_online_holds();

  SELECT * INTO v_channel FROM booking_channels WHERE code = COALESCE(p_channel_code, 'web') AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHANNEL_NOT_FOUND: channel % is not configured', p_channel_code USING ERRCODE = 'P0002'; END IF;

  IF p_external_ref IS NOT NULL THEN
    SELECT * INTO v_booking FROM bookings WHERE channel_id = v_channel.id AND external_ref = p_external_ref;
    IF FOUND THEN RETURN jsonb_build_object('booking', to_jsonb(v_booking), 'duplicate', true); END IF;
  END IF;

  -- One pricing truth for staff, web and channels; an OTA's own total wins
  -- when supplied (the guest has already agreed that price with the OTA).
  v_quote := quote_stay(p_apartment_type_id, p_check_in, p_check_out, p_rate_plan_id, v_channel.code);
  IF p_total_gbp IS NOT NULL AND p_total_gbp >= 0 THEN
    v_total := round(p_total_gbp, 2);
    v_per_night := round(v_total / v_nights, 2);
    v_discount := CASE WHEN (v_quote->>'bar_total_gbp')::numeric > 0 AND v_total < (v_quote->>'bar_total_gbp')::numeric
                       THEN round((1 - v_total / (v_quote->>'bar_total_gbp')::numeric) * 100, 2) ELSE 0 END;
  ELSE
    v_total := (v_quote->>'total_gbp')::numeric;
    v_per_night := (v_quote->>'rate_per_night_gbp')::numeric;
    v_discount := (v_quote->>'discount_percentage')::numeric;
  END IF;

  v_hold := COALESCE(p_hold_minutes, v_settings.hold_minutes);

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
        p_property_id, v_apt.id, p_guest_id, v_channel.id, next_booking_reference(),
        CASE WHEN p_confirmed THEN 'confirmed' ELSE 'pending' END,
        p_check_in, p_check_out, p_adults, COALESCE(p_children, 0), 0,
        v_per_night, v_discount, v_total,
        NULLIF(v_quote->'rate_plan'->>'id', '')::uuid, v_quote->'rate_plan', COALESCE(p_guest_currency, 'GBP'), p_special_requests,
        p_source,
        CASE WHEN NOT p_confirmed AND p_source IN ('web', 'concierge') THEN now() + make_interval(mins => v_hold) ELSE NULL END,
        p_locale, p_external_ref
      ) RETURNING * INTO v_booking;
      RETURN jsonb_build_object('booking', to_jsonb(v_booking), 'quote', v_quote, 'duplicate', false);
    EXCEPTION WHEN exclusion_violation THEN
      NULL;
    END;
    EXIT WHEN v_tried >= 5;
  END LOOP;

  RAISE EXCEPTION 'NO_AVAILABILITY: no % is available for these dates', v_type.name USING ERRCODE = 'P0001';
END $$;

-- ------------------------------------------------------------
-- 6. Modify a stay (dates, party, total); re-assign unit when needed
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION modify_booking_stay(
  p_booking_id uuid,
  p_check_in date,
  p_check_out date,
  p_adults integer DEFAULT NULL,
  p_children integer DEFAULT NULL,
  p_total_gbp numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp AS $$
DECLARE v_b bookings%ROWTYPE; v_type apartment_types%ROWTYPE; v_apt apartments%ROWTYPE; v_nights integer; v_total numeric; v_quote jsonb; v_channel text; v_moved boolean := false;
BEGIN
  SELECT * INTO v_b FROM bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_b.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'INVALID_STATUS: booking is %, only pending or confirmed stays can be modified', v_b.status USING ERRCODE = 'P0001';
  END IF;
  v_nights := p_check_out - p_check_in;
  IF v_nights < 1 THEN RAISE EXCEPTION 'INVALID_DATES: check-out must be after check-in' USING ERRCODE = 'P0001'; END IF;
  SELECT t.* INTO v_type FROM apartment_types t JOIN apartments a ON a.apartment_type_id = t.id WHERE a.id = v_b.apartment_id;
  IF COALESCE(p_adults, v_b.adults) + COALESCE(p_children, v_b.children) > v_type.max_occupancy THEN
    RAISE EXCEPTION 'OCCUPANCY: % sleeps at most % guests', v_type.name, v_type.max_occupancy USING ERRCODE = 'P0001';
  END IF;

  SELECT code INTO v_channel FROM booking_channels WHERE id = v_b.channel_id;
  IF p_total_gbp IS NOT NULL THEN
    v_total := round(p_total_gbp, 2);
  ELSE
    v_quote := quote_stay(v_type.id, p_check_in, p_check_out, v_b.rate_plan_id, v_channel);
    v_total := (v_quote->>'total_gbp')::numeric;
  END IF;

  -- Same unit first. The exclusion constraint catches overlapping bookings;
  -- maintenance blocks and unit status are checked here because they live
  -- outside that constraint.
  BEGIN
    IF EXISTS (SELECT 1 FROM apartments a WHERE a.id = v_b.apartment_id AND a.status IN ('maintenance', 'blocked', 'out_of_service'))
       OR EXISTS (SELECT 1 FROM availability av WHERE av.apartment_id = v_b.apartment_id AND av.is_available = false AND av.date >= p_check_in AND av.date < p_check_out) THEN
      RAISE exclusion_violation USING MESSAGE = 'unit blocked for the new dates';
    END IF;
    UPDATE bookings SET check_in = p_check_in, check_out = p_check_out,
      adults = COALESCE(p_adults, adults), children = COALESCE(p_children, children),
      total_amount_gbp = v_total, rate_per_night_gbp = round(v_total / v_nights, 2)
    WHERE id = p_booking_id RETURNING * INTO v_b;
    RETURN jsonb_build_object('booking', to_jsonb(v_b), 'moved', false);
  EXCEPTION WHEN exclusion_violation THEN
    NULL;
  END;

  -- Otherwise another unit of the same type that is free for the new dates.
  FOR v_apt IN
    SELECT a.* FROM apartments a
     WHERE a.property_id = v_b.property_id AND a.apartment_type_id = v_type.id AND a.id <> v_b.apartment_id
       AND a.status NOT IN ('maintenance', 'blocked', 'out_of_service')
       AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.apartment_id = a.id AND b.status NOT IN ('cancelled', 'no_show') AND b.check_in < p_check_out AND b.check_out > p_check_in)
       AND NOT EXISTS (SELECT 1 FROM availability av WHERE av.apartment_id = a.id AND av.is_available = false AND av.date >= p_check_in AND av.date < p_check_out)
     ORDER BY a.number
     FOR UPDATE OF a SKIP LOCKED
  LOOP
    BEGIN
      UPDATE bookings SET apartment_id = v_apt.id, check_in = p_check_in, check_out = p_check_out,
        adults = COALESCE(p_adults, adults), children = COALESCE(p_children, children),
        total_amount_gbp = v_total, rate_per_night_gbp = round(v_total / v_nights, 2)
      WHERE id = p_booking_id RETURNING * INTO v_b;
      v_moved := true;
      RETURN jsonb_build_object('booking', to_jsonb(v_b), 'moved', true);
    EXCEPTION WHEN exclusion_violation THEN
      NULL;
    END;
  END LOOP;
  RAISE EXCEPTION 'NO_AVAILABILITY: no % is free for the new dates', v_type.name USING ERRCODE = 'P0001';
END $$;

-- ------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------
GRANT EXECUTE ON FUNCTION channel_ari(uuid, date, date, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION create_online_booking(uuid, uuid, date, date, integer, integer, uuid, uuid, text, text, text, text, text, integer, text, numeric, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION modify_booking_stay(uuid, date, date, integer, integer, numeric) TO authenticated, service_role;
REVOKE ALL ON FUNCTION channel_ari(uuid, date, date, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION create_online_booking(uuid, uuid, date, date, integer, integer, uuid, uuid, text, text, text, text, text, integer, text, numeric, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION modify_booking_stay(uuid, date, date, integer, integer, numeric) FROM PUBLIC, anon;
