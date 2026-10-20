-- 00027: Rate plans
--
-- Named pricing and cancellation rules layered on the seasonal Best Available
-- Rate (BAR) in `rates`. A booking records which plan priced it and a snapshot
-- of that plan, so later edits to the plan never change a sold stay.
--
-- Objects:
--   1. rate_plans table (+ single-default trigger, RLS, grants)
--   2. bookings.rate_plan_id, bookings.rate_plan_snapshot
--   3. quote_stay(): per-night BAR lookup + plan adjustment + plan rules
--   4. A default BAR plan for every existing property

CREATE TABLE IF NOT EXISTS rate_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  code varchar(30) NOT NULL,
  name varchar(100) NOT NULL,
  description text,
  -- bar: the seasonal rate as is; percent_off/percent_markup: adjustment is a
  -- percentage of BAR; fixed_nightly: adjustment is the nightly price in GBP
  pricing_mode varchar(20) NOT NULL DEFAULT 'bar'
    CHECK (pricing_mode IN ('bar', 'percent_off', 'percent_markup', 'fixed_nightly')),
  adjustment numeric(10,2) NOT NULL DEFAULT 0 CHECK (adjustment >= 0),
  cancellation_policy varchar(20) NOT NULL DEFAULT 'flexible'
    CHECK (cancellation_policy IN ('flexible', 'moderate', 'strict', 'non_refundable')),
  free_cancellation_days integer NOT NULL DEFAULT 1 CHECK (free_cancellation_days >= 0),
  min_nights integer NOT NULL DEFAULT 1 CHECK (min_nights >= 1),
  max_nights integer CHECK (max_nights IS NULL OR max_nights >= min_nights),
  includes_breakfast boolean NOT NULL DEFAULT false,
  valid_from date,
  valid_to date,
  channel_codes text[],                      -- NULL = sold on every channel
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, code),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from),
  CHECK (pricing_mode NOT IN ('percent_off') OR adjustment <= 100)
);
CREATE INDEX IF NOT EXISTS idx_rate_plans_property_active ON rate_plans (property_id) WHERE is_active;

DROP TRIGGER IF EXISTS rate_plans_updated_at ON rate_plans;
CREATE TRIGGER rate_plans_updated_at BEFORE UPDATE ON rate_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Exactly one default plan per property: setting a new default clears the old one.
CREATE OR REPLACE FUNCTION rate_plans_single_default() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE rate_plans SET is_default = false
    WHERE property_id = NEW.property_id AND id <> NEW.id AND is_default;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS rate_plans_single_default ON rate_plans;
CREATE TRIGGER rate_plans_single_default BEFORE INSERT OR UPDATE OF is_default ON rate_plans
  FOR EACH ROW EXECUTE FUNCTION rate_plans_single_default();

ALTER TABLE rate_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rate_plans_select ON rate_plans;
DROP POLICY IF EXISTS rate_plans_manage ON rate_plans;
CREATE POLICY rate_plans_select ON rate_plans FOR SELECT TO authenticated
  USING (can_access_property(property_id));
CREATE POLICY rate_plans_manage ON rate_plans FOR ALL TO authenticated
  USING (role_at_least(70) AND can_access_property(property_id))
  WITH CHECK (role_at_least(70) AND can_access_property(property_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON rate_plans TO authenticated;
GRANT ALL ON rate_plans TO service_role;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS rate_plan_id uuid REFERENCES rate_plans(id);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS rate_plan_snapshot jsonb;
CREATE INDEX IF NOT EXISTS idx_bookings_rate_plan ON bookings (rate_plan_id) WHERE rate_plan_id IS NOT NULL;

-- Price a stay night by night. Errors use the 'CODE: detail' convention mapped
-- by src/lib/rpc-error.ts. SECURITY INVOKER: callers see only their property's
-- rows through RLS.
CREATE OR REPLACE FUNCTION quote_stay(
  p_apartment_type_id uuid,
  p_check_in date,
  p_check_out date,
  p_rate_plan_id uuid DEFAULT NULL,
  p_channel_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
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
     ORDER BY start_date DESC LIMIT 1;
    IF v_bar IS NULL THEN
      v_bar := v_type.base_weekly_rate_gbp / 7;
      v_season := 'Standard';
    END IF;
    IF v_bar IS NULL THEN
      RAISE EXCEPTION 'NO_RATE: no rate configured for % on %', v_type.name, v_day;
    END IF;
    v_bar := round(v_bar, 2);
    v_rate := CASE v_plan.pricing_mode
      WHEN 'percent_off'    THEN v_bar * (1 - v_plan.adjustment / 100)
      WHEN 'percent_markup' THEN v_bar * (1 + v_plan.adjustment / 100)
      WHEN 'fixed_nightly'  THEN v_plan.adjustment
      ELSE v_bar END;
    v_rate := round(v_rate, 2);
    v_rows := v_rows || jsonb_build_object('date', v_day, 'season', v_season, 'bar_gbp', v_bar, 'rate_gbp', v_rate);
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
GRANT EXECUTE ON FUNCTION quote_stay(uuid, date, date, uuid, text) TO authenticated, service_role;

-- Every property gets a BAR plan so existing booking flows keep pricing as before.
INSERT INTO rate_plans (property_id, code, name, description, pricing_mode, cancellation_policy, free_cancellation_days, is_default)
SELECT id, 'BAR', 'Best Available Rate', 'Seasonal rate. Free cancellation until the day before arrival.', 'bar', 'flexible', 1, true
FROM properties
ON CONFLICT (property_id, code) DO NOTHING;
