-- ============================================================
-- Migration 00039: Pricing agent — Sales module, slice 4
--
-- Protects the premium in the online-first strategy. The agent reads
-- competitor rate shops, pickup and availability, recommends a rate per
-- apartment type per week inside a band the owner sets, and either queues
-- the recommendation for approval or applies it automatically when the
-- band allows.
--
--   1. rates.priority: agent rows win over seasonal rows for the same day
--      (quote_stay, channel_ari and the booking engine order by it)
--   2. rate_shops: competitor rates by stay date (manual entry or import)
--   3. pricing_bands: floor, ceiling, premium target, max daily move,
--      auto_apply per property (and optionally per apartment type)
--   4. rate_recommendations: the approval queue with full reasoning
--   5. apply_rate_recommendation(): writes the agent rate row and records
--      the decision in pricing_decisions
--
-- Idempotent.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Rate precedence
-- ------------------------------------------------------------
ALTER TABLE rates ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0;
ALTER TABLE rates ADD COLUMN IF NOT EXISTS source varchar(12) NOT NULL DEFAULT 'manual';
ALTER TABLE rates DROP CONSTRAINT IF EXISTS rates_source_check;
ALTER TABLE rates ADD CONSTRAINT rates_source_check CHECK (source IN ('manual', 'agent', 'import'));
CREATE INDEX IF NOT EXISTS idx_rates_lookup ON rates (apartment_type_id, start_date DESC, priority DESC) WHERE is_active;
COMMENT ON COLUMN rates.priority IS 'Higher wins when several active rows cover a day; agent rows use 10, seasons 0';

-- quote_stay: the 00034 (ledger integrity) body, which keeps full precision on totals,
-- with the priority-aware rate lookup. Re-applied here so agent rows win.
CREATE OR REPLACE FUNCTION quote_stay(
  p_apartment_type_id uuid,
  p_check_in date,
  p_check_out date,
  p_rate_plan_id uuid DEFAULT NULL,
  p_channel_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp AS $$
DECLARE
  v_type apartment_types%ROWTYPE;
  v_plan rate_plans%ROWTYPE;
  v_nights integer;
  v_day date;
  v_bar numeric;
  v_rate numeric;
  v_season text;
  v_rows jsonb := '[]'::jsonb;
  v_bar_total numeric := 0;
  v_total numeric := 0;
BEGIN
  SELECT * INTO v_type FROM apartment_types WHERE id = p_apartment_type_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TYPE_NOT_FOUND: apartment type % not found', p_apartment_type_id;
  END IF;
  v_nights := p_check_out - p_check_in;
  IF v_nights < 1 THEN
    RAISE EXCEPTION 'INVALID_DATES: check-out must be after check-in';
  END IF;

  IF p_rate_plan_id IS NOT NULL THEN
    SELECT * INTO v_plan FROM rate_plans WHERE id = p_rate_plan_id;
    IF NOT FOUND OR v_plan.property_id <> v_type.property_id THEN
      RAISE EXCEPTION 'RATE_PLAN_NOT_FOUND: rate plan % not found for this property', p_rate_plan_id;
    END IF;
  ELSE
    SELECT * INTO v_plan FROM rate_plans
    WHERE property_id = v_type.property_id AND is_active
    ORDER BY is_default DESC, created_at ASC LIMIT 1;
  END IF;

  IF v_plan.id IS NOT NULL THEN
    IF NOT v_plan.is_active THEN
      RAISE EXCEPTION 'RATE_PLAN_INACTIVE: % is no longer sold', v_plan.name;
    END IF;
    IF v_nights < v_plan.min_nights THEN
      RAISE EXCEPTION 'MIN_NIGHTS: % requires at least % nights', v_plan.name, v_plan.min_nights;
    END IF;
    IF v_plan.max_nights IS NOT NULL AND v_nights > v_plan.max_nights THEN
      RAISE EXCEPTION 'MAX_NIGHTS: % allows at most % nights', v_plan.name, v_plan.max_nights;
    END IF;
    IF (v_plan.valid_from IS NOT NULL AND p_check_in < v_plan.valid_from)
       OR (v_plan.valid_to IS NOT NULL AND (p_check_out - 1) > v_plan.valid_to) THEN
      RAISE EXCEPTION 'RATE_PLAN_NOT_VALID: % is not available for these dates', v_plan.name;
    END IF;
    IF p_channel_code IS NOT NULL AND v_plan.channel_codes IS NOT NULL
       AND NOT (p_channel_code = ANY (v_plan.channel_codes)) THEN
      RAISE EXCEPTION 'RATE_PLAN_CHANNEL: % is not sold on channel %', v_plan.name, p_channel_code;
    END IF;
  END IF;

  FOR i IN 0 .. v_nights - 1 LOOP
    v_day := p_check_in + i;
    v_bar := NULL; v_season := NULL;
    SELECT COALESCE(nightly_rate_gbp, weekly_rate_gbp / 7), season_name
      INTO v_bar, v_season
      FROM rates
     WHERE apartment_type_id = p_apartment_type_id AND is_active
       AND start_date <= v_day AND end_date >= v_day
     ORDER BY priority DESC, start_date DESC, created_at DESC LIMIT 1;
    IF v_bar IS NULL THEN
      v_bar := v_type.base_weekly_rate_gbp / 7;
      v_season := 'Standard';
    END IF;
    IF v_bar IS NULL THEN
      RAISE EXCEPTION 'NO_RATE: no rate configured for % on %', v_type.name, v_day;
    END IF;
    v_rate := CASE v_plan.pricing_mode
      WHEN 'percent_off'    THEN v_bar * (1 - v_plan.adjustment / 100)
      WHEN 'percent_markup' THEN v_bar * (1 + v_plan.adjustment / 100)
      WHEN 'fixed_nightly'  THEN v_plan.adjustment
      ELSE v_bar END;
    -- Each night is shown in pence; the totals keep full precision so a
    -- weekly rate of 1000 sums to 1000.00 over seven nights.
    v_rows := v_rows || jsonb_build_object('date', v_day, 'season', v_season, 'bar_gbp', round(v_bar, 2), 'rate_gbp', round(v_rate, 2));
    v_bar_total := v_bar_total + v_bar;
    v_total := v_total + v_rate;
  END LOOP;

  RETURN jsonb_build_object(
    'apartment_type_id', p_apartment_type_id,
    'apartment_type', v_type.name,
    'check_in', p_check_in,
    'check_out', p_check_out,
    'nights', v_nights,
    'currency', 'GBP',
    'bar_total_gbp', round(v_bar_total, 2),
    'total_gbp', round(v_total, 2),
    'rate_per_night_gbp', round(v_total / v_nights, 2),
    'discount_percentage', CASE WHEN v_bar_total > 0 AND v_total < v_bar_total THEN round((1 - v_total / v_bar_total) * 100, 2) ELSE 0 END,
    'nightly', v_rows,
    'rate_plan', CASE WHEN v_plan.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_plan.id, 'code', v_plan.code, 'name', v_plan.name,
      'pricing_mode', v_plan.pricing_mode, 'adjustment', v_plan.adjustment,
      'cancellation_policy', v_plan.cancellation_policy,
      'free_cancellation_days', v_plan.free_cancellation_days,
      'includes_breakfast', v_plan.includes_breakfast,
      'min_nights', v_plan.min_nights, 'max_nights', v_plan.max_nights) END
  );
END $$;

-- channel_ari: priority-aware rate lookup (otherwise identical to 00038)
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
                 ORDER BY r.priority DESC, r.start_date DESC, r.created_at DESC LIMIT 1), t.base_weekly_rate_gbp / 7) AS bar,
      COALESCE((SELECT r.min_stay_nights FROM rates r
                 WHERE r.apartment_type_id = t.id AND r.is_active AND r.start_date <= dy.day AND r.end_date >= dy.day
                 ORDER BY r.priority DESC, r.start_date DESC, r.created_at DESC LIMIT 1), 1) AS min_stay
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
-- 2. Competitor rate shops
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_shops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  apartment_type_id uuid REFERENCES apartment_types(id),
  shopped_at timestamptz NOT NULL DEFAULT now(),
  stay_date date NOT NULL,
  competitor varchar(100) NOT NULL,
  competitor_type varchar(20) NOT NULL DEFAULT 'hotel' CHECK (competitor_type IN ('hotel', 'aparthotel', 'apartment', 'resort', 'other')),
  area varchar(60),
  room_category varchar(80),
  board varchar(4) NOT NULL DEFAULT 'ro' CHECK (board IN ('ro', 'bb', 'hb', 'fb', 'ai')),
  rate_gbp numeric(10,2) NOT NULL CHECK (rate_gbp >= 0),
  rate_original numeric(10,2),
  currency varchar(3) NOT NULL DEFAULT 'GBP',
  source varchar(20) NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'import', 'agent')),
  url text,
  notes text,
  created_by uuid REFERENCES staff(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rate_shops_stay ON rate_shops (property_id, stay_date, shopped_at DESC);

-- ------------------------------------------------------------
-- 3. Pricing bands
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pricing_bands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  apartment_type_id uuid REFERENCES apartment_types(id) ON DELETE CASCADE,
  floor_gbp numeric(10,2) NOT NULL CHECK (floor_gbp >= 0),
  ceiling_gbp numeric(10,2) NOT NULL,
  target_premium_percent numeric(5,2) NOT NULL DEFAULT 15 CHECK (target_premium_percent BETWEEN -50 AND 200),
  max_daily_change_percent numeric(5,2) NOT NULL DEFAULT 10 CHECK (max_daily_change_percent BETWEEN 1 AND 50),
  auto_apply boolean NOT NULL DEFAULT false,
  horizon_weeks integer NOT NULL DEFAULT 12 CHECK (horizon_weeks BETWEEN 1 AND 52),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ceiling_gbp >= floor_gbp)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pricing_bands_type ON pricing_bands (property_id, apartment_type_id) WHERE apartment_type_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_pricing_bands_default ON pricing_bands (property_id) WHERE apartment_type_id IS NULL;
DROP TRIGGER IF EXISTS pricing_bands_updated_at ON pricing_bands;
CREATE TRIGGER pricing_bands_updated_at BEFORE UPDATE ON pricing_bands FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- 4. Recommendations (approval queue)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  apartment_type_id uuid NOT NULL REFERENCES apartment_types(id) ON DELETE CASCADE,
  batch_id varchar(40) NOT NULL,
  stay_from date NOT NULL,
  stay_to date NOT NULL,
  current_rate_gbp numeric(10,2) NOT NULL,
  recommended_rate_gbp numeric(10,2) NOT NULL,
  change_percent numeric(6,2) NOT NULL,
  floor_gbp numeric(10,2) NOT NULL,
  ceiling_gbp numeric(10,2) NOT NULL,
  comp_median_gbp numeric(10,2),
  comp_samples integer NOT NULL DEFAULT 0,
  occupancy_forecast numeric(5,4),
  pickup_7d integer NOT NULL DEFAULT 0,
  demand_score numeric(5,4),
  reasoning text NOT NULL,
  status varchar(14) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'auto_applied')),
  decided_at timestamptz,
  decided_by uuid REFERENCES staff(id),
  applied_rate_id uuid REFERENCES rates(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (stay_to > stay_from)
);
CREATE INDEX IF NOT EXISTS idx_rate_recommendations_queue ON rate_recommendations (property_id, status, stay_from);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rate_shops', 'pricing_bands', 'rate_recommendations'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_delete', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (role_at_least(10) AND can_access_property(property_id))', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (role_at_least(70) AND can_access_property(property_id))', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (role_at_least(70) AND can_access_property(property_id)) WITH CHECK (role_at_least(70) AND can_access_property(property_id))', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO authenticated USING (role_at_least(70) AND can_access_property(property_id))', t || '_delete', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated', t);
    EXECUTE format('GRANT ALL ON %I TO service_role', t);
    EXECUTE format('REVOKE ALL ON %I FROM anon', t);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 5. Apply a recommendation: agent rate row + decision record
-- ------------------------------------------------------------
-- pricing_decisions (00002) only knew the rule-based reasons; the agent adds its own.
ALTER TABLE pricing_decisions DROP CONSTRAINT IF EXISTS pricing_decisions_adjustment_reason_check;
ALTER TABLE pricing_decisions ADD CONSTRAINT pricing_decisions_adjustment_reason_check
  CHECK (adjustment_reason IN ('high_demand', 'low_demand', 'competitor', 'event', 'manual', 'seasonal', 'agent_auto', 'agent_approved'));

CREATE OR REPLACE FUNCTION apply_rate_recommendation(p_id uuid, p_actor uuid DEFAULT NULL, p_auto boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp AS $$
DECLARE v_r rate_recommendations%ROWTYPE; v_rate_id uuid; v_min_stay integer;
BEGIN
  SELECT * INTO v_r FROM rate_recommendations WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RECOMMENDATION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_r.status <> 'pending' THEN RAISE EXCEPTION 'INVALID_STATUS: recommendation is %', v_r.status USING ERRCODE = 'P0001'; END IF;
  IF v_r.recommended_rate_gbp < v_r.floor_gbp OR v_r.recommended_rate_gbp > v_r.ceiling_gbp THEN
    RAISE EXCEPTION 'OUT_OF_BAND: % is outside % .. %', v_r.recommended_rate_gbp, v_r.floor_gbp, v_r.ceiling_gbp USING ERRCODE = 'P0001';
  END IF;

  -- The minimum stay in force on the first night carries over.
  SELECT COALESCE((SELECT r.min_stay_nights FROM rates r WHERE r.apartment_type_id = v_r.apartment_type_id AND r.is_active AND r.start_date <= v_r.stay_from AND r.end_date >= v_r.stay_from ORDER BY r.priority DESC, r.start_date DESC LIMIT 1), 1) INTO v_min_stay;

  -- Earlier agent rows overlapping the window step aside (trimmed where they
  -- stick out, retired where they are covered).
  UPDATE rates SET end_date = v_r.stay_from - 1 WHERE apartment_type_id = v_r.apartment_type_id AND source = 'agent' AND is_active AND start_date < v_r.stay_from AND end_date >= v_r.stay_from AND end_date <= v_r.stay_to - 1;
  UPDATE rates SET start_date = v_r.stay_to WHERE apartment_type_id = v_r.apartment_type_id AND source = 'agent' AND is_active AND start_date >= v_r.stay_from AND start_date < v_r.stay_to AND end_date >= v_r.stay_to;
  UPDATE rates SET is_active = false WHERE apartment_type_id = v_r.apartment_type_id AND source = 'agent' AND is_active AND start_date >= v_r.stay_from AND end_date <= v_r.stay_to - 1;
  -- A row that fully contains the window is split into the part before it;
  -- the part after is recreated.
  INSERT INTO rates (property_id, apartment_type_id, season_name, start_date, end_date, weekly_rate_gbp, nightly_rate_gbp, min_stay_nights, is_active, priority, source)
  SELECT r.property_id, r.apartment_type_id, r.season_name, v_r.stay_to, r.end_date, r.weekly_rate_gbp, r.nightly_rate_gbp, r.min_stay_nights, true, r.priority, r.source
    FROM rates r WHERE r.apartment_type_id = v_r.apartment_type_id AND r.source = 'agent' AND r.is_active AND r.start_date < v_r.stay_from AND r.end_date >= v_r.stay_to;
  UPDATE rates SET end_date = v_r.stay_from - 1 WHERE apartment_type_id = v_r.apartment_type_id AND source = 'agent' AND is_active AND start_date < v_r.stay_from AND end_date >= v_r.stay_to;

  INSERT INTO rates (property_id, apartment_type_id, season_name, start_date, end_date, weekly_rate_gbp, nightly_rate_gbp, min_stay_nights, is_active, priority, source)
  VALUES (v_r.property_id, v_r.apartment_type_id, 'Agent ' || to_char(v_r.stay_from, 'DD Mon'), v_r.stay_from, v_r.stay_to - 1,
          round(v_r.recommended_rate_gbp * 7, 2), v_r.recommended_rate_gbp, v_min_stay, true, 10, 'agent')
  RETURNING id INTO v_rate_id;

  -- One decision row per type and day (uq_pricing_decisions_type_day, 00034): several
  -- windows approved on the same day update that day's row; the full trail stays in
  -- rate_recommendations and the agent rate rows.
  INSERT INTO pricing_decisions (property_id, apartment_type_id, decision_date, base_rate_gbp, recommended_rate_gbp, applied_rate_gbp, adjustment_reason, demand_score, was_accepted, accepted_by)
  VALUES (v_r.property_id, v_r.apartment_type_id, CURRENT_DATE, v_r.current_rate_gbp, v_r.recommended_rate_gbp, v_r.recommended_rate_gbp,
          CASE WHEN p_auto THEN 'agent_auto' ELSE 'agent_approved' END, v_r.demand_score, true, p_actor)
  ON CONFLICT (apartment_type_id, decision_date) DO UPDATE
    SET recommended_rate_gbp = EXCLUDED.recommended_rate_gbp, applied_rate_gbp = EXCLUDED.applied_rate_gbp,
        adjustment_reason = EXCLUDED.adjustment_reason, demand_score = EXCLUDED.demand_score,
        was_accepted = true, accepted_by = COALESCE(EXCLUDED.accepted_by, pricing_decisions.accepted_by);

  UPDATE rate_recommendations SET status = CASE WHEN p_auto THEN 'auto_applied' ELSE 'approved' END, decided_at = now(), decided_by = p_actor, applied_rate_id = v_rate_id
   WHERE id = p_id RETURNING * INTO v_r;
  RETURN jsonb_build_object('recommendation', to_jsonb(v_r), 'rate_id', v_rate_id);
END $$;

GRANT EXECUTE ON FUNCTION apply_rate_recommendation(uuid, uuid, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION apply_rate_recommendation(uuid, uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION quote_stay(uuid, date, date, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION quote_stay(uuid, date, date, uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION channel_ari(uuid, date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION channel_ari(uuid, date, date, uuid) TO authenticated, service_role;
