-- ============================================================
-- Migration 00036: Fixes from the independent review of 00033-00035
-- (deep test, Oct 2026). All reproduced on 00001-00035:
--
--   * an early departure left tonight's room, VAT and levy on the closed
--     folio, where it could be neither paid nor voided (FOLIO_CLOSED);
--     daily_closes overstated room revenue
--   * a receptionist could check a guest out unpaid by calling
--     checkout_booking(id, null, true) directly; callers could also forge
--     who received, refunded or posted money, and the loyalty points rate
--   * refunding a payment after the folio invoice was re-issued synced the
--     cancelled invoice, leaving the current one 'paid'
--   * booking contract and posted room charges disagreed by pennies (per-
--     night rounding of rate and VAT), so a fully prepaid stay still owed
--     0.01-0.02 at checkout; room nights also applied the rate plan's
--     discount twice (rate_per_night_gbp is already discounted by
--     quote_stay, and discount_percentage was applied again)
--   * audit rows written through the service role had no property, so
--     admins could not see them
--   * a duplicate event replayed by another non-manager user returned an
--     empty event id
--   * the two duplicate-protection indexes were skipped when started or
--     assigned duplicates existed
--   * pre-existing: staff, properties, currency_rates and pricing_decisions
--     had no write policies, so the user-scoped routes that write them
--     always failed under RLS
--
-- Idempotent. Re-running 00033 or 00034 after this file reinstates their
-- versions of the objects redefined here: re-run 00033 onwards in order.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Room nights: one source of truth for what a night costs
-- ------------------------------------------------------------
-- The booked total split evenly over the nights, in pence, with the
-- remainder spread so the nights add up to the total exactly
-- (7 nights of 1000.00 -> 142.86, 142.85, 142.86, 142.86, 142.85, 142.86,
-- 142.86). total_amount_gbp is already net of the rate plan and any
-- length-of-stay discount. Bookings without a total fall back to the rate.
CREATE OR REPLACE FUNCTION booking_night_net(b bookings, p_date DATE)
RETURNS NUMERIC
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN b.total_amount_gbp IS NOT NULL AND b.total_amount_gbp > 0 AND b.check_out > b.check_in THEN
      ROUND(b.total_amount_gbp * (p_date - b.check_in + 1) / (b.check_out - b.check_in), 2)
      - ROUND(b.total_amount_gbp * (p_date - b.check_in) / (b.check_out - b.check_in), 2)
    ELSE ROUND(b.rate_per_night_gbp * (1 - COALESCE(b.discount_percentage, 0) / 100.0), 2)
  END;
$$;

-- What the whole stay costs: exactly what post_room_charges posts, night
-- by night (net, VAT rounded per night, levy).
CREATE OR REPLACE FUNCTION booking_contract_gross(p_booking_id UUID)
RETURNS NUMERIC
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(SUM(n.net
                      + CASE WHEN COALESCE(p.vat_rate_percent, 0) > 0 THEN ROUND(n.net * p.vat_rate_percent / 100, 2) ELSE 0 END
                      + GREATEST(COALESCE(p.tourism_levy_per_night_gbp, 0), 0)), 0)
    FROM bookings b
    JOIN properties p ON p.id = b.property_id
    CROSS JOIN LATERAL (
      SELECT booking_night_net(b, d::date) AS net
        FROM generate_series(b.check_in, b.check_out - 1, INTERVAL '1 day') d
    ) n
   WHERE b.id = p_booking_id;
$$;

-- Room, VAT and levy for one night; every in-house stay, or one booking.
-- Idempotent. Internal: called by the night audit and check-out.
-- A stay that has left is never charged again: its folio is closed, or it
-- checked out on or before this business date (early departure).
CREATE OR REPLACE FUNCTION post_room_charges(p_property_id UUID, p_business_date DATE, p_actor TEXT DEFAULT 'night_audit', p_booking_id UUID DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE v_b bookings%ROWTYPE; v_folio UUID; v_fstatus TEXT; v_vat NUMERIC; v_levy NUMERIC; v_tz TEXT; v_net NUMERIC; v_tax NUMERIC; v_count INT := 0;
BEGIN
  SELECT vat_rate_percent, tourism_levy_per_night_gbp, COALESCE(timezone, 'UTC') INTO v_vat, v_levy, v_tz FROM properties WHERE id = p_property_id;
  FOR v_b IN
    SELECT * FROM bookings
     WHERE property_id = p_property_id AND status IN ('checked_in', 'checked_out')
       AND check_in <= p_business_date AND check_out > p_business_date
       AND (p_booking_id IS NULL OR id = p_booking_id)
       AND NOT (status = 'checked_out'
                AND (checked_out_at IS NULL OR (checked_out_at AT TIME ZONE v_tz)::date <= p_business_date))
  LOOP
    SELECT id, status INTO v_folio, v_fstatus FROM folios WHERE booking_id = v_b.id;
    IF v_folio IS NULL THEN
      v_folio := open_folio(v_b.id);
    ELSIF v_fstatus <> 'open' THEN
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM folio_lines WHERE folio_id = v_folio AND type = 'room' AND business_date = p_business_date) THEN CONTINUE; END IF;
    v_net := booking_night_net(v_b, p_business_date);
    INSERT INTO folio_lines (folio_id, business_date, posted_by, type, description, quantity, unit_amount_gbp, debit_gbp, tax_rate_percent, reference_type, reference_id)
    VALUES (v_folio, p_business_date, p_actor, 'room', format('Accommodation %s', p_business_date), 1, v_net, v_net, v_vat, 'booking', v_b.id);
    IF v_vat > 0 THEN
      v_tax := ROUND(v_net * v_vat / 100, 2);
      INSERT INTO folio_lines (folio_id, business_date, posted_by, type, description, quantity, unit_amount_gbp, debit_gbp, tax_rate_percent, reference_type, reference_id)
      VALUES (v_folio, p_business_date, p_actor, 'tax', format('VAT %s%% on accommodation', v_vat), 1, v_tax, v_tax, v_vat, 'room_night', v_b.id);
    END IF;
    IF v_levy > 0 THEN
      INSERT INTO folio_lines (folio_id, business_date, posted_by, type, description, quantity, unit_amount_gbp, debit_gbp, reference_type, reference_id)
      VALUES (v_folio, p_business_date, p_actor, 'levy', format('Tourism levy %s', p_business_date), 1, v_levy, v_levy, 'room_night', v_b.id);
    END IF;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;
REVOKE EXECUTE ON FUNCTION post_room_charges(UUID, DATE, TEXT, UUID) FROM PUBLIC, anon, authenticated, service_role;

-- Revenue by stay date uses the same per-night amount as the folio.
CREATE OR REPLACE FUNCTION revenue_by_stay_date(p_property_id UUID, p_from DATE, p_to DATE)
RETURNS TABLE (stay_date DATE, room_nights INT, room_revenue_gbp NUMERIC, rooms_available INT)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  WITH days AS (SELECT generate_series(p_from, p_to, '1 day')::date AS d),
  rooms AS (SELECT COUNT(*)::int AS n FROM apartments WHERE property_id = p_property_id AND status <> 'out_of_service')
  SELECT d.d,
         COUNT(b.id)::int,
         ROUND(COALESCE(SUM(booking_night_net(b, d.d)), 0), 2),
         (SELECT n FROM rooms)
    FROM days d
    LEFT JOIN bookings b ON b.property_id = p_property_id AND b.status IN ('confirmed','checked_in','checked_out')
         AND b.check_in <= d.d AND b.check_out > d.d
   GROUP BY d.d ORDER BY d.d;
$$;

-- ------------------------------------------------------------
-- 2. Check-out: the unpaid override is a manager's decision, and the
--    loyalty rate is not the caller's to choose
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION checkout_booking(
  p_booking_id UUID, p_notes TEXT DEFAULT NULL, p_allow_outstanding_balance BOOLEAN DEFAULT FALSE, p_points_per_gbp NUMERIC DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_b bookings%ROWTYPE; v_today DATE; v_folio UUID; v_outstanding NUMERIC := 0; v_points INT := 0; v_balance INT := 0; v_tier TEXT; v_task_id UUID; v_d DATE;
        v_ppg NUMERIC := p_points_per_gbp;
BEGIN
  SELECT * INTO v_b FROM bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  PERFORM require_staff(v_b.property_id, 50, 'BOOKING_NOT_FOUND');
  IF NOT is_trusted_caller() THEN
    IF COALESCE(p_allow_outstanding_balance, false) AND NOT role_at_least(70) THEN
      RAISE EXCEPTION 'ROLE_FORBIDDEN: only a manager can check out a stay with an unpaid balance' USING ERRCODE = '42501';
    END IF;
    v_ppg := 10;  -- POINTS_PER_GBP_ROOM (src/lib/constants.ts)
  END IF;
  v_ppg := LEAST(GREATEST(COALESCE(v_ppg, 10), 0), 100);
  IF v_b.status <> 'checked_in' THEN RAISE EXCEPTION 'INVALID_STATUS: booking is %, must be checked_in', v_b.status USING ERRCODE = 'P0001'; END IF;
  v_today := property_business_date(v_b.property_id);
  v_folio := open_folio(v_b.id);

  -- Post this stay's nights not yet charged. An early departure is charged
  -- for the nights stayed, and a stay that occupied the room at least one.
  v_d := v_b.check_in;
  WHILE v_d < GREATEST(LEAST(v_b.check_out, v_today), v_b.check_in + 1) LOOP
    PERFORM post_room_charges(v_b.property_id, v_d, 'checkout', v_b.id);
    v_d := v_d + 1;
  END LOOP;

  v_outstanding := folio_balance(v_folio);
  IF v_outstanding > 0.005 AND NOT COALESCE(p_allow_outstanding_balance, false) THEN
    RAISE EXCEPTION 'OUTSTANDING_BALANCE: % GBP unpaid on this stay', ROUND(v_outstanding, 2) USING ERRCODE = 'P0001';
  END IF;

  UPDATE bookings SET status = 'checked_out', checked_out_at = NOW(),
         internal_notes = CASE WHEN p_notes IS NULL OR p_notes = '' THEN internal_notes ELSE concat_ws(E'\n', internal_notes, p_notes) END
   WHERE id = p_booking_id RETURNING * INTO v_b;
  UPDATE apartments SET status = 'cleaning' WHERE id = v_b.apartment_id;
  SELECT id INTO v_task_id FROM housekeeping_tasks
   WHERE apartment_id = v_b.apartment_id AND scheduled_date = v_today AND type = 'checkout_clean'
     AND status NOT IN ('completed', 'verified') LIMIT 1;
  IF v_task_id IS NULL THEN
    BEGIN
      INSERT INTO housekeeping_tasks (property_id, apartment_id, type, status, priority, scheduled_date)
      VALUES (v_b.property_id, v_b.apartment_id, 'checkout_clean', 'pending', 'high', v_today) RETURNING id INTO v_task_id;
    EXCEPTION WHEN unique_violation THEN
      SELECT id INTO v_task_id FROM housekeeping_tasks
       WHERE apartment_id = v_b.apartment_id AND scheduled_date = v_today AND type = 'checkout_clean'
         AND status NOT IN ('completed', 'verified') LIMIT 1;
    END;
  END IF;

  IF v_outstanding <= 0.005 THEN
    UPDATE folios SET status = 'closed', closed_at = NOW(), closed_by = 'checkout', updated_at = NOW() WHERE id = v_folio;
  END IF;

  IF v_b.guest_id IS NOT NULL THEN
    v_points := FLOOR(v_b.total_amount_gbp * v_ppg)::INT;
    UPDATE guests SET total_stays = total_stays + 1, total_nights = total_nights + v_b.nights,
           total_spend_gbp = total_spend_gbp + v_b.total_amount_gbp, loyalty_points = loyalty_points + v_points,
           loyalty_tier = CASE WHEN loyalty_points + v_points >= 15000 THEN 'platinum' WHEN loyalty_points + v_points >= 5000 THEN 'gold'
                               WHEN loyalty_points + v_points >= 1000 THEN 'silver' ELSE 'bronze' END
     WHERE id = v_b.guest_id RETURNING loyalty_points, loyalty_tier INTO v_balance, v_tier;
    INSERT INTO loyalty_programme (guest_id, transaction_type, points, balance_after, description, reference_type, reference_id)
    VALUES (v_b.guest_id, 'earn', v_points, v_balance, format('Checkout: %s nights, GBP %s', v_b.nights, v_b.total_amount_gbp), 'booking', v_b.id);
  END IF;

  RETURN jsonb_build_object('booking', to_jsonb(v_b), 'folio_id', v_folio, 'housekeeping_task_id', v_task_id,
                            'points_earned', v_points, 'loyalty_tier', v_tier, 'outstanding_gbp', ROUND(v_outstanding, 2));
END;
$$;

-- Who did it is the signed-in staff member, not a parameter. Trusted
-- callers (service role: cron, night audit) keep what they pass.
CREATE OR REPLACE FUNCTION ledger_stamp_actor()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_staff UUID; v_label TEXT;
BEGIN
  IF is_trusted_caller() THEN RETURN NEW; END IF;
  v_staff := get_staff_id();
  SELECT COALESCE(NULLIF(email, ''), first_name || ' ' || last_name) INTO v_label FROM staff WHERE id = v_staff;
  v_label := COALESCE(v_label, auth.uid()::text, 'staff');
  IF TG_TABLE_NAME = 'folio_lines' THEN
    NEW.posted_by := v_label;
  ELSIF TG_TABLE_NAME = 'payments' THEN
    NEW.received_by := v_staff;
  ELSIF TG_TABLE_NAME = 'refunds' THEN
    NEW.refunded_by := v_staff;
  ELSIF TG_TABLE_NAME = 'pos_tickets' THEN
    NEW.posted_by := v_staff;
    NEW.posted_by_name := v_label;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_folio_lines_stamp_actor ON folio_lines;
CREATE TRIGGER trg_folio_lines_stamp_actor BEFORE INSERT ON folio_lines FOR EACH ROW EXECUTE FUNCTION ledger_stamp_actor();
DROP TRIGGER IF EXISTS trg_payments_stamp_actor ON payments;
CREATE TRIGGER trg_payments_stamp_actor BEFORE INSERT ON payments FOR EACH ROW EXECUTE FUNCTION ledger_stamp_actor();
DROP TRIGGER IF EXISTS trg_refunds_stamp_actor ON refunds;
CREATE TRIGGER trg_refunds_stamp_actor BEFORE INSERT ON refunds FOR EACH ROW EXECUTE FUNCTION ledger_stamp_actor();
DROP TRIGGER IF EXISTS trg_pos_tickets_stamp_actor ON pos_tickets;
CREATE TRIGGER trg_pos_tickets_stamp_actor BEFORE INSERT ON pos_tickets FOR EACH ROW EXECUTE FUNCTION ledger_stamp_actor();

-- ------------------------------------------------------------
-- 3. Refunds sync the folio's current invoice (and the payment's own)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION refund_payment(
  p_payment_id UUID, p_amount_gbp NUMERIC, p_reason TEXT, p_refunded_by UUID DEFAULT NULL, p_reference TEXT DEFAULT NULL, p_actor TEXT DEFAULT 'manager'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_pay payments%ROWTYPE; v_prop UUID; v_refunded NUMERIC; v_r refunds%ROWTYPE; v_current UUID;
BEGIN
  PERFORM assert_money(p_amount_gbp);
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN RAISE EXCEPTION 'REASON_REQUIRED: a refund needs a reason' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_pay FROM payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  SELECT COALESCE((SELECT property_id FROM folios WHERE id = v_pay.folio_id), (SELECT property_id FROM invoices WHERE id = v_pay.invoice_id))
    INTO v_prop;
  PERFORM require_staff(v_prop, 70, 'PAYMENT_NOT_FOUND');
  IF v_pay.status NOT IN ('completed', 'partially_refunded') THEN RAISE EXCEPTION 'INVALID_STATUS: payment is %', v_pay.status USING ERRCODE = 'P0001'; END IF;
  SELECT COALESCE(SUM(amount_gbp), 0) INTO v_refunded FROM refunds WHERE payment_id = p_payment_id;
  IF p_amount_gbp > v_pay.amount_gbp - v_refunded + 0.005 THEN
    RAISE EXCEPTION 'OVER_REFUND: only % GBP of this payment is refundable', ROUND(v_pay.amount_gbp - v_refunded, 2) USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO refunds (payment_id, folio_id, amount_gbp, method, reason, reference, refunded_by)
  VALUES (p_payment_id, v_pay.folio_id, p_amount_gbp, v_pay.method, p_reason, p_reference, p_refunded_by) RETURNING * INTO v_r;
  UPDATE payments SET status = CASE WHEN v_refunded + p_amount_gbp >= v_pay.amount_gbp - 0.005 THEN 'refunded' ELSE 'partially_refunded' END WHERE id = p_payment_id;
  IF v_pay.folio_id IS NOT NULL THEN
    INSERT INTO folio_lines (folio_id, business_date, posted_by, type, description, quantity, unit_amount_gbp, debit_gbp, reference_type, reference_id)
    VALUES (v_pay.folio_id, property_business_date(v_prop), p_actor, 'refund', format('Refund: %s', p_reason), 1, p_amount_gbp, p_amount_gbp, 'refund', v_r.id);
    -- The folio may have been re-invoiced since the payment was taken.
    SELECT invoice_id INTO v_current FROM folios WHERE id = v_pay.folio_id;
    PERFORM sync_invoice_status(v_current);
  END IF;
  IF v_pay.invoice_id IS DISTINCT FROM v_current THEN
    PERFORM sync_invoice_status(v_pay.invoice_id);
  END IF;
  RETURN jsonb_build_object('refund', to_jsonb(v_r), 'balance_gbp', CASE WHEN v_pay.folio_id IS NULL THEN NULL ELSE folio_balance(v_pay.folio_id) END);
END $$;

-- ------------------------------------------------------------
-- 4. Audit rows written by the service role belong to the actor's property
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION audit_log_fill_property()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_prop UUID;
BEGIN
  IF NEW.property_id IS NULL THEN
    v_prop := try_uuid(NEW.metadata->>'property_id');
    IF v_prop IS NOT NULL AND EXISTS (SELECT 1 FROM properties WHERE id = v_prop) THEN
      NEW.property_id := v_prop;
    ELSE
      NEW.property_id := COALESCE(
        get_staff_property_id(),
        (SELECT s.property_id FROM staff s WHERE s.auth_user_id = try_uuid(NEW.user_id) LIMIT 1));
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- ------------------------------------------------------------
-- 5. Event replays: the stable id of an event the caller's property owns,
--    even when the select policy hides another user's row (no payload or
--    results are returned).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION system_event_id_by_key(p_key TEXT)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT e.id FROM system_events e
   WHERE e.idempotency_key = p_key
     AND (is_trusted_caller() OR (role_at_least(30) AND (e.property_id IS NULL OR can_access_property(e.property_id))))
   LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION system_event_id_by_key(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION system_event_id_by_key(TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 6. Duplicate protection always in place: merge duplicates, then index
-- ------------------------------------------------------------
-- Open checkout cleans: keep the most advanced per unit and day (started,
-- then assigned, then oldest). Untouched copies go; a copy someone already
-- started is closed as a duplicate (there is no cancelled status).
WITH ranked AS (
  SELECT id, started_at,
         row_number() OVER (PARTITION BY apartment_id, scheduled_date
                            ORDER BY (started_at IS NOT NULL) DESC, (status = 'in_progress') DESC,
                                     (assigned_to IS NOT NULL) DESC, created_at, id) AS rn,
         first_value(id) OVER (PARTITION BY apartment_id, scheduled_date
                               ORDER BY (started_at IS NOT NULL) DESC, (status = 'in_progress') DESC,
                                        (assigned_to IS NOT NULL) DESC, created_at, id) AS keeper
    FROM housekeeping_tasks
   WHERE type = 'checkout_clean' AND status NOT IN ('completed', 'verified')
)
DELETE FROM housekeeping_tasks h USING ranked r
 WHERE h.id = r.id AND r.rn > 1 AND r.started_at IS NULL;
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY apartment_id, scheduled_date
                            ORDER BY (status = 'in_progress') DESC, started_at, created_at, id) AS rn,
         first_value(id) OVER (PARTITION BY apartment_id, scheduled_date
                               ORDER BY (status = 'in_progress') DESC, started_at, created_at, id) AS keeper
    FROM housekeeping_tasks
   WHERE type = 'checkout_clean' AND status NOT IN ('completed', 'verified')
)
UPDATE housekeeping_tasks h
   SET status = 'completed', completed_at = COALESCE(h.completed_at, NOW()),
       notes = concat_ws(E'\n', h.notes, format('Closed by migration 00036: duplicate of checkout clean %s', r.keeper))
  FROM ranked r
 WHERE h.id = r.id AND r.rn > 1;
CREATE UNIQUE INDEX IF NOT EXISTS uq_housekeeping_open_checkout_clean ON housekeeping_tasks (apartment_id, scheduled_date, type)
  WHERE type = 'checkout_clean' AND status NOT IN ('completed', 'verified');

-- POS: a reference posted twice keeps it on the first ticket; later copies
-- are relabelled <ref>-dup-<n> (both stay on the folio as they were).
WITH ranked AS (
  SELECT id, ticket_reference,
         row_number() OVER (PARTITION BY outlet_id, ticket_reference ORDER BY created_at, id) AS rn
    FROM pos_tickets
   WHERE ticket_reference IS NOT NULL AND status = 'posted'
)
UPDATE pos_tickets t SET ticket_reference = r.ticket_reference || '-dup-' || (r.rn - 1)
  FROM ranked r
 WHERE t.id = r.id AND r.rn > 1;
CREATE UNIQUE INDEX IF NOT EXISTS uq_pos_tickets_reference ON pos_tickets (outlet_id, ticket_reference)
  WHERE ticket_reference IS NOT NULL AND status = 'posted';

-- ------------------------------------------------------------
-- 7. Write policies the user-scoped routes need (missing since 00009)
-- ------------------------------------------------------------
-- Role level of a role name (staff_level_of takes a staff id).
CREATE OR REPLACE FUNCTION role_level(p_role TEXT)
RETURNS INT
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE p_role
    WHEN 'owner' THEN 100 WHEN 'admin' THEN 90 WHEN 'manager' THEN 70 WHEN 'receptionist' THEN 50
    WHEN 'housekeeping' THEN 30 WHEN 'maintenance' THEN 30 WHEN 'readonly' THEN 10 ELSE 0 END;
$$;

-- staff: admins manage accounts below their own level in properties they
-- reach (src/lib/api-auth.ts canManageRole), and edit their own profile but
-- not their own role, active flag, property or login.
DROP POLICY IF EXISTS staff_admin_insert ON staff;
CREATE POLICY staff_admin_insert ON staff FOR INSERT TO authenticated
  WITH CHECK (role_at_least(90) AND can_access_property(property_id)
              AND role_level(role) > 0 AND role_level(role) < staff_role_level()
              AND auth_user_id IS NULL);
DROP POLICY IF EXISTS staff_admin_update ON staff;
CREATE POLICY staff_admin_update ON staff FOR UPDATE TO authenticated
  USING (role_at_least(90) AND can_access_property(property_id)
         AND (auth_user_id = auth.uid() OR role_level(role) < staff_role_level()))
  WITH CHECK (role_at_least(90) AND can_access_property(property_id)
              AND (auth_user_id = auth.uid() OR (role_level(role) > 0 AND role_level(role) < staff_role_level())));

CREATE OR REPLACE FUNCTION staff_guard_self_and_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF is_trusted_caller() THEN RETURN NEW; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id THEN
    RAISE EXCEPTION 'ROLE_FORBIDDEN: a staff login is linked by the server' USING ERRCODE = '42501';
  END IF;
  IF OLD.auth_user_id = auth.uid()
     AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.is_active IS DISTINCT FROM OLD.is_active
          OR NEW.property_id IS DISTINCT FROM OLD.property_id) THEN
    RAISE EXCEPTION 'ROLE_FORBIDDEN: you cannot change your own role, status or property' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_staff_guard ON staff;
CREATE TRIGGER trg_staff_guard BEFORE UPDATE ON staff
  FOR EACH ROW EXECUTE FUNCTION staff_guard_self_and_identity();

-- properties: admins edit their own property's settings. New properties
-- are created by an owner through the server (POST /api/v1/properties),
-- which also adds the owner's membership.
DROP POLICY IF EXISTS properties_admin_update ON properties;
CREATE POLICY properties_admin_update ON properties FOR UPDATE TO authenticated
  USING (role_at_least(90) AND can_access_property(id))
  WITH CHECK (role_at_least(90) AND can_access_property(id));

-- currency_rates: one table for every property; owners record manual rates
-- (the FX refresh runs as the service role).
DROP POLICY IF EXISTS currency_rates_owner_insert ON currency_rates;
CREATE POLICY currency_rates_owner_insert ON currency_rates FOR INSERT TO authenticated
  WITH CHECK (role_at_least(100));

-- pricing_decisions: the automation records a decision before it changes a
-- rate (the unique index makes it the daily claim); admins run it by hand.
DROP POLICY IF EXISTS pricing_decisions_admin_insert ON pricing_decisions;
CREATE POLICY pricing_decisions_admin_insert ON pricing_decisions FOR INSERT TO authenticated
  WITH CHECK (role_at_least(90) AND can_access_property(property_id));
