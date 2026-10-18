-- ============================================================
-- Migration 00020: Booking integrity (audit Oct 2026)
--   1. Database-level double-booking prevention
--   2. Business date per property
--   3. Atomic check-in, check-out and payment functions
--
-- Functions are SECURITY INVOKER (the default) so row-level security
-- continues to apply to the calling staff member.
-- ============================================================

-- ------------------------------------------------------------
-- 1. No two active bookings may overlap on the same apartment
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- If this fails, existing data already contains an overlap. Find it with:
--   SELECT a.id, b.id FROM bookings a JOIN bookings b
--     ON a.apartment_id = b.apartment_id AND a.id < b.id
--    AND daterange(a.check_in, a.check_out, '[)') && daterange(b.check_in, b.check_out, '[)')
--  WHERE a.status NOT IN ('cancelled','no_show') AND b.status NOT IN ('cancelled','no_show');
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_no_overlap;
ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    apartment_id WITH =,
    daterange(check_in, check_out, '[)') WITH &&
  )
  WHERE (status NOT IN ('cancelled', 'no_show'));

-- ------------------------------------------------------------
-- 2. Business date in the property's timezone (default Africa/Cairo)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION property_business_date(p_property_id UUID)
RETURNS DATE AS $$
  SELECT (NOW() AT TIME ZONE COALESCE(
    (SELECT timezone FROM properties WHERE id = p_property_id), 'UTC'))::date;
$$ LANGUAGE sql STABLE;

-- ------------------------------------------------------------
-- 3a. Check-in: one transaction, guarded
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION checkin_booking(p_booking_id UUID, p_notes TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_b          bookings%ROWTYPE;
  v_apt_status TEXT;
  v_today      DATE;
BEGIN
  SELECT * INTO v_b FROM bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_b.status <> 'confirmed' THEN
    RAISE EXCEPTION 'INVALID_STATUS: booking is %, must be confirmed', v_b.status USING ERRCODE = 'P0001';
  END IF;
  IF v_b.guest_id IS NULL THEN
    RAISE EXCEPTION 'NO_GUEST: attach a guest profile before check-in' USING ERRCODE = 'P0001';
  END IF;

  v_today := property_business_date(v_b.property_id);
  IF v_b.check_in > v_today THEN
    RAISE EXCEPTION 'TOO_EARLY: arrival date is %, business date is %', v_b.check_in, v_today USING ERRCODE = 'P0001';
  END IF;

  SELECT status INTO v_apt_status FROM apartments WHERE id = v_b.apartment_id FOR UPDATE;
  IF v_apt_status IS DISTINCT FROM 'available' THEN
    RAISE EXCEPTION 'ROOM_NOT_READY: apartment status is %', COALESCE(v_apt_status, 'unknown') USING ERRCODE = 'P0001';
  END IF;

  UPDATE bookings
     SET status = 'checked_in',
         checked_in_at = NOW(),
         internal_notes = CASE WHEN p_notes IS NULL OR p_notes = '' THEN internal_notes
                               ELSE concat_ws(E'\n', internal_notes, p_notes) END
   WHERE id = p_booking_id
   RETURNING * INTO v_b;

  UPDATE apartments SET status = 'occupied' WHERE id = v_b.apartment_id;

  RETURN to_jsonb(v_b);
END;
$$;

-- ------------------------------------------------------------
-- 3b. Check-out: one transaction, balance-aware, single housekeeping task
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION checkout_booking(
  p_booking_id UUID,
  p_notes TEXT DEFAULT NULL,
  p_allow_outstanding_balance BOOLEAN DEFAULT FALSE,
  p_points_per_gbp NUMERIC DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_b           bookings%ROWTYPE;
  v_today       DATE;
  v_invoiced    NUMERIC := 0;
  v_paid        NUMERIC := 0;
  v_outstanding NUMERIC := 0;
  v_points      INT := 0;
  v_balance     INT := 0;
  v_tier        TEXT := NULL;
  v_task_id     UUID;
BEGIN
  SELECT * INTO v_b FROM bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_b.status <> 'checked_in' THEN
    RAISE EXCEPTION 'INVALID_STATUS: booking is %, must be checked_in', v_b.status USING ERRCODE = 'P0001';
  END IF;

  v_today := property_business_date(v_b.property_id);

  -- Outstanding balance across issued invoices for this stay
  SELECT COALESCE(SUM(i.total_gbp), 0) INTO v_invoiced
    FROM invoices i
   WHERE i.booking_id = p_booking_id AND i.status NOT IN ('draft', 'cancelled');
  SELECT COALESCE(SUM(p.amount_gbp), 0) INTO v_paid
    FROM payments p JOIN invoices i ON i.id = p.invoice_id
   WHERE i.booking_id = p_booking_id AND p.status = 'completed';
  v_outstanding := v_invoiced - v_paid;
  IF v_outstanding > 0.005 AND NOT p_allow_outstanding_balance THEN
    RAISE EXCEPTION 'OUTSTANDING_BALANCE: % GBP unpaid on this stay', ROUND(v_outstanding, 2) USING ERRCODE = 'P0001';
  END IF;

  UPDATE bookings
     SET status = 'checked_out',
         checked_out_at = NOW(),
         internal_notes = CASE WHEN p_notes IS NULL OR p_notes = '' THEN internal_notes
                               ELSE concat_ws(E'\n', internal_notes, p_notes) END
   WHERE id = p_booking_id
   RETURNING * INTO v_b;

  UPDATE apartments SET status = 'cleaning' WHERE id = v_b.apartment_id;

  INSERT INTO housekeeping_tasks (property_id, apartment_id, type, status, priority, scheduled_date)
  VALUES (v_b.property_id, v_b.apartment_id, 'checkout_clean', 'pending', 'high', v_today)
  RETURNING id INTO v_task_id;

  IF v_b.guest_id IS NOT NULL THEN
    v_points := FLOOR(v_b.total_amount_gbp * p_points_per_gbp)::INT;
    UPDATE guests
       SET total_stays = total_stays + 1,
           total_nights = total_nights + v_b.nights,
           total_spend_gbp = total_spend_gbp + v_b.total_amount_gbp,
           loyalty_points = loyalty_points + v_points,
           loyalty_tier = CASE
             WHEN loyalty_points + v_points >= 15000 THEN 'platinum'
             WHEN loyalty_points + v_points >= 5000  THEN 'gold'
             WHEN loyalty_points + v_points >= 1000  THEN 'silver'
             ELSE 'bronze' END
     WHERE id = v_b.guest_id
     RETURNING loyalty_points, loyalty_tier INTO v_balance, v_tier;

    INSERT INTO loyalty_programme (guest_id, transaction_type, points, balance_after, description, reference_type, reference_id)
    VALUES (v_b.guest_id, 'earn', v_points, v_balance,
            format('Checkout: %s nights, GBP %s', v_b.nights, v_b.total_amount_gbp), 'booking', v_b.id);
  END IF;

  RETURN jsonb_build_object(
    'booking', to_jsonb(v_b),
    'housekeeping_task_id', v_task_id,
    'points_earned', v_points,
    'loyalty_tier', v_tier,
    'outstanding_gbp', ROUND(v_outstanding, 2)
  );
END;
$$;

-- ------------------------------------------------------------
-- 3c. Record a payment: locked, no overpayment, status derived in-transaction
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_invoice_payment(
  p_invoice_id UUID,
  p_amount_gbp NUMERIC,
  p_method TEXT,
  p_amount_original NUMERIC DEFAULT NULL,
  p_currency TEXT DEFAULT 'GBP',
  p_fx_rate NUMERIC DEFAULT NULL,
  p_reference TEXT DEFAULT NULL,
  p_received_by UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_inv         invoices%ROWTYPE;
  v_paid        NUMERIC := 0;
  v_outstanding NUMERIC := 0;
  v_pay         payments%ROWTYPE;
  v_status      TEXT;
BEGIN
  IF p_amount_gbp IS NULL OR p_amount_gbp <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: amount must be positive' USING ERRCODE = 'P0001';
  END IF;
  IF p_currency <> 'GBP' AND p_amount_original IS NULL THEN
    RAISE EXCEPTION 'MISSING_ORIGINAL_AMOUNT: amount_original is required for non-GBP payments' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_inv.status NOT IN ('sent', 'partially_paid') THEN
    RAISE EXCEPTION 'INVALID_STATUS: invoice is %, must be sent or partially_paid', v_inv.status USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(SUM(amount_gbp), 0) INTO v_paid
    FROM payments WHERE invoice_id = p_invoice_id AND status = 'completed';
  v_outstanding := v_inv.total_gbp - v_paid;
  IF p_amount_gbp > v_outstanding + 0.005 THEN
    RAISE EXCEPTION 'OVERPAYMENT: outstanding is % GBP, payment is % GBP', ROUND(v_outstanding, 2), p_amount_gbp USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO payments (invoice_id, amount_gbp, amount_original, currency, fx_rate, method, status,
                        reference, received_by, received_at, notes)
  VALUES (p_invoice_id, p_amount_gbp, COALESCE(p_amount_original, p_amount_gbp), p_currency, p_fx_rate,
          p_method, 'completed', p_reference, p_received_by, NOW(), p_notes)
  RETURNING * INTO v_pay;

  v_paid := v_paid + p_amount_gbp;
  v_status := CASE WHEN v_paid >= v_inv.total_gbp - 0.005 THEN 'paid' ELSE 'partially_paid' END;

  UPDATE invoices
     SET status = v_status,
         paid_at = CASE WHEN v_status = 'paid' THEN NOW() ELSE paid_at END
   WHERE id = p_invoice_id;

  RETURN jsonb_build_object(
    'payment', to_jsonb(v_pay),
    'invoice_status', v_status,
    'outstanding_gbp', ROUND(v_inv.total_gbp - v_paid, 2)
  );
END;
$$;

-- Index supporting the overlap and availability queries on active bookings
CREATE INDEX IF NOT EXISTS idx_bookings_active_apartment_dates
  ON bookings (apartment_id, check_in, check_out)
  WHERE status NOT IN ('cancelled', 'no_show');
CREATE INDEX IF NOT EXISTS idx_payments_invoice_status ON payments (invoice_id, status);
