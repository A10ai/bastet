-- ============================================================
-- Migration 00025: Night audit, business date, idempotency
--   1. properties.last_business_date + daily_closes ledger of each close
--   2. run_night_audit(): no-show sweep, day-close snapshot, date rollover
--   3. system_events.idempotency_key so an event is processed once
--   4. workflows.version for optimistic concurrency on step execution
-- ============================================================

-- 1. Business date tracking ----------------------------------------------
ALTER TABLE properties ADD COLUMN IF NOT EXISTS last_business_date DATE;

CREATE TABLE IF NOT EXISTS daily_closes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,
  closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_by TEXT NOT NULL DEFAULT 'system',
  arrivals_expected INT NOT NULL DEFAULT 0,
  arrivals_checked_in INT NOT NULL DEFAULT 0,
  no_shows_marked INT NOT NULL DEFAULT 0,
  departures_expected INT NOT NULL DEFAULT 0,
  departures_checked_out INT NOT NULL DEFAULT 0,
  still_in_house_past_checkout INT NOT NULL DEFAULT 0,
  rooms_occupied INT NOT NULL DEFAULT 0,
  rooms_total INT NOT NULL DEFAULT 0,
  occupancy_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  room_revenue_gbp DECIMAL(12,2) NOT NULL DEFAULT 0,
  payments_received_gbp DECIMAL(12,2) NOT NULL DEFAULT 0,
  notes JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (property_id, business_date)
);
CREATE INDEX IF NOT EXISTS idx_daily_closes_property_date ON daily_closes (property_id, business_date DESC);

ALTER TABLE daily_closes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS daily_closes_management_select ON daily_closes;
DROP POLICY IF EXISTS daily_closes_admin_write ON daily_closes;
CREATE POLICY daily_closes_management_select ON daily_closes FOR SELECT TO authenticated
  USING (role_at_least(70) AND can_access_property(property_id));
CREATE POLICY daily_closes_admin_write ON daily_closes FOR ALL TO authenticated
  USING (role_at_least(90) AND can_access_property(property_id)) WITH CHECK (role_at_least(90));
GRANT ALL ON daily_closes TO anon, authenticated, service_role;

-- 2. Night audit ------------------------------------------------------------
-- Closes `p_business_date` (default: yesterday in the property's timezone,
-- i.e. the day that just ended). Idempotent: a second run for the same date
-- returns the existing close without re-marking anything.
CREATE OR REPLACE FUNCTION run_night_audit(
  p_property_id UUID,
  p_business_date DATE DEFAULT NULL,
  p_actor TEXT DEFAULT 'system'
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_date        DATE;
  v_existing    daily_closes%ROWTYPE;
  v_close       daily_closes%ROWTYPE;
  v_arr_exp     INT; v_arr_in INT; v_noshow INT;
  v_dep_exp     INT; v_dep_out INT; v_overstay INT;
  v_occ         INT; v_total INT;
  v_room_rev    NUMERIC; v_payments NUMERIC;
BEGIN
  v_date := COALESCE(p_business_date, property_business_date(p_property_id) - 1);

  SELECT * INTO v_existing FROM daily_closes
   WHERE property_id = p_property_id AND business_date = v_date;
  IF FOUND THEN
    RETURN jsonb_build_object('already_closed', true, 'close', to_jsonb(v_existing));
  END IF;

  -- Lock the property row so two audits cannot run concurrently.
  PERFORM 1 FROM properties WHERE id = p_property_id FOR UPDATE;

  -- Arrivals for the day
  SELECT COUNT(*) FILTER (WHERE status IN ('confirmed','checked_in','checked_out','no_show')),
         COUNT(*) FILTER (WHERE status IN ('checked_in','checked_out'))
    INTO v_arr_exp, v_arr_in
    FROM bookings WHERE property_id = p_property_id AND check_in = v_date;

  -- No-show sweep: confirmed arrivals that never checked in by close of day
  WITH marked AS (
    UPDATE bookings
       SET status = 'no_show', internal_notes = concat_ws(E'\n', internal_notes, format('Marked no-show by night audit for %s', v_date))
     WHERE property_id = p_property_id AND status = 'confirmed' AND check_in <= v_date
     RETURNING id
  ) SELECT COUNT(*) INTO v_noshow FROM marked;

  -- Departures for the day
  SELECT COUNT(*) FILTER (WHERE status IN ('checked_in','checked_out')),
         COUNT(*) FILTER (WHERE status = 'checked_out'),
         COUNT(*) FILTER (WHERE status = 'checked_in')
    INTO v_dep_exp, v_dep_out, v_overstay
    FROM bookings WHERE property_id = p_property_id AND check_out = v_date;

  -- Occupancy at close: stays in house that night
  SELECT COUNT(*) INTO v_occ FROM bookings
   WHERE property_id = p_property_id AND status IN ('checked_in','checked_out')
     AND check_in <= v_date AND check_out > v_date;
  SELECT COUNT(*) INTO v_total FROM apartments
   WHERE property_id = p_property_id AND status <> 'out_of_service';

  -- Room revenue earned that night (rate per occupied stay-night) and cash received that day
  SELECT COALESCE(SUM(rate_per_night_gbp * (1 - discount_percentage / 100.0)), 0) INTO v_room_rev
    FROM bookings
   WHERE property_id = p_property_id AND status IN ('checked_in','checked_out')
     AND check_in <= v_date AND check_out > v_date;
  SELECT COALESCE(SUM(p.amount_gbp), 0) INTO v_payments
    FROM payments p JOIN invoices i ON i.id = p.invoice_id
   WHERE i.property_id = p_property_id AND p.status = 'completed'
     AND (p.received_at AT TIME ZONE COALESCE((SELECT timezone FROM properties WHERE id = p_property_id), 'UTC'))::date = v_date;

  INSERT INTO daily_closes (property_id, business_date, closed_by, arrivals_expected, arrivals_checked_in,
      no_shows_marked, departures_expected, departures_checked_out, still_in_house_past_checkout,
      rooms_occupied, rooms_total, occupancy_percent, room_revenue_gbp, payments_received_gbp)
  VALUES (p_property_id, v_date, p_actor, v_arr_exp, v_arr_in, v_noshow, v_dep_exp, v_dep_out, v_overstay,
      v_occ, v_total, CASE WHEN v_total > 0 THEN ROUND(v_occ::numeric / v_total * 100, 2) ELSE 0 END,
      ROUND(v_room_rev, 2), ROUND(v_payments, 2))
  RETURNING * INTO v_close;

  UPDATE properties SET last_business_date = v_date WHERE id = p_property_id;

  RETURN jsonb_build_object('already_closed', false, 'close', to_jsonb(v_close));
END;
$$;

-- 3. Event idempotency --------------------------------------------------
ALTER TABLE system_events ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_system_events_idempotency
  ON system_events (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 4. Workflow optimistic concurrency -----------------------------------
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION bump_workflow_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version := OLD.version + 1;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_workflows_version ON workflows;
CREATE TRIGGER trg_workflows_version BEFORE UPDATE ON workflows
  FOR EACH ROW EXECUTE FUNCTION bump_workflow_version();
