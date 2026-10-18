-- 00028: Group bookings
--
-- A group (tour operator allotment, wedding party, corporate block) is one
-- master record that owns several room bookings. Rooms are added atomically:
-- if any requested unit overlaps an existing stay, no room is created. Each
-- room keeps its own folio (charges stay accurate per stay); the organiser
-- can pay in one go and the payment is allocated across the rooms' balances.
--
-- Objects:
--   1. booking_groups table (+ RLS, grants), bookings.group_id
--   2. add_group_rooms(): atomic creation of member bookings priced by quote_stay
--   3. group_statement(): rooms, folio balances and totals for the organiser
--   4. record_group_payment(): one payment allocated across member folios
--   5. cancel_group(): cancels the group and every member not yet in house

CREATE TABLE IF NOT EXISTS booking_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  reference varchar(20) NOT NULL,
  name varchar(120) NOT NULL,
  organiser_guest_id uuid REFERENCES guests(id),
  organiser_name varchar(120),
  organiser_email varchar(255),
  organiser_phone varchar(50),
  company varchar(120),
  check_in date NOT NULL,
  check_out date NOT NULL,
  rooms_requested integer NOT NULL DEFAULT 0 CHECK (rooms_requested >= 0),
  rate_plan_id uuid REFERENCES rate_plans(id),
  channel_id uuid REFERENCES booking_channels(id),
  billing_mode varchar(20) NOT NULL DEFAULT 'individual' CHECK (billing_mode IN ('individual', 'master')),
  cutoff_date date,                              -- unassigned rooms are released after this date
  status varchar(20) NOT NULL DEFAULT 'tentative' CHECK (status IN ('tentative', 'confirmed', 'cancelled', 'completed')),
  notes text,
  created_by uuid REFERENCES staff(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, reference),
  CHECK (check_out > check_in),
  CHECK (cutoff_date IS NULL OR cutoff_date <= check_in)
);
CREATE INDEX IF NOT EXISTS idx_booking_groups_property_dates ON booking_groups (property_id, check_in);
DROP TRIGGER IF EXISTS booking_groups_updated_at ON booking_groups;
CREATE TRIGGER booking_groups_updated_at BEFORE UPDATE ON booking_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE booking_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS booking_groups_select ON booking_groups;
DROP POLICY IF EXISTS booking_groups_write ON booking_groups;
CREATE POLICY booking_groups_select ON booking_groups FOR SELECT TO authenticated
  USING (can_access_property(property_id));
CREATE POLICY booking_groups_write ON booking_groups FOR ALL TO authenticated
  USING (role_at_least(50) AND can_access_property(property_id))
  WITH CHECK (role_at_least(50) AND can_access_property(property_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON booking_groups TO authenticated;
GRANT ALL ON booking_groups TO service_role;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES booking_groups(id);
CREATE INDEX IF NOT EXISTS idx_bookings_group ON bookings (group_id) WHERE group_id IS NOT NULL;

CREATE SEQUENCE IF NOT EXISTS group_reference_seq;
CREATE OR REPLACE FUNCTION next_group_reference() RETURNS varchar
LANGUAGE plpgsql AS $$
BEGIN
  RETURN 'GRP-' || to_char(now(), 'YY') || lpad(nextval('group_reference_seq')::text, 4, '0');
END $$;

-- Add rooms to a group in one transaction. Each room is priced by quote_stay
-- with the group's rate plan (or the one given) and inherits the group's
-- dates and channel. Guests are optional: a tour operator often names them
-- later (rooming list). Any overlap raises and nothing is created.
CREATE OR REPLACE FUNCTION add_group_rooms(
  p_group_id uuid,
  p_apartment_ids uuid[],
  p_guest_ids uuid[] DEFAULT NULL,
  p_adults integer DEFAULT 2,
  p_rate_plan_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_g booking_groups%ROWTYPE;
  v_apt apartments%ROWTYPE;
  v_ch_code text;
  v_quote jsonb;
  v_id uuid;
  v_ids uuid[] := '{}';
  v_total numeric := 0;
  v_status text;
  v_guest uuid;
  i integer;
BEGIN
  SELECT * INTO v_g FROM booking_groups WHERE id = p_group_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GROUP_NOT_FOUND: group % not found', p_group_id; END IF;
  IF v_g.status IN ('cancelled', 'completed') THEN
    RAISE EXCEPTION 'GROUP_CLOSED: group % is %', v_g.reference, v_g.status;
  END IF;
  IF p_apartment_ids IS NULL OR array_length(p_apartment_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: at least one apartment is required';
  END IF;
  IF p_guest_ids IS NOT NULL AND array_length(p_guest_ids, 1) <> array_length(p_apartment_ids, 1) THEN
    RAISE EXCEPTION 'INVALID_INPUT: guest_ids must match apartment_ids one to one';
  END IF;
  IF v_g.channel_id IS NULL THEN
    SELECT id INTO v_g.channel_id FROM booking_channels WHERE code = 'direct' LIMIT 1;
  END IF;
  SELECT code INTO v_ch_code FROM booking_channels WHERE id = v_g.channel_id;
  v_status := CASE WHEN v_g.status = 'confirmed' THEN 'confirmed' ELSE 'pending' END;

  FOR i IN 1 .. array_length(p_apartment_ids, 1) LOOP
    SELECT * INTO v_apt FROM apartments WHERE id = p_apartment_ids[i];
    IF NOT FOUND THEN RAISE EXCEPTION 'APARTMENT_NOT_FOUND: apartment % not found', p_apartment_ids[i]; END IF;
    IF v_apt.property_id <> v_g.property_id THEN
      RAISE EXCEPTION 'PROPERTY_FORBIDDEN: apartment % belongs to another property', v_apt.number;
    END IF;
    IF v_apt.status IN ('maintenance', 'blocked', 'out_of_service') THEN
      RAISE EXCEPTION 'ROOM_UNAVAILABLE: apartment % is %', v_apt.number, v_apt.status;
    END IF;
    IF EXISTS (SELECT 1 FROM bookings b WHERE b.group_id = p_group_id AND b.apartment_id = v_apt.id AND b.status NOT IN ('cancelled', 'no_show')) THEN
      RAISE EXCEPTION 'DUPLICATE_ROOM: apartment % is already in this group', v_apt.number;
    END IF;
    v_guest := CASE WHEN p_guest_ids IS NULL THEN NULL ELSE p_guest_ids[i] END;
    v_quote := quote_stay(v_apt.apartment_type_id, v_g.check_in, v_g.check_out, COALESCE(p_rate_plan_id, v_g.rate_plan_id), v_ch_code);

    BEGIN
      INSERT INTO bookings (
        property_id, apartment_id, guest_id, channel_id, group_id, reference, status,
        check_in, check_out, adults, children, infants,
        rate_per_night_gbp, discount_percentage, total_amount_gbp, guest_currency,
        rate_plan_id, rate_plan_snapshot, internal_notes
      ) VALUES (
        v_g.property_id, v_apt.id, v_guest, v_g.channel_id, p_group_id, next_booking_reference(), v_status,
        v_g.check_in, v_g.check_out, GREATEST(1, p_adults), 0, 0,
        (v_quote->>'rate_per_night_gbp')::numeric, COALESCE((v_quote->>'discount_percentage')::numeric, 0),
        (v_quote->>'total_gbp')::numeric, 'GBP',
        NULLIF(v_quote->'rate_plan'->>'id', '')::uuid, v_quote->'rate_plan', 'Group ' || v_g.reference || ' (' || v_g.name || ')'
      ) RETURNING id INTO v_id;
    EXCEPTION WHEN exclusion_violation THEN
      RAISE EXCEPTION 'DOUBLE_BOOKING: apartment % is already booked for these dates', v_apt.number;
    END;
    v_ids := v_ids || v_id;
    v_total := v_total + (v_quote->>'total_gbp')::numeric;
  END LOOP;

  UPDATE booking_groups SET rooms_requested = GREATEST(rooms_requested,
    (SELECT count(*) FROM bookings WHERE group_id = p_group_id AND status NOT IN ('cancelled', 'no_show')))
  WHERE id = p_group_id;

  RETURN jsonb_build_object('group_id', p_group_id, 'booking_ids', to_jsonb(v_ids), 'rooms_added', array_length(v_ids, 1), 'total_gbp', round(v_total, 2));
END $$;

-- Rooms, balances and totals as the organiser sees them.
CREATE OR REPLACE FUNCTION group_statement(p_group_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_g booking_groups%ROWTYPE;
  v_rooms jsonb;
  v_charged numeric := 0;
  v_paid numeric := 0;
  v_balance numeric := 0;
  v_contract numeric := 0;
  v_count integer := 0;
BEGIN
  SELECT * INTO v_g FROM booking_groups WHERE id = p_group_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'GROUP_NOT_FOUND: group % not found', p_group_id; END IF;

  SELECT COALESCE(jsonb_agg(r ORDER BY r->>'apartment_number'), '[]'::jsonb),
         COALESCE(SUM((r->>'charged_gbp')::numeric), 0),
         COALESCE(SUM((r->>'paid_gbp')::numeric), 0),
         COALESCE(SUM((r->>'balance_gbp')::numeric), 0),
         COALESCE(SUM((r->>'contract_total_gbp')::numeric), 0),
         count(*)
    INTO v_rooms, v_charged, v_paid, v_balance, v_contract, v_count
  FROM (
    SELECT jsonb_build_object(
      'booking_id', b.id, 'reference', b.reference, 'status', b.status,
      'apartment_id', b.apartment_id, 'apartment_number', a.number,
      'apartment_type', t.name,
      'guest_id', b.guest_id, 'guest_name', NULLIF(trim(coalesce(g.first_name, '') || ' ' || coalesce(g.last_name, '')), ''),
      'check_in', b.check_in, 'check_out', b.check_out, 'nights', b.nights,
      'contract_total_gbp', b.total_amount_gbp,
      'folio_id', f.id, 'folio_status', f.status,
      'charged_gbp', COALESCE((SELECT SUM(fl.debit_gbp) FROM folio_lines fl WHERE fl.folio_id = f.id), 0),
      'paid_gbp', COALESCE((SELECT SUM(fl.credit_gbp) FROM folio_lines fl WHERE fl.folio_id = f.id), 0),
      'balance_gbp', COALESCE(folio_balance(f.id), 0)
    ) AS r
    FROM bookings b
    JOIN apartments a ON a.id = b.apartment_id
    LEFT JOIN apartment_types t ON t.id = a.apartment_type_id
    LEFT JOIN guests g ON g.id = b.guest_id
    LEFT JOIN folios f ON f.booking_id = b.id
    WHERE b.group_id = p_group_id AND b.status NOT IN ('cancelled', 'no_show')
  ) s;

  RETURN jsonb_build_object(
    'group', to_jsonb(v_g),
    'rooms', v_rooms,
    'room_count', v_count,
    'contract_total_gbp', round(v_contract, 2),
    'charged_gbp', round(v_charged, 2),
    'paid_gbp', round(v_paid, 2),
    'balance_gbp', round(v_balance, 2)
  );
END $$;

-- One payment from the organiser, allocated to the rooms that owe money
-- (largest balance first, then by room number). Rooms without a folio yet
-- (not checked in, no deposit) get one opened so a pre-arrival deposit can be
-- taken; an amount left over after every balance is cleared is refused rather
-- than parked, so the ledger never carries an unexplained credit.
CREATE OR REPLACE FUNCTION record_group_payment(
  p_group_id uuid,
  p_amount_gbp numeric,
  p_method text,
  p_reference text DEFAULT NULL,
  p_received_by uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_g booking_groups%ROWTYPE;
  v_left numeric := p_amount_gbp;
  v_alloc jsonb := '[]'::jsonb;
  r record;
  v_fid uuid;
  v_bal numeric;
  v_part numeric;
  v_res jsonb;
BEGIN
  IF p_amount_gbp IS NULL OR p_amount_gbp <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT: amount must be positive'; END IF;
  SELECT * INTO v_g FROM booking_groups WHERE id = p_group_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GROUP_NOT_FOUND: group % not found', p_group_id; END IF;

  FOR r IN
    SELECT b.id AS booking_id, a.number, f.id AS folio_id,
           COALESCE(folio_balance(f.id), 0) AS balance,
           CASE WHEN f.id IS NULL THEN b.total_amount_gbp ELSE 0 END AS contract
    FROM bookings b
    JOIN apartments a ON a.id = b.apartment_id
    LEFT JOIN folios f ON f.booking_id = b.id
    WHERE b.group_id = p_group_id AND b.status NOT IN ('cancelled', 'no_show', 'checked_out')
    ORDER BY COALESCE(folio_balance(f.id), 0) DESC, a.number
  LOOP
    EXIT WHEN v_left <= 0;
    v_fid := r.folio_id;
    IF v_fid IS NULL THEN
      v_fid := open_folio(r.booking_id);
    END IF;
    -- Before charges are posted the folio balance is 0; allow a deposit up to the contract total.
    v_bal := COALESCE(folio_balance(v_fid), 0);
    IF v_bal <= 0 THEN v_bal := r.contract; END IF;
    IF v_bal <= 0 THEN CONTINUE; END IF;
    v_part := LEAST(v_left, v_bal);
    v_res := record_folio_payment(v_fid, v_part, p_method, NULL, 'GBP', NULL,
               COALESCE(p_reference, 'Group ' || v_g.reference), p_received_by,
               COALESCE(p_notes, 'Group payment ' || v_g.reference), 'staff');
    v_alloc := v_alloc || jsonb_build_object('booking_id', r.booking_id, 'apartment_number', r.number, 'folio_id', v_fid, 'amount_gbp', v_part);
    v_left := v_left - v_part;
  END LOOP;

  IF v_left > 0.005 THEN
    RAISE EXCEPTION 'OVERPAYMENT: % GBP exceeds what the group''s rooms owe (allocated %)', p_amount_gbp, p_amount_gbp - v_left;
  END IF;

  RETURN jsonb_build_object('group_id', p_group_id, 'amount_gbp', p_amount_gbp, 'allocations', v_alloc);
END $$;

-- Cancel the group: members not yet in house are cancelled with the reason.
CREATE OR REPLACE FUNCTION cancel_group(p_group_id uuid, p_reason text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE v_g booking_groups%ROWTYPE; v_n integer;
BEGIN
  SELECT * INTO v_g FROM booking_groups WHERE id = p_group_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GROUP_NOT_FOUND: group % not found', p_group_id; END IF;
  IF v_g.status = 'cancelled' THEN RAISE EXCEPTION 'INVALID_STATUS: group % is already cancelled', v_g.reference; END IF;
  UPDATE bookings SET status = 'cancelled',
         internal_notes = COALESCE(internal_notes, '') || E'\nCancelled with group ' || v_g.reference || COALESCE(': ' || p_reason, '')
   WHERE group_id = p_group_id AND status IN ('pending', 'confirmed');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  UPDATE booking_groups SET status = 'cancelled', notes = COALESCE(notes, '') || CASE WHEN p_reason IS NULL THEN '' ELSE E'\nCancelled: ' || p_reason END
   WHERE id = p_group_id;
  RETURN jsonb_build_object('group_id', p_group_id, 'rooms_cancelled', v_n);
END $$;

GRANT EXECUTE ON FUNCTION next_group_reference() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION add_group_rooms(uuid, uuid[], uuid[], integer, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION group_statement(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION record_group_payment(uuid, numeric, text, text, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION cancel_group(uuid, text) TO authenticated, service_role;
GRANT USAGE ON SEQUENCE group_reference_seq TO authenticated, service_role;
