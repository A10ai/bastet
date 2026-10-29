-- ============================================================
-- Migration 00041: Reviews, proof report, operator pipeline — Sales module, slice 6
--
--   1. reviews: public submission through the guest's booking token
--      (review_requested_at on bookings, reviews.source 'portal'),
--      reply drafts and the OTA review feed fields
--   2. sales_reports: the weekly proof report snapshot (occupancy, ADR,
--      RevPAR, channel mix, direct share, reviews, pickup by market)
--   3. sales_accounts / sales_contacts / sales_activities: inbound tour
--      operator and corporate pipeline (identified -> contracted)
--   4. sales_weekly_proof(): the numbers behind the report
-- ============================================================

-- ------------------------------------------------------------
-- 1. Reviews
-- ------------------------------------------------------------
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS review_requested_at timestamptz;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES properties(id) ON DELETE CASCADE;
UPDATE reviews r SET property_id = b.property_id FROM bookings b WHERE b.id = r.booking_id AND r.property_id IS NULL;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS external_id varchar(80);
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS reviewer_name varchar(80);
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS language varchar(5);
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS reply_draft text;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS reply_drafted_at timestamptz;
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_source_check;
ALTER TABLE reviews ADD CONSTRAINT reviews_source_check CHECK (source IN ('direct', 'portal', 'booking_com', 'expedia', 'airbnb', 'google', 'tripadvisor', 'agoda', 'other'));
ALTER TABLE reviews ALTER COLUMN booking_id DROP NOT NULL;
ALTER TABLE reviews ALTER COLUMN guest_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_booking_portal ON reviews (booking_id) WHERE source = 'portal';
-- Full (not partial) unique index: PostgREST's ON CONFLICT (source, external_id) can only infer a non-partial index; NULL external_ids never collide.
DROP INDEX IF EXISTS uq_reviews_external;
CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_source_external ON reviews (source, external_id);
CREATE INDEX IF NOT EXISTS idx_reviews_property_created ON reviews (property_id, created_at DESC);

-- ------------------------------------------------------------
-- 2. Weekly proof report snapshots
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  kind varchar(10) NOT NULL DEFAULT 'weekly' CHECK (kind IN ('weekly', 'monthly', 'custom')),
  metrics jsonb NOT NULL,
  narrative text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, kind, period_start)
);

-- ------------------------------------------------------------
-- 3. Operator pipeline
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  kind varchar(20) NOT NULL DEFAULT 'tour_operator' CHECK (kind IN ('tour_operator', 'bed_bank', 'ota', 'travel_agent', 'corporate', 'airline', 'other')),
  market varchar(2),
  website varchar(200),
  stage varchar(16) NOT NULL DEFAULT 'identified' CHECK (stage IN ('identified', 'researched', 'contacted', 'replied', 'meeting', 'rates_sent', 'negotiating', 'contracted', 'declined', 'dormant')),
  priority smallint NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  source varchar(20) NOT NULL DEFAULT 'inbound' CHECK (source IN ('inbound', 'research', 'referral', 'event', 'other')),
  owner_staff_id uuid REFERENCES staff(id),
  next_action text,
  next_action_at date,
  notes text,
  lawful_basis varchar(40),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_accounts_stage ON sales_accounts (property_id, stage, next_action_at);
DROP TRIGGER IF EXISTS sales_accounts_updated_at ON sales_accounts;
CREATE TRIGGER sales_accounts_updated_at BEFORE UPDATE ON sales_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS sales_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES sales_accounts(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name varchar(100) NOT NULL,
  role varchar(100),
  email varchar(100),
  phone varchar(30),
  language varchar(5),
  is_primary boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_contacts_account ON sales_contacts (account_id);

CREATE TABLE IF NOT EXISTS sales_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES sales_accounts(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES sales_contacts(id) ON DELETE SET NULL,
  kind varchar(16) NOT NULL CHECK (kind IN ('note', 'email_in', 'email_out', 'call', 'meeting', 'proposal', 'stage_change')),
  summary varchar(300) NOT NULL,
  body text,
  happened_at timestamptz NOT NULL DEFAULT now(),
  staff_id uuid REFERENCES staff(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_activities_account ON sales_activities (account_id, happened_at DESC);

-- RLS
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sales_reports', 'sales_accounts', 'sales_contacts', 'sales_activities'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_delete', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (role_at_least(50) AND can_access_property(property_id))', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (role_at_least(50) AND can_access_property(property_id))', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (role_at_least(50) AND can_access_property(property_id)) WITH CHECK (role_at_least(50) AND can_access_property(property_id))', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO authenticated USING (role_at_least(70) AND can_access_property(property_id))', t || '_delete', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated', t);
    EXECUTE format('GRANT ALL ON %I TO service_role', t);
    EXECUTE format('REVOKE ALL ON %I FROM anon', t);
  END LOOP;
END $$;
-- reviews: the 00009 policies are property-less; give them a property scope with role floors.
DROP POLICY IF EXISTS reviews_select ON reviews;
DROP POLICY IF EXISTS reviews_insert ON reviews;
DROP POLICY IF EXISTS reviews_update ON reviews;
DROP POLICY IF EXISTS reviews_delete ON reviews;
CREATE POLICY reviews_select ON reviews FOR SELECT TO authenticated USING (role_at_least(10) AND (property_id IS NULL OR can_access_property(property_id)));
CREATE POLICY reviews_insert ON reviews FOR INSERT TO authenticated WITH CHECK (role_at_least(50) AND can_access_property(property_id));
CREATE POLICY reviews_update ON reviews FOR UPDATE TO authenticated USING (role_at_least(50) AND can_access_property(property_id)) WITH CHECK (role_at_least(50) AND can_access_property(property_id));
CREATE POLICY reviews_delete ON reviews FOR DELETE TO authenticated USING (role_at_least(70) AND can_access_property(property_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON reviews TO authenticated;
GRANT ALL ON reviews TO service_role;
REVOKE ALL ON reviews FROM anon;

-- ------------------------------------------------------------
-- 4. Weekly proof numbers
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION sales_weekly_proof(p_property_id uuid, p_from date, p_to date)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = public, pg_temp AS $$
  WITH rooms AS (
    SELECT COUNT(*)::int AS n FROM apartments WHERE property_id = p_property_id AND status <> 'out_of_service'
  ),
  nights AS (
    SELECT b.id, b.channel_id, b.source, b.guest_id,
           GREATEST(b.check_in, p_from) AS s, LEAST(b.check_out, p_to) AS e,
           b.rate_per_night_gbp * (1 - b.discount_percentage / 100.0) AS net_rate
      FROM bookings b
     WHERE b.property_id = p_property_id AND b.status IN ('confirmed', 'checked_in', 'checked_out')
       AND b.check_in < p_to AND b.check_out > p_from
  ),
  occ AS (
    SELECT COALESCE(SUM(e - s), 0)::int AS room_nights, COALESCE(SUM((e - s) * net_rate), 0)::numeric AS revenue
      FROM nights
  ),
  by_channel AS (
    SELECT COALESCE(c.code, 'unknown') AS code, COALESCE(c.name, 'Unknown') AS name, c.commission_rate,
           SUM(n.e - n.s)::int AS room_nights, ROUND(SUM((n.e - n.s) * n.net_rate), 2) AS revenue
      FROM nights n LEFT JOIN booking_channels c ON c.id = n.channel_id
     GROUP BY c.code, c.name, c.commission_rate
  ),
  by_source AS (
    SELECT n.source, SUM(n.e - n.s)::int AS room_nights FROM nights n GROUP BY n.source
  ),
  by_market AS (
    SELECT COALESCE(g.country, '??') AS market, SUM(n.e - n.s)::int AS room_nights, ROUND(SUM((n.e - n.s) * n.net_rate), 2) AS revenue
      FROM nights n LEFT JOIN guests g ON g.id = n.guest_id
     GROUP BY g.country ORDER BY 2 DESC LIMIT 10
  ),
  pickup AS (
    SELECT COUNT(*)::int AS bookings, COALESCE(SUM(b.nights), 0)::int AS room_nights, COALESCE(ROUND(SUM(b.total_amount_gbp), 2), 0) AS revenue
      FROM bookings b
     WHERE b.property_id = p_property_id AND b.status IN ('pending', 'confirmed', 'checked_in', 'checked_out')
       AND b.created_at >= p_from AND b.created_at < p_to
  ),
  cancels AS (
    SELECT COUNT(*)::int AS n FROM bookings b
     WHERE b.property_id = p_property_id AND b.status = 'cancelled' AND b.cancelled_at >= p_from AND b.cancelled_at < p_to
  ),
  rv AS (
    SELECT COUNT(*)::int AS n, ROUND(AVG(overall_rating)::numeric, 2) AS avg_rating,
           COUNT(*) FILTER (WHERE response IS NULL AND created_at >= p_from)::int AS unanswered
      FROM reviews WHERE property_id = p_property_id AND created_at >= p_from AND created_at < p_to
  ),
  rv_all AS (
    SELECT COUNT(*)::int AS n, ROUND(AVG(overall_rating)::numeric, 2) AS avg_rating FROM reviews WHERE property_id = p_property_id
  ),
  concierge AS (
    SELECT COUNT(DISTINCT s.id)::int AS sessions, COUNT(DISTINCT s.booking_id)::int AS bookings
      FROM concierge_sessions s WHERE s.property_id = p_property_id AND s.created_at >= p_from AND s.created_at < p_to
  )
  SELECT jsonb_build_object(
    'period_start', p_from, 'period_end', p_to, 'days', (p_to - p_from),
    'rooms', (SELECT n FROM rooms),
    'available_room_nights', (SELECT n FROM rooms) * (p_to - p_from),
    'room_nights', (SELECT room_nights FROM occ),
    'occupancy', CASE WHEN (SELECT n FROM rooms) > 0 THEN ROUND((SELECT room_nights FROM occ)::numeric / ((SELECT n FROM rooms) * (p_to - p_from)), 4) ELSE 0 END,
    'room_revenue_gbp', ROUND((SELECT revenue FROM occ), 2),
    'adr_gbp', CASE WHEN (SELECT room_nights FROM occ) > 0 THEN ROUND((SELECT revenue FROM occ) / (SELECT room_nights FROM occ), 2) ELSE 0 END,
    'revpar_gbp', CASE WHEN (SELECT n FROM rooms) > 0 THEN ROUND((SELECT revenue FROM occ) / ((SELECT n FROM rooms) * (p_to - p_from)), 2) ELSE 0 END,
    'channels', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', code, 'name', name, 'commission_rate', commission_rate, 'room_nights', room_nights, 'revenue_gbp', revenue) ORDER BY revenue DESC) FROM by_channel), '[]'::jsonb),
    'direct_share', CASE WHEN (SELECT room_nights FROM occ) > 0 THEN ROUND(COALESCE((SELECT SUM(room_nights) FROM by_source WHERE source IN ('web', 'concierge', 'staff')), 0)::numeric / (SELECT room_nights FROM occ), 4) ELSE 0 END,
    'online_share', CASE WHEN (SELECT room_nights FROM occ) > 0 THEN ROUND(COALESCE((SELECT SUM(room_nights) FROM by_source WHERE source IN ('web', 'concierge', 'channel')), 0)::numeric / (SELECT room_nights FROM occ), 4) ELSE 0 END,
    'by_source', COALESCE((SELECT jsonb_object_agg(source, room_nights) FROM by_source), '{}'::jsonb),
    'markets', COALESCE((SELECT jsonb_agg(jsonb_build_object('market', market, 'room_nights', room_nights, 'revenue_gbp', revenue)) FROM by_market), '[]'::jsonb),
    'pickup', (SELECT jsonb_build_object('bookings', bookings, 'room_nights', room_nights, 'revenue_gbp', revenue) FROM pickup),
    'cancellations', (SELECT n FROM cancels),
    'reviews', (SELECT jsonb_build_object('new', n, 'avg_rating', avg_rating, 'unanswered', unanswered) FROM rv),
    'reviews_all_time', (SELECT jsonb_build_object('count', n, 'avg_rating', avg_rating) FROM rv_all),
    'concierge', (SELECT jsonb_build_object('sessions', sessions, 'bookings', bookings) FROM concierge)
  )
$$;
GRANT EXECUTE ON FUNCTION sales_weekly_proof(uuid, date, date) TO authenticated, service_role;
REVOKE ALL ON FUNCTION sales_weekly_proof(uuid, date, date) FROM PUBLIC, anon;
