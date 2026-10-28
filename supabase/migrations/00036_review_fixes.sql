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
-- and from the second review (round 5):
--   * bookings, invoices, guests and groups were writable by front-desk
--     staff through PostgREST, so a receptionist could check a guest out
--     unpaid with UPDATE bookings SET status = 'checked_out', rewrite a
--     stay's total mid-stay, mark an invoice paid, or award loyalty points;
--     direct writes are now limited to what the app does (section 8)
--   * the properties write policy let admins zero VAT and the tourism levy
--     and rewind the business date; only the settings columns are granted
--   * the duplicate-clean merge deleted tasks with notes, photos or an
--     assignee; only untouched copies are deleted now
--   * revenue_by_stay_date counted nights after an early departure
--   * a staff member moved to another property kept the old home
--     membership
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

-- Revenue by stay date uses the same per-night amount as the folio, and the
-- same early-departure rule as post_room_charges: nights after the guest
-- left are not revenue.
CREATE OR REPLACE FUNCTION revenue_by_stay_date(p_property_id UUID, p_from DATE, p_to DATE)
RETURNS TABLE (stay_date DATE, room_nights INT, room_revenue_gbp NUMERIC, rooms_available INT)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  WITH days AS (SELECT generate_series(p_from, p_to, '1 day')::date AS d),
  rooms AS (SELECT COUNT(*)::int AS n FROM apartments WHERE property_id = p_property_id AND status <> 'out_of_service'),
  prop AS (SELECT COALESCE(timezone, 'UTC') AS tz FROM properties WHERE id = p_property_id)
  SELECT d.d,
         COUNT(b.id)::int,
         ROUND(COALESCE(SUM(booking_night_net(b, d.d)), 0), 2),
         (SELECT n FROM rooms)
    FROM days d
    LEFT JOIN bookings b ON b.property_id = p_property_id AND b.status IN ('confirmed','checked_in','checked_out')
         AND b.check_in <= d.d AND b.check_out > d.d
         -- Early departure: nights from the departure date on were never
         -- charged, but checkout always charges at least the first night
         -- (same-day stays), so that night still counts.
         AND NOT (b.status = 'checked_out'
                  AND (b.checked_out_at IS NULL
                       OR d.d >= GREATEST((b.checked_out_at AT TIME ZONE COALESCE((SELECT tz FROM prop), 'UTC'))::date,
                                          b.check_in + 1)))
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
-- Open checkout cleans: keep the copy with the most work in it per unit and
-- day (in progress, started, issue found, notes / photos / checklist,
-- assigned, then oldest). Only pristine copies are deleted: pending,
-- unassigned, never started, with no notes, photos or checklist. Any other
-- copy is closed as a duplicate (there is no cancelled status) and keeps
-- its notes and photos, with its former status recorded in the note.
CREATE OR REPLACE FUNCTION pg_temp.hk_has_work(h housekeeping_tasks) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT h.notes IS NOT NULL
      OR COALESCE(array_length(h.photo_before, 1), 0) > 0
      OR COALESCE(array_length(h.photo_after, 1), 0) > 0
      OR COALESCE(h.checklist, '[]'::jsonb) <> '[]'::jsonb;
$$;
CREATE OR REPLACE FUNCTION pg_temp.hk_pristine(h housekeeping_tasks) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT h.status = 'pending' AND h.assigned_to IS NULL AND h.started_at IS NULL AND NOT pg_temp.hk_has_work(h);
$$;
CREATE TEMP VIEW hk_dupes AS
  SELECT h.id, h.status, pg_temp.hk_pristine(h) AS pristine,
         row_number() OVER w AS rn,
         first_value(h.id) OVER w AS keeper
    FROM housekeeping_tasks h
   WHERE h.type = 'checkout_clean' AND h.status NOT IN ('completed', 'verified')
  WINDOW w AS (PARTITION BY h.apartment_id, h.scheduled_date
               ORDER BY (h.status = 'in_progress') DESC, (h.started_at IS NOT NULL) DESC,
                        (h.status = 'issue_found') DESC, pg_temp.hk_has_work(h) DESC,
                        (h.assigned_to IS NOT NULL) DESC, h.created_at, h.id);
DELETE FROM housekeeping_tasks h USING hk_dupes r
 WHERE h.id = r.id AND r.rn > 1 AND r.pristine;
UPDATE housekeeping_tasks h
   SET status = 'completed', completed_at = COALESCE(h.completed_at, NOW()),
       notes = concat_ws(E'\n', h.notes,
                         format('Closed by migration 00036 (was %s): duplicate of checkout clean %s', r.status, r.keeper))
  FROM hk_dupes r
 WHERE h.id = r.id AND r.rn > 1;
DROP VIEW hk_dupes;
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
-- ...and only the settings PUT /api/v1/properties edits. VAT, the tourism
-- levy and the business date drive what every stay is charged: they are
-- set by the server (night audit, service role), never through the API.
REVOKE UPDATE ON properties FROM anon, authenticated;
GRANT UPDATE (name, slug, address, city, country, timezone, default_currency, reporting_currency,
              star_rating, total_apartments, status, phone, email, website, updated_at)
  ON properties TO authenticated;

-- A staff member who moves to another home property loses the automatic
-- membership of the old one (rows with granted_by set were granted
-- explicitly and stay). SECURITY DEFINER: it only mirrors a staff change
-- that already passed the staff policies.
CREATE OR REPLACE FUNCTION staff_home_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.property_id IS NOT NULL AND OLD.property_id IS DISTINCT FROM NEW.property_id THEN
    DELETE FROM staff_properties
     WHERE staff_id = NEW.id AND property_id = OLD.property_id AND granted_by IS NULL;
  END IF;
  IF NEW.property_id IS NOT NULL THEN
    INSERT INTO staff_properties (staff_id, property_id)
    VALUES (NEW.id, NEW.property_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

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

-- ------------------------------------------------------------
-- 8. Direct writes cannot skip the state machines and money rules
-- ------------------------------------------------------------
-- RLS lets front-desk staff write bookings, invoices, guests and groups
-- (the user-scoped routes need that), so with only the table policies a
-- receptionist calling Supabase REST directly could check a guest out,
-- rewrite a stay's price, mark an invoice paid or award loyalty points.
-- These guards allow exactly what the app does with the user client;
-- everything else goes through the SECURITY DEFINER functions, inside
-- which current_user is the function owner and the guards stand aside.
-- (is_trusted_caller() is not used here: it is false inside those
-- functions too, because the 'role' setting stays 'authenticated'.)
CREATE OR REPLACE FUNCTION is_direct_client_write()
RETURNS BOOLEAN
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT current_user IN ('authenticated', 'anon');
$$;

-- bookings: created pending at the quoted price (POST /bookings, or
-- add_group_rooms for a group); afterwards only confirmation,
-- cancellation and the PATCH fields (party size, requests, notes,
-- currency). Check-in, check-out, no-shows, prices, dates and rooms change
-- only through the booking functions.
CREATE OR REPLACE FUNCTION bookings_guard_direct_writes()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_apt apartments%ROWTYPE;
  v_code TEXT;
  v_quote JSONB;
  v_group_status TEXT;
  v_group_property UUID;
  v_changed TEXT[];
BEGIN
  IF NOT is_direct_client_write() THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'BOOKING_IMMUTABLE: a booking is cancelled, never deleted' USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT * INTO v_apt FROM apartments WHERE id = NEW.apartment_id;
    IF NOT FOUND OR v_apt.property_id IS DISTINCT FROM NEW.property_id THEN
      RAISE EXCEPTION 'PROPERTY_FORBIDDEN: the apartment does not belong to this property' USING ERRCODE = '42501';
    END IF;
    IF NEW.guest_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM guests WHERE id = NEW.guest_id AND property_id = NEW.property_id) THEN
      RAISE EXCEPTION 'PROPERTY_FORBIDDEN: the guest does not belong to this property' USING ERRCODE = '42501';
    END IF;
    IF NEW.group_id IS NOT NULL THEN
      SELECT status, property_id INTO v_group_status, v_group_property FROM booking_groups WHERE id = NEW.group_id;
      IF v_group_property IS DISTINCT FROM NEW.property_id THEN
        RAISE EXCEPTION 'GROUP_NOT_FOUND: group % not found', NEW.group_id USING ERRCODE = 'P0002';
      END IF;
    END IF;
    IF NOT (NEW.status = 'pending' OR (NEW.status = 'confirmed' AND COALESCE(v_group_status, '') = 'confirmed')) THEN
      RAISE EXCEPTION 'INVALID_STATUS: a new booking starts pending' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.checked_in_at IS NOT NULL OR NEW.checked_out_at IS NOT NULL OR NEW.cancelled_at IS NOT NULL
       OR NEW.precheckin IS NOT NULL OR NEW.precheckin_completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'INVALID_STATUS: a new booking has not been checked in, out or cancelled' USING ERRCODE = 'P0001';
    END IF;
    SELECT code INTO v_code FROM booking_channels WHERE id = NEW.channel_id;
    v_quote := quote_stay(v_apt.apartment_type_id, NEW.check_in, NEW.check_out, NEW.rate_plan_id, v_code);
    IF NEW.total_amount_gbp IS DISTINCT FROM (v_quote->>'total_gbp')::numeric
       OR NEW.rate_per_night_gbp IS DISTINCT FROM (v_quote->>'rate_per_night_gbp')::numeric THEN
      RAISE EXCEPTION 'PRICE_MISMATCH: the stay is quoted at % (% per night)',
        v_quote->>'total_gbp', v_quote->>'rate_per_night_gbp' USING ERRCODE = 'P0001';
    END IF;
    NEW.discount_percentage := COALESCE((v_quote->>'discount_percentage')::numeric, 0);
    NEW.rate_plan_id := NULLIF(v_quote->'rate_plan'->>'id', '')::uuid;
    NEW.rate_plan_snapshot := v_quote->'rate_plan';
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT ((OLD.status = 'pending' AND NEW.status IN ('confirmed', 'cancelled'))
              OR (OLD.status = 'confirmed' AND NEW.status = 'cancelled')) THEN
    RAISE EXCEPTION 'INVALID_STATUS: a booking cannot go from % to % here', OLD.status, NEW.status USING ERRCODE = 'P0001';
  END IF;
  -- (nights is generated, and not yet computed in a BEFORE trigger)
  SELECT array_agg(n.key ORDER BY n.key) INTO v_changed
    FROM jsonb_each(to_jsonb(NEW)) n
   WHERE n.value IS DISTINCT FROM (to_jsonb(OLD) -> n.key)
     AND n.key NOT IN ('nights', 'updated_at', 'status', 'cancelled_at', 'cancellation_reason', 'adults', 'children',
                       'special_requests', 'internal_notes', 'guest_currency', 'total_amount_guest_currency');
  IF v_changed IS NOT NULL THEN
    RAISE EXCEPTION 'BOOKING_IMMUTABLE: % cannot be changed directly; use check-in, check-out or a new booking',
      array_to_string(v_changed, ', ') USING ERRCODE = 'P0001';
  END IF;
  IF (NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at OR NEW.cancellation_reason IS DISTINCT FROM OLD.cancellation_reason)
     AND NOT (NEW.status = 'cancelled' AND OLD.status <> 'cancelled') THEN
    RAISE EXCEPTION 'INVALID_STATUS: the cancellation is recorded when the booking is cancelled' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.status IN ('checked_out', 'cancelled', 'no_show')
     AND (NEW.adults IS DISTINCT FROM OLD.adults OR NEW.children IS DISTINCT FROM OLD.children) THEN
    RAISE EXCEPTION 'BOOKING_IMMUTABLE: the party of a % booking is final', OLD.status USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_bookings_direct_guard ON bookings;
CREATE TRIGGER trg_bookings_direct_guard BEFORE INSERT OR UPDATE OR DELETE ON bookings
  FOR EACH ROW EXECUTE FUNCTION bookings_guard_direct_writes();

-- invoices: a direct invoice is created as a draft whose totals are what
-- its lines add up to (each line rounded, VAT on the rounded subtotal, as
-- src/lib/finance-engine.ts calculateInvoiceTotals); afterwards only
-- draft -> sent and draft -> cancelled. Paid / partially paid / overdue /
-- refunded come from the payment functions. The VAT rate is stored so a
-- draft whose lines are edited is re-totalled at the same rate.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_rate_percent NUMERIC(5,2)
  CHECK (tax_rate_percent IS NULL OR (tax_rate_percent >= 0 AND tax_rate_percent <= 100));
UPDATE invoices i
   SET tax_rate_percent = CASE
         WHEN i.subtotal_gbp > 0 THEN LEAST(100, GREATEST(0, ROUND(i.tax_amount_gbp * 100 / i.subtotal_gbp, 2)))
         ELSE COALESCE((SELECT p.vat_rate_percent FROM properties p WHERE p.id = i.property_id), 0) END
 WHERE i.tax_rate_percent IS NULL;

CREATE OR REPLACE FUNCTION invoices_guard_direct_writes()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_items JSONB;
  v_subtotal NUMERIC;
  v_bad INT;
BEGIN
  IF NOT is_direct_client_write() THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;  -- only drafts; trg_invoices_frozen_delete

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' OR NEW.sent_at IS NOT NULL OR NEW.paid_at IS NOT NULL THEN
      RAISE EXCEPTION 'INVALID_STATUS: an invoice starts as a draft' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.booking_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM bookings WHERE id = NEW.booking_id AND property_id = NEW.property_id) THEN
      RAISE EXCEPTION 'PROPERTY_FORBIDDEN: the booking does not belong to this property' USING ERRCODE = '42501';
    END IF;
    NEW.discount_amount_gbp := 0;
    NEW.tax_rate_percent := COALESCE(NEW.tax_rate_percent,
                                     (SELECT vat_rate_percent FROM properties WHERE id = NEW.property_id), 0);
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (OLD.status = 'draft' AND NEW.status IN ('sent', 'cancelled')) THEN
      IF OLD.status <> 'draft' THEN
        RAISE EXCEPTION 'INVOICE_IMMUTABLE: an issued invoice cannot go from % to % here; payments set its status',
          OLD.status, NEW.status USING ERRCODE = 'P0001';
      END IF;
      RAISE EXCEPTION 'INVALID_STATUS: a draft invoice is sent or cancelled; payments set the rest' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.paid_at IS DISTINCT FROM OLD.paid_at
       OR (NEW.sent_at IS DISTINCT FROM OLD.sent_at AND NOT (OLD.status = 'draft' AND NEW.status = 'sent'))
       OR NEW.property_id IS DISTINCT FROM OLD.property_id OR NEW.booking_id IS DISTINCT FROM OLD.booking_id
       OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
       OR NEW.discount_amount_gbp IS DISTINCT FROM OLD.discount_amount_gbp
       OR (OLD.status <> 'draft' AND NEW.tax_rate_percent IS DISTINCT FROM OLD.tax_rate_percent) THEN
      RAISE EXCEPTION 'INVOICE_IMMUTABLE: that field is set by the server' USING ERRCODE = 'P0001';
    END IF;
    IF OLD.status <> 'draft' THEN RETURN NEW; END IF;  -- money fields frozen by trg_invoices_frozen
  END IF;

  IF NEW.guest_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM guests WHERE id = NEW.guest_id AND property_id = NEW.property_id) THEN
    RAISE EXCEPTION 'PROPERTY_FORBIDDEN: the guest does not belong to this property' USING ERRCODE = '42501';
  END IF;

  -- Re-total the draft from its lines
  IF jsonb_typeof(COALESCE(NEW.line_items, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: line_items must be a list' USING ERRCODE = 'P0001';
  END IF;
  SELECT COUNT(*) FILTER (WHERE jsonb_typeof(e->'quantity') <> 'number' OR jsonb_typeof(e->'unit_price_gbp') <> 'number'
                            OR (e->>'quantity')::numeric <= 0 OR (e->>'unit_price_gbp')::numeric < 0)
    INTO v_bad
    FROM jsonb_array_elements(COALESCE(NEW.line_items, '[]'::jsonb)) e;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: every line needs a positive quantity and a unit price of at least 0' USING ERRCODE = 'P0001';
  END IF;
  SELECT COALESCE(jsonb_agg(e || jsonb_build_object('total_gbp',
                    ROUND((e->>'quantity')::numeric * (e->>'unit_price_gbp')::numeric, 2)) ORDER BY o), '[]'::jsonb),
         COALESCE(SUM(ROUND((e->>'quantity')::numeric * (e->>'unit_price_gbp')::numeric, 2)), 0)
    INTO v_items, v_subtotal
    FROM jsonb_array_elements(COALESCE(NEW.line_items, '[]'::jsonb)) WITH ORDINALITY AS t(e, o);
  NEW.line_items := v_items;
  NEW.subtotal_gbp := v_subtotal;
  NEW.tax_amount_gbp := ROUND(v_subtotal * COALESCE(NEW.tax_rate_percent, 0) / 100, 2);
  NEW.total_gbp := NEW.subtotal_gbp + NEW.tax_amount_gbp - COALESCE(NEW.discount_amount_gbp, 0);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_invoices_direct_guard ON invoices;
CREATE TRIGGER trg_invoices_direct_guard BEFORE INSERT OR UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION invoices_guard_direct_writes();

-- guests: loyalty and stay statistics are earned at check-out, a guest's
-- login is linked by the server, and a guest stays with their property.
CREATE OR REPLACE FUNCTION guests_guard_direct_writes()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT is_direct_client_write() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.loyalty_tier := 'bronze';
    NEW.loyalty_points := 0;
    NEW.total_stays := 0;
    NEW.total_nights := 0;
    NEW.total_spend_gbp := 0;
    NEW.auth_user_id := NULL;
    RETURN NEW;
  END IF;
  IF NEW.loyalty_tier IS DISTINCT FROM OLD.loyalty_tier OR NEW.loyalty_points IS DISTINCT FROM OLD.loyalty_points
     OR NEW.total_stays IS DISTINCT FROM OLD.total_stays OR NEW.total_nights IS DISTINCT FROM OLD.total_nights
     OR NEW.total_spend_gbp IS DISTINCT FROM OLD.total_spend_gbp
     OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id OR NEW.property_id IS DISTINCT FROM OLD.property_id THEN
    RAISE EXCEPTION 'ROLE_FORBIDDEN: loyalty, stay totals, login and property are maintained by the server' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guests_direct_guard ON guests;
CREATE TRIGGER trg_guests_direct_guard BEFORE INSERT OR UPDATE ON guests
  FOR EACH ROW EXECUTE FUNCTION guests_guard_direct_writes();

-- booking_groups: dates are fixed while rooms are blocked (as PATCH
-- /groups/[id] enforces), a group is cancelled through cancel_group()
-- (which cancels its rooms first), and a group with bookings stays.
CREATE OR REPLACE FUNCTION booking_groups_guard_direct_writes()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT is_direct_client_write() THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM bookings WHERE group_id = OLD.id) THEN
      RAISE EXCEPTION 'ROOMS_BLOCKED: a group with bookings is cancelled, not deleted' USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('tentative', 'confirmed') THEN
      RAISE EXCEPTION 'INVALID_STATUS: a new group is tentative or confirmed' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.property_id IS DISTINCT FROM OLD.property_id THEN
    RAISE EXCEPTION 'PROPERTY_FORBIDDEN: a group stays with its property' USING ERRCODE = '42501';
  END IF;
  IF (NEW.check_in IS DISTINCT FROM OLD.check_in OR NEW.check_out IS DISTINCT FROM OLD.check_out)
     AND EXISTS (SELECT 1 FROM bookings WHERE group_id = OLD.id AND status NOT IN ('cancelled', 'no_show')) THEN
    RAISE EXCEPTION 'ROOMS_BLOCKED: dates cannot change while rooms are blocked' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.status = 'cancelled' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'INVALID_STATUS: a cancelled group stays cancelled' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled'
     AND EXISTS (SELECT 1 FROM bookings WHERE group_id = OLD.id AND status IN ('pending', 'confirmed')) THEN
    RAISE EXCEPTION 'INVALID_STATUS: cancel a group with cancel_group(), which cancels its rooms' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_booking_groups_direct_guard ON booking_groups;
CREATE TRIGGER trg_booking_groups_direct_guard BEFORE INSERT OR UPDATE OR DELETE ON booking_groups
  FOR EACH ROW EXECUTE FUNCTION booking_groups_guard_direct_writes();
