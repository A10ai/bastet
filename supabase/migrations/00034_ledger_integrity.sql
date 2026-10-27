-- ============================================================
-- Migration 00034: Ledger integrity (deep test, Oct 2026)
--
-- After 00033 application roles cannot write folios, folio_lines, payments,
-- refunds, daily_closes or pos_tickets directly. Every money movement goes
-- through the SECURITY DEFINER functions below, which check the caller's
-- property and role themselves (require_staff, 00033):
--
--   open_folio                30 (housekeeping opens a folio for minibar)
--   post_pos_ticket           30 (free-text items: 70)
--   post_folio_charge         50
--   record_folio_payment      50
--   record_invoice_payment    50
--   issue_folio_invoice       50
--   checkin_booking           50
--   checkout_booking          50
--   post_booking_room_charges 50
--   refund_payment            70
--   void_folio_line           70 (the API already required a manager)
--   void_pos_ticket           70
--   run_night_audit           90, or the service role / cron
--
-- Fixes, all reproduced on 00001-00032:
--   * staff could insert 'payment' lines and check a guest out unpaid
--   * an issued invoice could be flipped back to draft and edited, or deleted
--   * paying a folio-issued invoice did not reach the folio, so checkout
--     demanded the money a second time
--   * a night audit for a future date marked real arrivals as no-shows;
--     an older date moved last_business_date backwards; two concurrent
--     audits raced on the existence check
--   * voiding a room night left its VAT and levy on the bill
--   * charges posted after the folio invoice was issued were never invoiced
--   * group deposits stopped after one deposit per room
--   * stays that had already ended could be checked in
--   * refunds of invoice payments failed for every role; a full refund left
--     the invoice 'paid'
--   * sub-penny amounts were rounded into completed payments
--   * POS: no idempotency, fractional quantities, negative VAT, any role
--     inventing free-text prices
--   * checking out one booking posted room charges for every in-house stay
--   * quote_stay rounded each night of a weekly rate (7 x 142.86 = 1000.02)
--
-- Idempotent; see the note at the top of 00033 about re-running older files.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Invoices: issued means frozen, and never deleted
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION invoices_frozen_once_issued()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'INVOICE_IMMUTABLE: an issued invoice cannot be deleted; cancel it instead' USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'draft' AND NEW.status = 'draft' THEN
    RAISE EXCEPTION 'INVOICE_IMMUTABLE: an issued invoice cannot return to draft' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'INVOICE_IMMUTABLE: a cancelled invoice stays cancelled' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.status <> 'draft' AND (
       NEW.line_items IS DISTINCT FROM OLD.line_items OR
       NEW.subtotal_gbp IS DISTINCT FROM OLD.subtotal_gbp OR
       NEW.tax_amount_gbp IS DISTINCT FROM OLD.tax_amount_gbp OR
       NEW.discount_amount_gbp IS DISTINCT FROM OLD.discount_amount_gbp OR
       NEW.total_gbp IS DISTINCT FROM OLD.total_gbp OR
       NEW.invoice_number IS DISTINCT FROM OLD.invoice_number OR
       NEW.property_id IS DISTINCT FROM OLD.property_id OR
       NEW.guest_id IS DISTINCT FROM OLD.guest_id OR
       NEW.booking_id IS DISTINCT FROM OLD.booking_id) THEN
    RAISE EXCEPTION 'INVOICE_IMMUTABLE: an issued invoice cannot be altered; cancel it and issue a new one' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_invoices_frozen ON invoices;
CREATE TRIGGER trg_invoices_frozen BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION invoices_frozen_once_issued();
DROP TRIGGER IF EXISTS trg_invoices_frozen_delete ON invoices;
CREATE TRIGGER trg_invoices_frozen_delete BEFORE DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION invoices_frozen_once_issued();

-- ------------------------------------------------------------
-- 2. Ledger arithmetic helpers
-- ------------------------------------------------------------
-- Payments received on a folio, net of refunds.
CREATE OR REPLACE FUNCTION folio_net_paid(p_folio_id UUID)
RETURNS NUMERIC
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(SUM(credit_gbp) FILTER (WHERE type = 'payment'), 0)
       - COALESCE(SUM(debit_gbp) FILTER (WHERE type = 'refund'), 0)
    FROM folio_lines WHERE folio_id = p_folio_id;
$$;

-- What the whole stay is expected to cost: the booked room total with the
-- property's VAT and levy per night.
CREATE OR REPLACE FUNCTION booking_contract_gross(p_booking_id UUID)
RETURNS NUMERIC
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT ROUND(b.total_amount_gbp * (1 + COALESCE(p.vat_rate_percent, 0) / 100.0), 2)
       + COALESCE(p.tourism_levy_per_night_gbp, 0) * GREATEST(b.check_out - b.check_in, 0)
    FROM bookings b JOIN properties p ON p.id = b.property_id
   WHERE b.id = p_booking_id;
$$;

-- The most a folio may still take: what is owed, or for a stay that is not
-- over yet the rest of the expected stay (deposits, prepayment).
CREATE OR REPLACE FUNCTION folio_payable_limit(p_folio_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
DECLARE v_f folios%ROWTYPE; v_status TEXT; v_charges NUMERIC; v_paid NUMERIC;
BEGIN
  SELECT * INTO v_f FROM folios WHERE id = p_folio_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  SELECT status INTO v_status FROM bookings WHERE id = v_f.booking_id;
  SELECT COALESCE(SUM(debit_gbp) FILTER (WHERE type IN ('room','tax','levy','extra','fnb','adjustment')), 0)
       - COALESCE(SUM(credit_gbp) FILTER (WHERE type = 'reversal'), 0)
    INTO v_charges FROM folio_lines WHERE folio_id = p_folio_id;
  v_paid := folio_net_paid(p_folio_id);
  IF v_status IN ('pending', 'confirmed', 'checked_in') THEN
    RETURN GREATEST(v_charges, COALESCE(booking_contract_gross(v_f.booking_id), 0)) - v_paid;
  END IF;
  RETURN v_charges - v_paid;
END $$;

-- Derive an invoice's payment status from the money actually received:
-- folio payments for a folio invoice, otherwise payments on the invoice.
CREATE OR REPLACE FUNCTION sync_invoice_status(p_invoice_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE v_inv invoices%ROWTYPE; v_folio UUID; v_net NUMERIC; v_refunded BOOLEAN; v_status TEXT;
BEGIN
  IF p_invoice_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND OR v_inv.status IN ('draft', 'cancelled') THEN RETURN v_inv.status; END IF;
  SELECT id INTO v_folio FROM folios WHERE invoice_id = p_invoice_id;
  IF v_folio IS NOT NULL THEN
    v_net := folio_net_paid(v_folio);
    v_refunded := EXISTS (SELECT 1 FROM folio_lines WHERE folio_id = v_folio AND type = 'refund');
  ELSE
    SELECT COALESCE(SUM(p.amount_gbp), 0) - COALESCE((SELECT SUM(r.amount_gbp) FROM refunds r JOIN payments p2 ON p2.id = r.payment_id WHERE p2.invoice_id = p_invoice_id), 0)
      INTO v_net FROM payments p
     WHERE p.invoice_id = p_invoice_id AND p.status IN ('completed', 'partially_refunded', 'refunded');
    v_refunded := EXISTS (SELECT 1 FROM refunds r JOIN payments p ON p.id = r.payment_id WHERE p.invoice_id = p_invoice_id);
  END IF;
  v_status := CASE
    WHEN v_net >= v_inv.total_gbp - 0.005 THEN 'paid'
    WHEN v_net > 0.005 THEN 'partially_paid'
    WHEN v_refunded THEN 'refunded'
    WHEN v_inv.status = 'overdue' THEN 'overdue'
    ELSE 'sent' END;
  IF v_status IS DISTINCT FROM v_inv.status THEN
    UPDATE invoices SET status = v_status,
           paid_at = CASE WHEN v_status = 'paid' THEN COALESCE(paid_at, NOW()) WHEN v_status IN ('sent', 'refunded') THEN NULL ELSE paid_at END
     WHERE id = p_invoice_id;
  END IF;
  RETURN v_status;
END $$;

-- Rejects NULL, zero, negative and sub-penny amounts.
CREATE OR REPLACE FUNCTION assert_money(p_amount NUMERIC)
RETURNS VOID
LANGUAGE plpgsql IMMUTABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> ROUND(p_amount, 2) OR p_amount = 'NaN'::numeric THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: amount must be a positive sum in whole pence' USING ERRCODE = 'P0001';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 3. Folio and charges
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION open_folio(p_booking_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_id UUID; v_b bookings%ROWTYPE;
BEGIN
  SELECT * INTO v_b FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  PERFORM require_staff(v_b.property_id, 30, 'BOOKING_NOT_FOUND');
  SELECT id INTO v_id FROM folios WHERE booking_id = p_booking_id;
  IF FOUND THEN RETURN v_id; END IF;
  INSERT INTO folios (property_id, booking_id, guest_id) VALUES (v_b.property_id, v_b.id, v_b.guest_id)
  ON CONFLICT (booking_id) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN SELECT id INTO v_id FROM folios WHERE booking_id = p_booking_id; END IF;
  RETURN v_id;
END $$;

-- The charge itself; callable only from the checked functions.
CREATE OR REPLACE FUNCTION post_folio_charge_unchecked(
  p_folio_id UUID, p_type TEXT, p_description TEXT, p_quantity NUMERIC, p_unit_amount_gbp NUMERIC,
  p_tax_rate_percent NUMERIC, p_actor TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE v_f folios%ROWTYPE; v_rate NUMERIC; v_net NUMERIC; v_tax NUMERIC; v_date DATE; v_line folio_lines%ROWTYPE; v_tax_line UUID;
BEGIN
  IF p_type NOT IN ('extra', 'fnb', 'adjustment') THEN RAISE EXCEPTION 'INVALID_CHARGE_TYPE: %', p_type USING ERRCODE = 'P0001'; END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 OR p_quantity <> ROUND(p_quantity, 2)
     OR p_unit_amount_gbp IS NULL OR p_unit_amount_gbp < 0 OR p_unit_amount_gbp <> ROUND(p_unit_amount_gbp, 2) THEN
    RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = 'P0001';
  END IF;
  IF p_tax_rate_percent IS NOT NULL AND (p_tax_rate_percent < 0 OR p_tax_rate_percent > 100) THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: tax rate must be between 0 and 100' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_f FROM folios WHERE id = p_folio_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FOLIO_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_f.status <> 'open' THEN RAISE EXCEPTION 'FOLIO_CLOSED: folio is %', v_f.status USING ERRCODE = 'P0001'; END IF;
  v_date := property_business_date(v_f.property_id);
  v_rate := COALESCE(p_tax_rate_percent, (SELECT vat_rate_percent FROM properties WHERE id = v_f.property_id), 0);
  v_net := ROUND(p_quantity * p_unit_amount_gbp, 2);
  v_tax := ROUND(v_net * v_rate / 100, 2);
  INSERT INTO folio_lines (folio_id, business_date, posted_by, type, description, quantity, unit_amount_gbp, debit_gbp, tax_rate_percent)
  VALUES (p_folio_id, v_date, p_actor, p_type, p_description, p_quantity, p_unit_amount_gbp, v_net, v_rate) RETURNING * INTO v_line;
  IF v_tax > 0 THEN
    INSERT INTO folio_lines (folio_id, business_date, posted_by, type, description, quantity, unit_amount_gbp, debit_gbp, tax_rate_percent, reference_type, reference_id)
    VALUES (p_folio_id, v_date, p_actor, 'tax', format('VAT %s%% on %s', v_rate, p_description), 1, v_tax, v_tax, v_rate, 'charge', v_line.id) RETURNING id INTO v_tax_line;
  END IF;
  RETURN jsonb_build_object('line', to_jsonb(v_line), 'tax_line_id', v_tax_line, 'balance_gbp', folio_balance(p_folio_id));
END $$;
REVOKE EXECUTE ON FUNCTION post_folio_charge_unchecked(UUID, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION post_folio_charge(
  p_folio_id UUID, p_type TEXT, p_description TEXT, p_quantity NUMERIC, p_unit_amount_gbp NUMERIC,
  p_tax_rate_percent NUMERIC DEFAULT NULL, p_actor TEXT DEFAULT 'staff'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM require_staff((SELECT property_id FROM folios WHERE id = p_folio_id), 50, 'FOLIO_NOT_FOUND');
  RETURN post_folio_charge_unchecked(p_folio_id, p_type, p_description, p_quantity, p_unit_amount_gbp, p_tax_rate_percent, p_actor);
END $$;

-- Room, VAT and levy for one night; every in-house stay, or one booking.
-- Idempotent. Internal: called by the night audit and check-out.
DROP FUNCTION IF EXISTS post_room_charges(UUID, DATE, TEXT);
CREATE OR REPLACE FUNCTION post_room_charges(p_property_id UUID, p_business_date DATE, p_actor TEXT DEFAULT 'night_audit', p_booking_id UUID DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE v_b RECORD; v_folio UUID; v_vat NUMERIC; v_levy NUMERIC; v_net NUMERIC; v_count INT := 0;
BEGIN
  SELECT vat_rate_percent, tourism_levy_per_night_gbp INTO v_vat, v_levy FROM properties WHERE id = p_property_id;
  FOR v_b IN
    SELECT * FROM bookings
     WHERE property_id = p_property_id AND status IN ('checked_in', 'checked_out')
       AND check_in <= p_business_date AND check_out > p_business_date
       AND (p_booking_id IS NULL OR id = p_booking_id)
  LOOP
    v_folio := open_folio(v_b.id);
    IF EXISTS (SELECT 1 FROM folio_lines WHERE folio_id = v_folio AND type = 'room' AND business_date = p_business_date) THEN CONTINUE; END IF;
    v_net := ROUND(v_b.rate_per_night_gbp * (1 - v_b.discount_percentage / 100.0), 2);
    INSERT INTO folio_lines (folio_id, business_date, posted_by, type, description, quantity, unit_amount_gbp, debit_gbp, tax_rate_percent, reference_type, reference_id)
    VALUES (v_folio, p_business_date, p_actor, 'room', format('Accommodation %s', p_business_date), 1, v_net, v_net, v_vat, 'booking', v_b.id);
    IF v_vat > 0 THEN
      INSERT INTO folio_lines (folio_id, business_date, posted_by, type, description, quantity, unit_amount_gbp, debit_gbp, tax_rate_percent, reference_type, reference_id)
      VALUES (v_folio, p_business_date, p_actor, 'tax', format('VAT %s%% on accommodation', v_vat), 1, ROUND(v_net * v_vat / 100, 2), ROUND(v_net * v_vat / 100, 2), v_vat, 'room_night', v_b.id);
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

-- ------------------------------------------------------------
-- 4. Payments, refunds, voids, invoices
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_folio_payment(
  p_folio_id UUID, p_amount_gbp NUMERIC, p_method TEXT,
  p_amount_original NUMERIC DEFAULT NULL, p_currency TEXT DEFAULT 'GBP', p_fx_rate NUMERIC DEFAULT NULL,
  p_reference TEXT DEFAULT NULL, p_received_by UUID DEFAULT NULL, p_notes TEXT DEFAULT NULL, p_actor TEXT DEFAULT 'staff'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_f folios%ROWTYPE; v_pay payments%ROWTYPE; v_limit NUMERIC;
BEGIN
  PERFORM assert_money(p_amount_gbp);
  IF p_currency <> 'GBP' AND p_amount_original IS NULL THEN RAISE EXCEPTION 'MISSING_ORIGINAL_AMOUNT' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_f FROM folios WHERE id = p_folio_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FOLIO_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  PERFORM require_staff(v_f.property_id, 50, 'FOLIO_NOT_FOUND');
  IF v_f.status <> 'open' THEN RAISE EXCEPTION 'FOLIO_CLOSED: folio is %', v_f.status USING ERRCODE = 'P0001'; END IF;
  v_limit := folio_payable_limit(p_folio_id);
  IF p_amount_gbp > GREATEST(v_limit, 0) + 0.005 THEN
    RAISE EXCEPTION 'OVERPAYMENT: outstanding is % GBP, payment is % GBP', ROUND(GREATEST(v_limit, 0), 2), p_amount_gbp USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO payments (folio_id, invoice_id, amount_gbp, amount_original, currency, fx_rate, method, status, reference, received_by, received_at, notes)
  VALUES (p_folio_id, v_f.invoice_id, p_amount_gbp, COALESCE(p_amount_original, p_amount_gbp), p_currency, p_fx_rate, p_method, 'completed', p_reference, p_received_by, NOW(), p_notes)
  RETURNING * INTO v_pay;
  INSERT INTO folio_lines (folio_id, business_date, posted_by, type, description, quantity, unit_amount_gbp, credit_gbp, reference_type, reference_id)
  VALUES (p_folio_id, property_business_date(v_f.property_id), p_actor, 'payment', format('Payment (%s)%s', p_method, CASE WHEN p_reference IS NULL THEN '' ELSE ' ' || p_reference END), 1, p_amount_gbp, p_amount_gbp, 'payment', v_pay.id);
  PERFORM sync_invoice_status(v_f.invoice_id);
  RETURN jsonb_build_object('payment', to_jsonb(v_pay), 'balance_gbp', folio_balance(p_folio_id));
END $$;

-- A payment against an invoice. When the invoice was issued from a folio the
-- money is posted to that folio (so the stay's balance falls and check-out
-- does not ask for it again); otherwise it is a standalone invoice payment.
CREATE OR REPLACE FUNCTION record_invoice_payment(
  p_invoice_id UUID, p_amount_gbp NUMERIC, p_method TEXT,
  p_amount_original NUMERIC DEFAULT NULL, p_currency TEXT DEFAULT 'GBP', p_fx_rate NUMERIC DEFAULT NULL,
  p_reference TEXT DEFAULT NULL, p_received_by UUID DEFAULT NULL, p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_inv invoices%ROWTYPE; v_folio folios%ROWTYPE; v_paid NUMERIC := 0; v_outstanding NUMERIC; v_pay payments%ROWTYPE; v_status TEXT;
BEGIN
  PERFORM assert_money(p_amount_gbp);
  IF p_currency <> 'GBP' AND p_amount_original IS NULL THEN
    RAISE EXCEPTION 'MISSING_ORIGINAL_AMOUNT: amount_original is required for non-GBP payments' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVOICE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  PERFORM require_staff(v_inv.property_id, 50, 'INVOICE_NOT_FOUND');
  IF v_inv.status NOT IN ('sent', 'partially_paid', 'overdue') THEN
    RAISE EXCEPTION 'INVALID_STATUS: invoice is %, must be sent, overdue or partially_paid', v_inv.status USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_folio FROM folios WHERE invoice_id = p_invoice_id FOR UPDATE;
  IF FOUND THEN
    v_paid := folio_net_paid(v_folio.id);
  ELSE
    SELECT COALESCE(SUM(p.amount_gbp), 0) - COALESCE((SELECT SUM(r.amount_gbp) FROM refunds r JOIN payments p2 ON p2.id = r.payment_id WHERE p2.invoice_id = p_invoice_id), 0)
      INTO v_paid FROM payments p
     WHERE p.invoice_id = p_invoice_id AND p.status IN ('completed', 'partially_refunded', 'refunded');
  END IF;
  v_outstanding := v_inv.total_gbp - v_paid;
  IF p_amount_gbp > v_outstanding + 0.005 THEN
    RAISE EXCEPTION 'OVERPAYMENT: outstanding is % GBP, payment is % GBP', ROUND(GREATEST(v_outstanding, 0), 2), p_amount_gbp USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO payments (invoice_id, folio_id, amount_gbp, amount_original, currency, fx_rate, method, status, reference, received_by, received_at, notes)
  VALUES (p_invoice_id, v_folio.id, p_amount_gbp, COALESCE(p_amount_original, p_amount_gbp), p_currency, p_fx_rate,
          p_method, 'completed', p_reference, p_received_by, NOW(), p_notes)
  RETURNING * INTO v_pay;
  IF v_folio.id IS NOT NULL THEN
    INSERT INTO folio_lines (folio_id, business_date, posted_by, type, description, quantity, unit_amount_gbp, credit_gbp, reference_type, reference_id)
    VALUES (v_folio.id, property_business_date(v_folio.property_id), 'staff', 'payment',
            format('Payment on invoice %s (%s)', v_inv.invoice_number, p_method), 1, p_amount_gbp, p_amount_gbp, 'payment', v_pay.id);
  END IF;
  v_status := sync_invoice_status(p_invoice_id);
  RETURN jsonb_build_object(
    'payment', to_jsonb(v_pay),
    'invoice_status', v_status,
    'outstanding_gbp', ROUND(v_outstanding - p_amount_gbp, 2)
  );
END $$;

CREATE OR REPLACE FUNCTION refund_payment(
  p_payment_id UUID, p_amount_gbp NUMERIC, p_reason TEXT, p_refunded_by UUID DEFAULT NULL, p_reference TEXT DEFAULT NULL, p_actor TEXT DEFAULT 'manager'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_pay payments%ROWTYPE; v_prop UUID; v_refunded NUMERIC; v_r refunds%ROWTYPE; v_invoice UUID;
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
  END IF;
  v_invoice := COALESCE(v_pay.invoice_id, (SELECT invoice_id FROM folios WHERE id = v_pay.folio_id));
  PERFORM sync_invoice_status(v_invoice);
  RETURN jsonb_build_object('refund', to_jsonb(v_r), 'balance_gbp', CASE WHEN v_pay.folio_id IS NULL THEN NULL ELSE folio_balance(v_pay.folio_id) END);
END $$;

-- Void a charge by posting an equal and opposite reversal. A room night
-- takes its VAT and levy with it; any other charge takes its VAT line.
CREATE OR REPLACE FUNCTION void_folio_line(p_line_id UUID, p_reason TEXT, p_actor TEXT DEFAULT 'manager')
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_l folio_lines%ROWTYPE; v_f folios%ROWTYPE; v_rev folio_lines%ROWTYPE; v_date DATE;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN RAISE EXCEPTION 'REASON_REQUIRED: a void needs a reason' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_l FROM folio_lines WHERE id = p_line_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'LINE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_f FROM folios WHERE id = v_l.folio_id FOR UPDATE;
  PERFORM require_staff(v_f.property_id, 70, 'LINE_NOT_FOUND');
  IF v_l.type IN ('payment', 'refund', 'reversal') THEN RAISE EXCEPTION 'INVALID_VOID: use a refund for payments' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM folio_lines WHERE reversal_of = p_line_id) THEN RAISE EXCEPTION 'ALREADY_VOIDED' USING ERRCODE = 'P0001'; END IF;
  IF v_f.status <> 'open' THEN RAISE EXCEPTION 'FOLIO_CLOSED: folio is %', v_f.status USING ERRCODE = 'P0001'; END IF;
  v_date := property_business_date(v_f.property_id);
  INSERT INTO folio_lines (folio_id, business_date, posted_by, type, description, quantity, unit_amount_gbp, credit_gbp, reversal_of, void_reason)
  VALUES (v_l.folio_id, v_date, p_actor, 'reversal', format('Void: %s', v_l.description), 1, v_l.debit_gbp, v_l.debit_gbp, p_line_id, p_reason) RETURNING * INTO v_rev;
  INSERT INTO folio_lines (folio_id, business_date, posted_by, type, description, quantity, unit_amount_gbp, credit_gbp, reversal_of, void_reason)
  SELECT t.folio_id, v_date, p_actor, 'reversal', format('Void: %s', t.description), 1, t.debit_gbp, t.debit_gbp, t.id, p_reason
    FROM folio_lines t
   WHERE t.folio_id = v_l.folio_id
     AND ((t.type = 'tax' AND t.reference_type = 'charge' AND t.reference_id = p_line_id)
          OR (v_l.type = 'room' AND t.type IN ('tax', 'levy') AND t.reference_type = 'room_night' AND t.business_date = v_l.business_date))
     AND NOT EXISTS (SELECT 1 FROM folio_lines r WHERE r.reversal_of = t.id);
  RETURN jsonb_build_object('reversal', to_jsonb(v_rev), 'balance_gbp', folio_balance(v_l.folio_id));
END $$;

-- Issue an invoice from the folio. If charges changed since the last issue,
-- the old invoice is cancelled and a new one issued with every charge.
CREATE OR REPLACE FUNCTION issue_folio_invoice(p_folio_id UUID, p_due_date DATE DEFAULT NULL, p_actor TEXT DEFAULT 'staff')
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_f folios%ROWTYPE; v_items JSONB; v_sub NUMERIC; v_tax NUMERIC; v_total NUMERIC; v_paid NUMERIC;
        v_inv invoices%ROWTYPE; v_old invoices%ROWTYPE; v_status TEXT;
BEGIN
  SELECT * INTO v_f FROM folios WHERE id = p_folio_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FOLIO_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  PERFORM require_staff(v_f.property_id, 50, 'FOLIO_NOT_FOUND');
  -- Net charges after reversals, grouped by kind (tax is a separate total)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('description', d, 'quantity', q, 'unit_price_gbp', ROUND(a / NULLIF(q, 0), 2), 'total_gbp', ROUND(a, 2)) ORDER BY d), '[]'::jsonb),
         COALESCE(SUM(a), 0)
    INTO v_items, v_sub
    FROM (
      SELECT d, SUM(q) AS q, SUM(a) AS a FROM (
        SELECT CASE l.type WHEN 'room' THEN 'Accommodation' WHEN 'levy' THEN 'Tourism levy' WHEN 'fnb' THEN 'Food & beverage' WHEN 'extra' THEN 'Extras' ELSE 'Adjustments' END AS d,
               l.quantity AS q, l.debit_gbp AS a
          FROM folio_lines l WHERE l.folio_id = p_folio_id AND l.type IN ('room','levy','fnb','extra','adjustment')
        UNION ALL
        SELECT CASE o.type WHEN 'room' THEN 'Accommodation' WHEN 'levy' THEN 'Tourism levy' WHEN 'fnb' THEN 'Food & beverage' WHEN 'extra' THEN 'Extras' ELSE 'Adjustments' END,
               -o.quantity, -r.credit_gbp
          FROM folio_lines r JOIN folio_lines o ON o.id = r.reversal_of
         WHERE r.folio_id = p_folio_id AND r.type = 'reversal' AND o.type IN ('room','levy','fnb','extra','adjustment')
      ) x GROUP BY d HAVING ABS(SUM(a)) > 0.004
    ) g;
  SELECT COALESCE(SUM(debit_gbp), 0) - COALESCE((SELECT SUM(r.credit_gbp) FROM folio_lines r JOIN folio_lines o ON o.id = r.reversal_of WHERE r.folio_id = p_folio_id AND o.type = 'tax'), 0)
    INTO v_tax FROM folio_lines WHERE folio_id = p_folio_id AND type = 'tax';
  v_total := ROUND(v_sub + v_tax, 2);

  IF v_f.invoice_id IS NOT NULL THEN
    SELECT * INTO v_old FROM invoices WHERE id = v_f.invoice_id FOR UPDATE;
    IF v_old.status <> 'cancelled' AND ABS(v_old.total_gbp - v_total) < 0.005 THEN
      PERFORM sync_invoice_status(v_old.id);
      SELECT * INTO v_old FROM invoices WHERE id = v_old.id;
      RETURN jsonb_build_object('invoice', to_jsonb(v_old), 'already_issued', true);
    END IF;
    IF v_old.status <> 'cancelled' THEN
      UPDATE invoices SET status = 'cancelled',
             notes = concat_ws(E'\n', notes, format('Superseded: folio charges changed (%s -> %s GBP)', v_old.total_gbp, v_total))
       WHERE id = v_old.id;
    END IF;
  END IF;

  v_paid := folio_net_paid(p_folio_id);
  v_status := CASE WHEN v_paid >= v_total - 0.005 THEN 'paid' WHEN v_paid > 0.005 THEN 'partially_paid' ELSE 'sent' END;
  INSERT INTO invoices (property_id, booking_id, guest_id, invoice_number, status, subtotal_gbp, tax_amount_gbp, total_gbp, line_items, due_date, sent_at, paid_at, notes)
  VALUES (v_f.property_id, v_f.booking_id, v_f.guest_id, next_invoice_number(), v_status, ROUND(v_sub, 2), ROUND(v_tax, 2), v_total, v_items,
          COALESCE(p_due_date, property_business_date(v_f.property_id) + 14), NOW(), CASE WHEN v_status = 'paid' THEN NOW() END,
          concat_ws(E'\n', format('Issued from folio by %s', p_actor), CASE WHEN v_old.id IS NOT NULL THEN format('Replaces invoice %s', v_old.invoice_number) END))
  RETURNING * INTO v_inv;
  UPDATE folios SET invoice_id = v_inv.id, updated_at = NOW() WHERE id = p_folio_id;
  RETURN jsonb_build_object('invoice', to_jsonb(v_inv), 'already_issued', false, 'replaces_invoice_id', v_old.id);
END $$;

-- ------------------------------------------------------------
-- 5. Stay lifecycle
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION checkin_booking(p_booking_id UUID, p_notes TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_b bookings%ROWTYPE; v_apt_status TEXT; v_today DATE; v_folio UUID;
BEGIN
  SELECT * INTO v_b FROM bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  PERFORM require_staff(v_b.property_id, 50, 'BOOKING_NOT_FOUND');
  IF v_b.status <> 'confirmed' THEN RAISE EXCEPTION 'INVALID_STATUS: booking is %, must be confirmed', v_b.status USING ERRCODE = 'P0001'; END IF;
  IF v_b.guest_id IS NULL THEN RAISE EXCEPTION 'NO_GUEST: attach a guest profile before check-in' USING ERRCODE = 'P0001'; END IF;
  v_today := property_business_date(v_b.property_id);
  IF v_b.check_in > v_today THEN RAISE EXCEPTION 'TOO_EARLY: arrival date is %, business date is %', v_b.check_in, v_today USING ERRCODE = 'P0001'; END IF;
  IF v_b.check_out <= v_today THEN
    RAISE EXCEPTION 'STALE_STAY: this stay ended on %; amend the dates before checking in', v_b.check_out USING ERRCODE = 'P0001';
  END IF;
  SELECT status INTO v_apt_status FROM apartments WHERE id = v_b.apartment_id FOR UPDATE;
  IF v_apt_status IS DISTINCT FROM 'available' THEN RAISE EXCEPTION 'ROOM_NOT_READY: apartment status is %', COALESCE(v_apt_status, 'unknown') USING ERRCODE = 'P0001'; END IF;
  UPDATE bookings SET status = 'checked_in', checked_in_at = NOW(),
         internal_notes = CASE WHEN p_notes IS NULL OR p_notes = '' THEN internal_notes ELSE concat_ws(E'\n', internal_notes, p_notes) END
   WHERE id = p_booking_id RETURNING * INTO v_b;
  UPDATE apartments SET status = 'occupied' WHERE id = v_b.apartment_id;
  v_folio := open_folio(v_b.id);
  RETURN to_jsonb(v_b) || jsonb_build_object('folio_id', v_folio);
END;
$$;

CREATE OR REPLACE FUNCTION post_booking_room_charges(p_booking_id UUID)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_b bookings%ROWTYPE; v_today DATE; v_d DATE; v_n INT := 0;
BEGIN
  SELECT * INTO v_b FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  PERFORM require_staff(v_b.property_id, 50, 'BOOKING_NOT_FOUND');
  IF v_b.status <> 'checked_in' THEN RETURN 0; END IF;
  v_today := property_business_date(v_b.property_id);
  PERFORM open_folio(v_b.id);
  v_d := v_b.check_in;
  WHILE v_d < GREATEST(LEAST(v_b.check_out, v_today), v_b.check_in + 1) LOOP
    v_n := v_n + post_room_charges(v_b.property_id, v_d, 'checkout', v_b.id);
    v_d := v_d + 1;
  END LOOP;
  RETURN v_n;
END $$;

CREATE OR REPLACE FUNCTION checkout_booking(
  p_booking_id UUID, p_notes TEXT DEFAULT NULL, p_allow_outstanding_balance BOOLEAN DEFAULT FALSE, p_points_per_gbp NUMERIC DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_b bookings%ROWTYPE; v_today DATE; v_folio UUID; v_outstanding NUMERIC := 0; v_points INT := 0; v_balance INT := 0; v_tier TEXT; v_task_id UUID; v_d DATE;
BEGIN
  SELECT * INTO v_b FROM bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  PERFORM require_staff(v_b.property_id, 50, 'BOOKING_NOT_FOUND');
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
  IF v_outstanding > 0.005 AND NOT p_allow_outstanding_balance THEN
    RAISE EXCEPTION 'OUTSTANDING_BALANCE: % GBP unpaid on this stay', ROUND(v_outstanding, 2) USING ERRCODE = 'P0001';
  END IF;

  UPDATE bookings SET status = 'checked_out', checked_out_at = NOW(),
         internal_notes = CASE WHEN p_notes IS NULL OR p_notes = '' THEN internal_notes ELSE concat_ws(E'\n', internal_notes, p_notes) END
   WHERE id = p_booking_id RETURNING * INTO v_b;
  UPDATE apartments SET status = 'cleaning' WHERE id = v_b.apartment_id;
  -- One open checkout clean per unit and day (the automations may have
  -- created it already; see uq_housekeeping_open_checkout_clean).
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
    v_points := FLOOR(v_b.total_amount_gbp * p_points_per_gbp)::INT;
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

-- ------------------------------------------------------------
-- 6. Night audit: only days that have ended, serialised per property
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION run_night_audit(p_property_id UUID, p_business_date DATE DEFAULT NULL, p_actor TEXT DEFAULT 'system')
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_date DATE; v_today DATE; v_existing daily_closes%ROWTYPE; v_close daily_closes%ROWTYPE;
  v_arr_exp INT; v_arr_in INT; v_noshow INT; v_dep_exp INT; v_dep_out INT; v_overstay INT;
  v_occ INT; v_total INT; v_room_rev NUMERIC; v_payments NUMERIC; v_posted INT;
BEGIN
  PERFORM require_staff(p_property_id, 90, 'PROPERTY_FORBIDDEN: property not found');
  -- Lock first so two audits of the same property cannot both pass the check below.
  PERFORM 1 FROM properties WHERE id = p_property_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROPERTY_FORBIDDEN: property not found' USING ERRCODE = 'P0002'; END IF;
  v_today := property_business_date(p_property_id);
  v_date := COALESCE(p_business_date, v_today - 1);
  IF v_date >= v_today THEN
    RAISE EXCEPTION 'BUSINESS_DATE_OPEN: % has not ended yet (business date is %)', v_date, v_today USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_existing FROM daily_closes WHERE property_id = p_property_id AND business_date = v_date;
  IF FOUND THEN RETURN jsonb_build_object('already_closed', true, 'close', to_jsonb(v_existing)); END IF;

  SELECT COUNT(*) FILTER (WHERE status IN ('confirmed','checked_in','checked_out','no_show')),
         COUNT(*) FILTER (WHERE status IN ('checked_in','checked_out'))
    INTO v_arr_exp, v_arr_in FROM bookings WHERE property_id = p_property_id AND check_in = v_date;
  WITH marked AS (
    UPDATE bookings SET status = 'no_show', internal_notes = concat_ws(E'\n', internal_notes, format('Marked no-show by night audit for %s', v_date))
     WHERE property_id = p_property_id AND status = 'confirmed' AND check_in <= v_date RETURNING id
  ) SELECT COUNT(*) INTO v_noshow FROM marked;
  SELECT COUNT(*) FILTER (WHERE status IN ('checked_in','checked_out')), COUNT(*) FILTER (WHERE status = 'checked_out'), COUNT(*) FILTER (WHERE status = 'checked_in')
    INTO v_dep_exp, v_dep_out, v_overstay FROM bookings WHERE property_id = p_property_id AND check_out = v_date;

  v_posted := post_room_charges(p_property_id, v_date, 'night_audit');

  SELECT COUNT(*) INTO v_occ FROM bookings WHERE property_id = p_property_id AND status IN ('checked_in','checked_out') AND check_in <= v_date AND check_out > v_date;
  SELECT COUNT(*) INTO v_total FROM apartments WHERE property_id = p_property_id AND status <> 'out_of_service';
  SELECT COALESCE(SUM(l.debit_gbp), 0) INTO v_room_rev FROM folio_lines l JOIN folios f ON f.id = l.folio_id
   WHERE f.property_id = p_property_id AND l.type = 'room' AND l.business_date = v_date;
  SELECT COALESCE(SUM(p.amount_gbp), 0) INTO v_payments FROM payments p
    LEFT JOIN invoices i ON i.id = p.invoice_id LEFT JOIN folios f ON f.id = p.folio_id
   WHERE COALESCE(f.property_id, i.property_id) = p_property_id AND p.status IN ('completed','partially_refunded','refunded')
     AND (p.received_at AT TIME ZONE COALESCE((SELECT timezone FROM properties WHERE id = p_property_id), 'UTC'))::date = v_date;

  INSERT INTO daily_closes (property_id, business_date, closed_by, arrivals_expected, arrivals_checked_in, no_shows_marked, departures_expected,
      departures_checked_out, still_in_house_past_checkout, rooms_occupied, rooms_total, occupancy_percent, room_revenue_gbp, payments_received_gbp, notes)
  VALUES (p_property_id, v_date, p_actor, v_arr_exp, v_arr_in, v_noshow, v_dep_exp, v_dep_out, v_overstay, v_occ, v_total,
      CASE WHEN v_total > 0 THEN ROUND(v_occ::numeric / v_total * 100, 2) ELSE 0 END, ROUND(v_room_rev, 2), ROUND(v_payments, 2),
      jsonb_build_object('room_charges_posted', v_posted))
  RETURNING * INTO v_close;
  -- A catch-up run for an older date never moves the business date back.
  UPDATE properties SET last_business_date = GREATEST(COALESCE(last_business_date, v_date), v_date) WHERE id = p_property_id;
  RETURN jsonb_build_object('already_closed', false, 'close', to_jsonb(v_close));
END;
$$;

-- ------------------------------------------------------------
-- 7. Groups
-- ------------------------------------------------------------
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
    IF v_guest IS NOT NULL AND NOT EXISTS (SELECT 1 FROM guests WHERE id = v_guest AND property_id = v_g.property_id) THEN
      RAISE EXCEPTION 'PROPERTY_FORBIDDEN: guest % does not belong to this property', v_guest;
    END IF;
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

-- One organiser payment allocated to the rooms that can still take money
-- (largest first, then room number): what each room owes, or for a stay not
-- yet over the rest of its expected cost. Money left over is refused.
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
BEGIN
  PERFORM assert_money(p_amount_gbp);
  SELECT * INTO v_g FROM booking_groups WHERE id = p_group_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GROUP_NOT_FOUND: group % not found', p_group_id; END IF;

  FOR r IN
    SELECT b.id AS booking_id, a.number, f.id AS folio_id,
           CASE WHEN f.id IS NULL THEN COALESCE(booking_contract_gross(b.id), 0) ELSE folio_payable_limit(f.id) END AS payable
    FROM bookings b
    JOIN apartments a ON a.id = b.apartment_id
    LEFT JOIN folios f ON f.booking_id = b.id
    WHERE b.group_id = p_group_id AND b.status NOT IN ('cancelled', 'no_show', 'checked_out')
    ORDER BY 4 DESC, a.number
  LOOP
    EXIT WHEN v_left <= 0;
    IF r.payable <= 0.005 THEN CONTINUE; END IF;
    v_fid := COALESCE(r.folio_id, open_folio(r.booking_id));
    v_bal := folio_payable_limit(v_fid);
    IF v_bal <= 0.005 THEN CONTINUE; END IF;
    v_part := LEAST(v_left, ROUND(v_bal, 2));
    PERFORM record_folio_payment(v_fid, v_part, p_method, NULL, 'GBP', NULL,
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

-- ------------------------------------------------------------
-- 8. Point of sale
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_pos_tickets_reference') THEN
    IF EXISTS (SELECT 1 FROM pos_tickets WHERE ticket_reference IS NOT NULL AND status = 'posted'
               GROUP BY outlet_id, ticket_reference HAVING count(*) > 1) THEN
      RAISE NOTICE 'pos_tickets has duplicate ticket references; uq_pos_tickets_reference not created (post_pos_ticket still refuses new duplicates)';
    ELSE
      CREATE UNIQUE INDEX uq_pos_tickets_reference ON pos_tickets (outlet_id, ticket_reference)
        WHERE ticket_reference IS NOT NULL AND status = 'posted';
    END IF;
  END IF;
END $$;

-- Post a ticket to the in-house guest's folio. Items: [{item_id?, name, quantity, unit_price_gbp, tax_rate_percent?}].
-- Catalogue items take their price from the catalogue; free-text lines are a
-- management action. A ticket_reference already posted at this outlet
-- returns the original ticket instead of charging twice.
CREATE OR REPLACE FUNCTION post_pos_ticket(
  p_outlet_id uuid,
  p_booking_id uuid,
  p_items jsonb,
  p_ticket_reference text DEFAULT NULL,
  p_posted_by uuid DEFAULT NULL,
  p_posted_by_name text DEFAULT 'pos'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_o pos_outlets%ROWTYPE;
  v_b bookings%ROWTYPE;
  v_item pos_items%ROWTYPE;
  v_folio uuid;
  v_type text;
  it jsonb;
  v_name text; v_qty numeric; v_price numeric; v_rate numeric;
  v_res jsonb;
  v_lines uuid[] := '{}';
  v_posted jsonb := '[]'::jsonb;
  v_sub numeric := 0; v_tax numeric := 0;
  v_ticket pos_tickets%ROWTYPE;
BEGIN
  SELECT * INTO v_o FROM pos_outlets WHERE id = p_outlet_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'OUTLET_NOT_FOUND: outlet % not found', p_outlet_id; END IF;
  PERFORM require_staff(v_o.property_id, 30, format('OUTLET_NOT_FOUND: outlet %s not found', p_outlet_id));
  IF NOT v_o.is_active THEN RAISE EXCEPTION 'OUTLET_CLOSED: % is closed', v_o.name; END IF;
  SELECT * INTO v_b FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND: booking % not found', p_booking_id; END IF;
  IF v_b.property_id <> v_o.property_id THEN RAISE EXCEPTION 'PROPERTY_FORBIDDEN: outlet and booking belong to different properties'; END IF;

  IF p_ticket_reference IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_outlet_id::text || ':' || p_ticket_reference, 0));
    SELECT * INTO v_ticket FROM pos_tickets
     WHERE outlet_id = p_outlet_id AND ticket_reference = p_ticket_reference AND status = 'posted';
    IF FOUND THEN
      RETURN jsonb_build_object(
        'ticket_id', v_ticket.id, 'folio_id', v_ticket.folio_id, 'booking_id', v_ticket.booking_id, 'reference', v_b.reference,
        'outlet', v_o.name, 'items', v_ticket.items, 'subtotal_gbp', v_ticket.subtotal_gbp, 'tax_gbp', v_ticket.tax_gbp,
        'total_gbp', v_ticket.total_gbp, 'folio_balance_gbp', folio_balance(v_ticket.folio_id), 'duplicate', true);
    END IF;
  END IF;

  IF v_b.status <> 'checked_in' THEN RAISE EXCEPTION 'NOT_IN_HOUSE: booking % is % (room charges need an in-house guest)', v_b.reference, v_b.status; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: a ticket needs at least one item';
  END IF;
  v_folio := open_folio(p_booking_id);
  v_type := CASE WHEN v_o.type IN ('restaurant', 'bar', 'minibar') THEN 'fnb' ELSE 'extra' END;

  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := COALESCE((it->>'quantity')::numeric, 1);
    IF v_qty < 1 OR v_qty > 999 OR v_qty <> trunc(v_qty) THEN RAISE EXCEPTION 'INVALID_AMOUNT: quantity must be a whole number between 1 and 999'; END IF;
    IF (it->>'item_id') IS NOT NULL THEN
      SELECT * INTO v_item FROM pos_items WHERE id = (it->>'item_id')::uuid AND outlet_id = p_outlet_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'ITEM_NOT_FOUND: item % is not sold by %', it->>'item_id', v_o.name; END IF;
      IF NOT v_item.is_active THEN RAISE EXCEPTION 'ITEM_NOT_FOUND: % is no longer on the menu', v_item.name; END IF;
      v_name := v_item.name; v_price := v_item.unit_price_gbp;
      v_rate := COALESCE(v_item.tax_rate_percent, v_o.default_tax_rate_percent);
    ELSE
      IF NOT (is_trusted_caller() OR role_at_least(70)) THEN
        RAISE EXCEPTION 'ROLE_FORBIDDEN: only managers can post items that are not on the menu' USING ERRCODE = '42501';
      END IF;
      v_name := NULLIF(trim(it->>'name'), '');
      v_price := (it->>'unit_price_gbp')::numeric;
      v_rate := COALESCE((it->>'tax_rate_percent')::numeric, v_o.default_tax_rate_percent);
      IF v_name IS NULL OR v_price IS NULL THEN RAISE EXCEPTION 'INVALID_INPUT: free-text items need a name and a price'; END IF;
      IF v_price <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT: price must be positive'; END IF;
    END IF;
    v_res := post_folio_charge_unchecked(v_folio, v_type, v_o.name || ': ' || v_name, v_qty, v_price, v_rate, p_posted_by_name);
    v_lines := v_lines || (v_res->'line'->>'id')::uuid;
    IF (v_res->>'tax_line_id') IS NOT NULL THEN
      v_lines := v_lines || (v_res->>'tax_line_id')::uuid;
      v_tax := v_tax + COALESCE((SELECT debit_gbp FROM folio_lines WHERE id = (v_res->>'tax_line_id')::uuid), 0);
    END IF;
    v_sub := v_sub + ROUND(v_qty * v_price, 2);
    v_posted := v_posted || jsonb_build_object('name', v_name, 'quantity', v_qty, 'unit_price_gbp', v_price, 'tax_rate_percent', (v_res->'line'->>'tax_rate_percent')::numeric, 'line_id', v_res->'line'->>'id');
  END LOOP;

  INSERT INTO pos_tickets (property_id, outlet_id, booking_id, folio_id, ticket_reference, items, folio_line_ids, subtotal_gbp, tax_gbp, total_gbp, business_date, posted_by, posted_by_name)
  VALUES (v_o.property_id, p_outlet_id, p_booking_id, v_folio, p_ticket_reference, v_posted, v_lines, ROUND(v_sub, 2), ROUND(v_tax, 2), ROUND(v_sub + v_tax, 2), property_business_date(v_o.property_id), p_posted_by, p_posted_by_name)
  RETURNING * INTO v_ticket;

  RETURN jsonb_build_object(
    'ticket_id', v_ticket.id, 'folio_id', v_folio, 'booking_id', p_booking_id, 'reference', v_b.reference,
    'outlet', v_o.name, 'items', v_posted, 'subtotal_gbp', v_ticket.subtotal_gbp, 'tax_gbp', v_ticket.tax_gbp,
    'total_gbp', v_ticket.total_gbp, 'folio_balance_gbp', folio_balance(v_folio), 'duplicate', false
  );
END $$;

-- Void a whole ticket: reverses every line it posted (manager, reason required) and marks the ticket.
CREATE OR REPLACE FUNCTION void_pos_ticket(p_ticket_id uuid, p_reason text, p_actor text DEFAULT 'manager') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_t pos_tickets%ROWTYPE; v_line uuid; v_n integer := 0;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN RAISE EXCEPTION 'REASON_REQUIRED: a reason is required to void a ticket'; END IF;
  SELECT * INTO v_t FROM pos_tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TICKET_NOT_FOUND: ticket % not found', p_ticket_id; END IF;
  PERFORM require_staff(v_t.property_id, 70, format('TICKET_NOT_FOUND: ticket %s not found', p_ticket_id));
  IF v_t.status = 'voided' THEN RAISE EXCEPTION 'ALREADY_VOIDED: ticket already voided'; END IF;
  FOREACH v_line IN ARRAY v_t.folio_line_ids LOOP
    -- Every line the ticket created (charges and their VAT) that has not been reversed yet
    IF NOT EXISTS (SELECT 1 FROM folio_lines WHERE reversal_of = v_line) THEN
      PERFORM void_folio_line(v_line, p_reason, p_actor);
      v_n := v_n + 1;
    END IF;
  END LOOP;
  UPDATE pos_tickets SET status = 'voided', voided_at = now() WHERE id = p_ticket_id;
  RETURN jsonb_build_object('ticket_id', p_ticket_id, 'lines_voided', v_n, 'folio_balance_gbp', folio_balance(v_t.folio_id));
END $$;

-- ------------------------------------------------------------
-- 9. Quotes: round the stay total once, not every night
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 10. Race-proof automations: one open checkout clean per unit and day, one
--     pricing decision per apartment type and day. Concurrent inserts now
--     fail with 23505 (unique_violation), which callers treat as done.
-- ------------------------------------------------------------
-- Duplicates left by earlier races: drop the later, untouched copies.
DELETE FROM housekeeping_tasks h
 USING housekeeping_tasks k
 WHERE h.type = 'checkout_clean' AND k.type = 'checkout_clean'
   AND h.apartment_id = k.apartment_id AND h.scheduled_date = k.scheduled_date
   AND h.status = 'pending' AND h.assigned_to IS NULL AND h.started_at IS NULL
   AND k.status NOT IN ('completed', 'verified')
   AND (k.created_at, k.id) < (h.created_at, h.id);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_housekeeping_open_checkout_clean') THEN
    IF EXISTS (SELECT 1 FROM housekeeping_tasks WHERE type = 'checkout_clean' AND status NOT IN ('completed', 'verified')
               GROUP BY apartment_id, scheduled_date HAVING count(*) > 1) THEN
      RAISE NOTICE 'open duplicate checkout cleans remain (assigned or started); uq_housekeeping_open_checkout_clean not created';
    ELSE
      CREATE UNIQUE INDEX uq_housekeeping_open_checkout_clean ON housekeeping_tasks (apartment_id, scheduled_date, type)
        WHERE type = 'checkout_clean' AND status NOT IN ('completed', 'verified');
    END IF;
  END IF;
END $$;

DELETE FROM pricing_decisions d
 USING pricing_decisions k
 WHERE d.apartment_type_id = k.apartment_type_id AND d.decision_date = k.decision_date
   AND (k.created_at, k.id) < (d.created_at, d.id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pricing_decisions_type_day ON pricing_decisions (apartment_type_id, decision_date);

-- ------------------------------------------------------------
-- 11. Execute grants: ledger entry points are for signed-in staff and the
--     service role, never anon.
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION
  open_folio(UUID),
  post_folio_charge(UUID, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT),
  record_folio_payment(UUID, NUMERIC, TEXT, NUMERIC, TEXT, NUMERIC, TEXT, UUID, TEXT, TEXT),
  record_invoice_payment(UUID, NUMERIC, TEXT, NUMERIC, TEXT, NUMERIC, TEXT, UUID, TEXT),
  refund_payment(UUID, NUMERIC, TEXT, UUID, TEXT, TEXT),
  void_folio_line(UUID, TEXT, TEXT),
  issue_folio_invoice(UUID, DATE, TEXT),
  checkin_booking(UUID, TEXT),
  checkout_booking(UUID, TEXT, BOOLEAN, NUMERIC),
  post_booking_room_charges(UUID),
  run_night_audit(UUID, DATE, TEXT),
  record_group_payment(UUID, NUMERIC, TEXT, TEXT, UUID, TEXT),
  add_group_rooms(UUID, UUID[], UUID[], INTEGER, UUID),
  post_pos_ticket(UUID, UUID, JSONB, TEXT, UUID, TEXT),
  void_pos_ticket(UUID, TEXT, TEXT),
  sync_invoice_status(UUID)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  open_folio(UUID),
  post_folio_charge(UUID, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT),
  record_folio_payment(UUID, NUMERIC, TEXT, NUMERIC, TEXT, NUMERIC, TEXT, UUID, TEXT, TEXT),
  record_invoice_payment(UUID, NUMERIC, TEXT, NUMERIC, TEXT, NUMERIC, TEXT, UUID, TEXT),
  refund_payment(UUID, NUMERIC, TEXT, UUID, TEXT, TEXT),
  void_folio_line(UUID, TEXT, TEXT),
  issue_folio_invoice(UUID, DATE, TEXT),
  checkin_booking(UUID, TEXT),
  checkout_booking(UUID, TEXT, BOOLEAN, NUMERIC),
  post_booking_room_charges(UUID),
  run_night_audit(UUID, DATE, TEXT),
  record_group_payment(UUID, NUMERIC, TEXT, TEXT, UUID, TEXT),
  add_group_rooms(UUID, UUID[], UUID[], INTEGER, UUID),
  post_pos_ticket(UUID, UUID, JSONB, TEXT, UUID, TEXT),
  void_pos_ticket(UUID, TEXT, TEXT)
TO authenticated, service_role;
-- sync_invoice_status only runs inside the functions above.
REVOKE EXECUTE ON FUNCTION sync_invoice_status(UUID) FROM authenticated;
