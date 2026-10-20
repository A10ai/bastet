-- ============================================================
-- Migration 00026: Guest folio and ledger (grade-A finance)
--   folios / folio_lines (append-only), refunds, payments against folios,
--   room charges posted per night by the night audit (with VAT and levy),
--   invoices issued from the folio and frozen once issued,
--   revenue by stay date, department budgets.
-- ============================================================

-- ------------------------------------------------------------
-- Tables
-- ------------------------------------------------------------
ALTER TABLE properties ADD COLUMN IF NOT EXISTS tourism_levy_per_night_gbp DECIMAL(10,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS folios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id),
  booking_id UUID NOT NULL REFERENCES bookings(id) UNIQUE,
  guest_id UUID REFERENCES guests(id),
  status VARCHAR(10) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'void')),
  invoice_id UUID REFERENCES invoices(id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  closed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_folios_property_status ON folios (property_id, status);

CREATE TABLE IF NOT EXISTS folio_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio_id UUID NOT NULL REFERENCES folios(id),
  business_date DATE NOT NULL,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  posted_by TEXT NOT NULL DEFAULT 'system',
  type VARCHAR(12) NOT NULL CHECK (type IN ('room', 'tax', 'levy', 'extra', 'fnb', 'adjustment', 'payment', 'refund', 'reversal')),
  description VARCHAR(200) NOT NULL,
  quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
  unit_amount_gbp DECIMAL(12,2) NOT NULL DEFAULT 0,
  -- Charges are debits, payments are credits; the balance is debits - credits.
  debit_gbp DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (debit_gbp >= 0),
  credit_gbp DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (credit_gbp >= 0),
  tax_rate_percent DECIMAL(5,2),
  reference_type VARCHAR(30),
  reference_id UUID,
  reversal_of UUID REFERENCES folio_lines(id),
  void_reason TEXT,
  CHECK (debit_gbp = 0 OR credit_gbp = 0)
);
CREATE INDEX IF NOT EXISTS idx_folio_lines_folio ON folio_lines (folio_id, posted_at);
-- One room charge per folio per night (idempotent posting)
CREATE UNIQUE INDEX IF NOT EXISTS uq_folio_room_night ON folio_lines (folio_id, business_date) WHERE type = 'room';
CREATE UNIQUE INDEX IF NOT EXISTS uq_folio_tax_night ON folio_lines (folio_id, business_date) WHERE type = 'tax' AND reference_type = 'room_night';
CREATE UNIQUE INDEX IF NOT EXISTS uq_folio_levy_night ON folio_lines (folio_id, business_date) WHERE type = 'levy';

-- Ledger lines are append-only.
CREATE OR REPLACE FUNCTION folio_lines_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'LEDGER_IMMUTABLE: folio lines cannot be changed; post a reversal instead' USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_folio_lines_immutable ON folio_lines;
CREATE TRIGGER trg_folio_lines_immutable BEFORE UPDATE OR DELETE ON folio_lines
  FOR EACH ROW EXECUTE FUNCTION folio_lines_immutable();

-- Payments may now settle a folio (stay) or a standalone invoice.
ALTER TABLE payments ALTER COLUMN invoice_id DROP NOT NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS folio_id UUID REFERENCES folios(id);
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_target_check;
ALTER TABLE payments ADD CONSTRAINT payments_target_check CHECK (invoice_id IS NOT NULL OR folio_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_payments_folio ON payments (folio_id, status);

CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payments(id),
  folio_id UUID REFERENCES folios(id),
  amount_gbp DECIMAL(12,2) NOT NULL CHECK (amount_gbp > 0),
  method VARCHAR(20) NOT NULL,
  reason TEXT NOT NULL,
  reference VARCHAR(100),
  refunded_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS department_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id),
  department VARCHAR(40) NOT NULL,
  month DATE NOT NULL, -- first day of the month
  budget_gbp DECIMAL(12,2) NOT NULL CHECK (budget_gbp >= 0),
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (property_id, department, month)
);

-- Issued invoices are frozen: only workflow fields may change.
CREATE OR REPLACE FUNCTION invoices_frozen_once_issued()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status <> 'draft' AND (
       NEW.line_items IS DISTINCT FROM OLD.line_items OR
       NEW.subtotal_gbp IS DISTINCT FROM OLD.subtotal_gbp OR
       NEW.tax_amount_gbp IS DISTINCT FROM OLD.tax_amount_gbp OR
       NEW.discount_amount_gbp IS DISTINCT FROM OLD.discount_amount_gbp OR
       NEW.total_gbp IS DISTINCT FROM OLD.total_gbp OR
       NEW.invoice_number IS DISTINCT FROM OLD.invoice_number OR
       NEW.guest_id IS DISTINCT FROM OLD.guest_id OR
       NEW.booking_id IS DISTINCT FROM OLD.booking_id) THEN
    RAISE EXCEPTION 'INVOICE_IMMUTABLE: an issued invoice cannot be altered; cancel it and issue a new one' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_invoices_frozen ON invoices;
CREATE TRIGGER trg_invoices_frozen BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION invoices_frozen_once_issued();

-- ------------------------------------------------------------
-- RLS and grants
-- ------------------------------------------------------------
ALTER TABLE folios ENABLE ROW LEVEL SECURITY;
ALTER TABLE folio_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE department_budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS folios_front_desk ON folios;
CREATE POLICY folios_front_desk ON folios FOR ALL TO authenticated
  USING (role_at_least(50) AND can_access_property(property_id))
  WITH CHECK (role_at_least(50) AND can_access_property(property_id));
DROP POLICY IF EXISTS folio_lines_front_desk ON folio_lines;
CREATE POLICY folio_lines_front_desk ON folio_lines FOR ALL TO authenticated
  USING (role_at_least(50) AND folio_id IN (SELECT id FROM folios WHERE can_access_property(property_id)))
  WITH CHECK (role_at_least(50) AND folio_id IN (SELECT id FROM folios WHERE can_access_property(property_id)));
DROP POLICY IF EXISTS refunds_management ON refunds;
CREATE POLICY refunds_management ON refunds FOR ALL TO authenticated
  USING (role_at_least(50) AND folio_id IN (SELECT id FROM folios WHERE can_access_property(property_id)))
  WITH CHECK (role_at_least(70));
DROP POLICY IF EXISTS budgets_management ON department_budgets;
CREATE POLICY budgets_management ON department_budgets FOR ALL TO authenticated
  USING (role_at_least(70) AND can_access_property(property_id))
  WITH CHECK (role_at_least(70) AND can_access_property(property_id));
GRANT ALL ON folios, folio_lines, refunds, department_budgets TO anon, authenticated, service_role;
REVOKE UPDATE, DELETE ON folio_lines FROM anon, authenticated;

-- ------------------------------------------------------------
-- Functions
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION folio_balance(p_folio_id UUID)
RETURNS NUMERIC AS $$
  SELECT COALESCE(SUM(debit_gbp), 0) - COALESCE(SUM(credit_gbp), 0) FROM folio_lines WHERE folio_id = p_folio_id;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION open_folio(p_booking_id UUID)
RETURNS UUID
LANGUAGE plpgsql AS $$
DECLARE v_id UUID; v_b bookings%ROWTYPE;
BEGIN
  SELECT id INTO v_id FROM folios WHERE booking_id = p_booking_id;
  IF FOUND THEN RETURN v_id; END IF;
  SELECT * INTO v_b FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO folios (property_id, booking_id, guest_id) VALUES (v_b.property_id, v_b.id, v_b.guest_id) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Post a charge (extra, fnb, adjustment) with VAT at the property rate.
CREATE OR REPLACE FUNCTION post_folio_charge(
  p_folio_id UUID, p_type TEXT, p_description TEXT, p_quantity NUMERIC, p_unit_amount_gbp NUMERIC,
  p_tax_rate_percent NUMERIC DEFAULT NULL, p_actor TEXT DEFAULT 'staff'
)
RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE v_f folios%ROWTYPE; v_rate NUMERIC; v_net NUMERIC; v_tax NUMERIC; v_date DATE; v_line folio_lines%ROWTYPE; v_tax_line UUID;
BEGIN
  IF p_type NOT IN ('extra', 'fnb', 'adjustment') THEN RAISE EXCEPTION 'INVALID_CHARGE_TYPE: %', p_type USING ERRCODE = 'P0001'; END IF;
  IF p_quantity <= 0 OR p_unit_amount_gbp < 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = 'P0001'; END IF;
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

-- Post room, VAT and levy for every in-house stay for one night. Idempotent.
CREATE OR REPLACE FUNCTION post_room_charges(p_property_id UUID, p_business_date DATE, p_actor TEXT DEFAULT 'night_audit')
RETURNS INT
LANGUAGE plpgsql AS $$
DECLARE v_b RECORD; v_folio UUID; v_rate NUMERIC; v_vat NUMERIC; v_levy NUMERIC; v_net NUMERIC; v_count INT := 0;
BEGIN
  SELECT vat_rate_percent, tourism_levy_per_night_gbp INTO v_vat, v_levy FROM properties WHERE id = p_property_id;
  FOR v_b IN
    SELECT * FROM bookings
     WHERE property_id = p_property_id AND status IN ('checked_in', 'checked_out')
       AND check_in <= p_business_date AND check_out > p_business_date
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

CREATE OR REPLACE FUNCTION record_folio_payment(
  p_folio_id UUID, p_amount_gbp NUMERIC, p_method TEXT,
  p_amount_original NUMERIC DEFAULT NULL, p_currency TEXT DEFAULT 'GBP', p_fx_rate NUMERIC DEFAULT NULL,
  p_reference TEXT DEFAULT NULL, p_received_by UUID DEFAULT NULL, p_notes TEXT DEFAULT NULL, p_actor TEXT DEFAULT 'staff'
)
RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE v_f folios%ROWTYPE; v_pay payments%ROWTYPE; v_bal NUMERIC;
BEGIN
  IF p_amount_gbp IS NULL OR p_amount_gbp <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT: amount must be positive' USING ERRCODE = 'P0001'; END IF;
  IF p_currency <> 'GBP' AND p_amount_original IS NULL THEN RAISE EXCEPTION 'MISSING_ORIGINAL_AMOUNT' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_f FROM folios WHERE id = p_folio_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FOLIO_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_f.status = 'void' THEN RAISE EXCEPTION 'FOLIO_CLOSED: folio is void' USING ERRCODE = 'P0001'; END IF;
  v_bal := folio_balance(p_folio_id);
  -- A deposit before any charge is posted may exceed the (zero) balance.
  -- Once charges exist, a payment may not exceed what is owed.
  IF EXISTS (SELECT 1 FROM folio_lines WHERE folio_id = p_folio_id AND type IN ('room','tax','levy','extra','fnb','adjustment'))
     AND p_amount_gbp > GREATEST(v_bal, 0) + 0.005 THEN
    RAISE EXCEPTION 'OVERPAYMENT: outstanding is % GBP, payment is % GBP', ROUND(GREATEST(v_bal, 0), 2), p_amount_gbp USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO payments (folio_id, amount_gbp, amount_original, currency, fx_rate, method, status, reference, received_by, received_at, notes)
  VALUES (p_folio_id, p_amount_gbp, COALESCE(p_amount_original, p_amount_gbp), p_currency, p_fx_rate, p_method, 'completed', p_reference, p_received_by, NOW(), p_notes)
  RETURNING * INTO v_pay;
  INSERT INTO folio_lines (folio_id, business_date, posted_by, type, description, quantity, unit_amount_gbp, credit_gbp, reference_type, reference_id)
  VALUES (p_folio_id, property_business_date(v_f.property_id), p_actor, 'payment', format('Payment (%s)%s', p_method, CASE WHEN p_reference IS NULL THEN '' ELSE ' ' || p_reference END), 1, p_amount_gbp, p_amount_gbp, 'payment', v_pay.id);
  RETURN jsonb_build_object('payment', to_jsonb(v_pay), 'balance_gbp', folio_balance(p_folio_id));
END $$;

CREATE OR REPLACE FUNCTION refund_payment(
  p_payment_id UUID, p_amount_gbp NUMERIC, p_reason TEXT, p_refunded_by UUID DEFAULT NULL, p_reference TEXT DEFAULT NULL, p_actor TEXT DEFAULT 'manager'
)
RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE v_pay payments%ROWTYPE; v_refunded NUMERIC; v_r refunds%ROWTYPE;
BEGIN
  IF p_amount_gbp IS NULL OR p_amount_gbp <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = 'P0001'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN RAISE EXCEPTION 'REASON_REQUIRED: a refund needs a reason' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_pay FROM payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
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
    VALUES (v_pay.folio_id, property_business_date((SELECT property_id FROM folios WHERE id = v_pay.folio_id)), p_actor, 'refund', format('Refund: %s', p_reason), 1, p_amount_gbp, p_amount_gbp, 'refund', v_r.id);
  END IF;
  RETURN jsonb_build_object('refund', to_jsonb(v_r), 'balance_gbp', CASE WHEN v_pay.folio_id IS NULL THEN NULL ELSE folio_balance(v_pay.folio_id) END);
END $$;

-- Void a charge by posting an equal and opposite reversal.
CREATE OR REPLACE FUNCTION void_folio_line(p_line_id UUID, p_reason TEXT, p_actor TEXT DEFAULT 'manager')
RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE v_l folio_lines%ROWTYPE; v_f folios%ROWTYPE; v_rev folio_lines%ROWTYPE;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN RAISE EXCEPTION 'REASON_REQUIRED: a void needs a reason' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_l FROM folio_lines WHERE id = p_line_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'LINE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_l.type IN ('payment', 'refund', 'reversal') THEN RAISE EXCEPTION 'INVALID_VOID: use a refund for payments' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM folio_lines WHERE reversal_of = p_line_id) THEN RAISE EXCEPTION 'ALREADY_VOIDED' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_f FROM folios WHERE id = v_l.folio_id FOR UPDATE;
  IF v_f.status <> 'open' THEN RAISE EXCEPTION 'FOLIO_CLOSED: folio is %', v_f.status USING ERRCODE = 'P0001'; END IF;
  INSERT INTO folio_lines (folio_id, business_date, posted_by, type, description, quantity, unit_amount_gbp, credit_gbp, reversal_of, void_reason)
  VALUES (v_l.folio_id, property_business_date(v_f.property_id), p_actor, 'reversal', format('Void: %s', v_l.description), 1, v_l.debit_gbp, v_l.debit_gbp, p_line_id, p_reason) RETURNING * INTO v_rev;
  -- Reverse the VAT line that was posted with this charge, if any.
  INSERT INTO folio_lines (folio_id, business_date, posted_by, type, description, quantity, unit_amount_gbp, credit_gbp, reversal_of, void_reason)
  SELECT folio_id, property_business_date(v_f.property_id), p_actor, 'reversal', format('Void: %s', description), 1, debit_gbp, debit_gbp, id, p_reason
    FROM folio_lines t WHERE t.type = 'tax' AND t.reference_id = p_line_id AND t.reference_type = 'charge'
     AND NOT EXISTS (SELECT 1 FROM folio_lines r WHERE r.reversal_of = t.id);
  RETURN jsonb_build_object('reversal', to_jsonb(v_rev), 'balance_gbp', folio_balance(v_l.folio_id));
END $$;

-- Issue an invoice from the folio: charges grouped by type, totals from the ledger, frozen by trigger.
CREATE OR REPLACE FUNCTION issue_folio_invoice(p_folio_id UUID, p_due_date DATE DEFAULT NULL, p_actor TEXT DEFAULT 'staff')
RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE v_f folios%ROWTYPE; v_items JSONB; v_sub NUMERIC; v_tax NUMERIC; v_total NUMERIC; v_paid NUMERIC; v_inv invoices%ROWTYPE; v_status TEXT;
BEGIN
  SELECT * INTO v_f FROM folios WHERE id = p_folio_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FOLIO_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_f.invoice_id IS NOT NULL THEN
    SELECT * INTO v_inv FROM invoices WHERE id = v_f.invoice_id;
    RETURN jsonb_build_object('invoice', to_jsonb(v_inv), 'already_issued', true);
  END IF;
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
  SELECT COALESCE(SUM(credit_gbp), 0) INTO v_paid FROM folio_lines WHERE folio_id = p_folio_id AND type = 'payment';
  v_paid := v_paid - COALESCE((SELECT SUM(debit_gbp) FROM folio_lines WHERE folio_id = p_folio_id AND type = 'refund'), 0);
  v_status := CASE WHEN v_paid >= v_total - 0.005 THEN 'paid' WHEN v_paid > 0 THEN 'partially_paid' ELSE 'sent' END;
  INSERT INTO invoices (property_id, booking_id, guest_id, invoice_number, status, subtotal_gbp, tax_amount_gbp, total_gbp, line_items, due_date, sent_at, paid_at, notes)
  VALUES (v_f.property_id, v_f.booking_id, v_f.guest_id, next_invoice_number(), v_status, ROUND(v_sub, 2), ROUND(v_tax, 2), v_total, v_items,
          COALESCE(p_due_date, property_business_date(v_f.property_id) + 14), NOW(), CASE WHEN v_status = 'paid' THEN NOW() END, format('Issued from folio by %s', p_actor))
  RETURNING * INTO v_inv;
  UPDATE folios SET invoice_id = v_inv.id, updated_at = NOW() WHERE id = p_folio_id;
  RETURN jsonb_build_object('invoice', to_jsonb(v_inv), 'already_issued', false);
END $$;

-- Revenue recognised by stay date (room-night proration), per day.
CREATE OR REPLACE FUNCTION revenue_by_stay_date(p_property_id UUID, p_from DATE, p_to DATE)
RETURNS TABLE (stay_date DATE, room_nights INT, room_revenue_gbp NUMERIC, rooms_available INT)
LANGUAGE sql STABLE AS $$
  WITH days AS (SELECT generate_series(p_from, p_to, '1 day')::date AS d),
  rooms AS (SELECT COUNT(*)::int AS n FROM apartments WHERE property_id = p_property_id AND status <> 'out_of_service')
  SELECT d.d,
         COUNT(b.id)::int,
         ROUND(COALESCE(SUM(b.rate_per_night_gbp * (1 - b.discount_percentage / 100.0)), 0), 2),
         (SELECT n FROM rooms)
    FROM days d
    LEFT JOIN bookings b ON b.property_id = p_property_id AND b.status IN ('confirmed','checked_in','checked_out')
         AND b.check_in <= d.d AND b.check_out > d.d
   GROUP BY d.d ORDER BY d.d;
$$;

-- ------------------------------------------------------------
-- Lifecycle functions now use the folio
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION checkin_booking(p_booking_id UUID, p_notes TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE v_b bookings%ROWTYPE; v_apt_status TEXT; v_today DATE; v_folio UUID;
BEGIN
  SELECT * INTO v_b FROM bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_b.status <> 'confirmed' THEN RAISE EXCEPTION 'INVALID_STATUS: booking is %, must be confirmed', v_b.status USING ERRCODE = 'P0001'; END IF;
  IF v_b.guest_id IS NULL THEN RAISE EXCEPTION 'NO_GUEST: attach a guest profile before check-in' USING ERRCODE = 'P0001'; END IF;
  v_today := property_business_date(v_b.property_id);
  IF v_b.check_in > v_today THEN RAISE EXCEPTION 'TOO_EARLY: arrival date is %, business date is %', v_b.check_in, v_today USING ERRCODE = 'P0001'; END IF;
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

CREATE OR REPLACE FUNCTION checkout_booking(
  p_booking_id UUID, p_notes TEXT DEFAULT NULL, p_allow_outstanding_balance BOOLEAN DEFAULT FALSE, p_points_per_gbp NUMERIC DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE v_b bookings%ROWTYPE; v_today DATE; v_folio UUID; v_outstanding NUMERIC := 0; v_points INT := 0; v_balance INT := 0; v_tier TEXT; v_task_id UUID; v_d DATE;
BEGIN
  SELECT * INTO v_b FROM bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_b.status <> 'checked_in' THEN RAISE EXCEPTION 'INVALID_STATUS: booking is %, must be checked_in', v_b.status USING ERRCODE = 'P0001'; END IF;
  v_today := property_business_date(v_b.property_id);
  v_folio := open_folio(v_b.id);

  -- Post any nights not yet charged. An early departure is charged for the
  -- nights stayed, and a stay that occupied the room is charged at least one night.
  v_d := v_b.check_in;
  WHILE v_d < GREATEST(LEAST(v_b.check_out, v_today), v_b.check_in + 1) LOOP
    PERFORM post_room_charges(v_b.property_id, v_d, 'checkout');
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
  INSERT INTO housekeeping_tasks (property_id, apartment_id, type, status, priority, scheduled_date)
  VALUES (v_b.property_id, v_b.apartment_id, 'checkout_clean', 'pending', 'high', v_today) RETURNING id INTO v_task_id;

  IF v_outstanding <= 0.005 THEN
    UPDATE folios SET status = 'closed', closed_at = NOW(), closed_by = 'checkout', updated_at = NOW() WHERE id = v_folio;
  END IF;

  IF v_b.guest_id IS NOT NULL THEN
    v_points := FLOOR(GREATEST(folio_balance(v_folio) * -1, 0) * 0 + v_b.total_amount_gbp * p_points_per_gbp)::INT;
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

-- Night audit posts room charges before taking the snapshot.
CREATE OR REPLACE FUNCTION run_night_audit(p_property_id UUID, p_business_date DATE DEFAULT NULL, p_actor TEXT DEFAULT 'system')
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_date DATE; v_existing daily_closes%ROWTYPE; v_close daily_closes%ROWTYPE;
  v_arr_exp INT; v_arr_in INT; v_noshow INT; v_dep_exp INT; v_dep_out INT; v_overstay INT;
  v_occ INT; v_total INT; v_room_rev NUMERIC; v_payments NUMERIC; v_posted INT;
BEGIN
  v_date := COALESCE(p_business_date, property_business_date(p_property_id) - 1);
  SELECT * INTO v_existing FROM daily_closes WHERE property_id = p_property_id AND business_date = v_date;
  IF FOUND THEN RETURN jsonb_build_object('already_closed', true, 'close', to_jsonb(v_existing)); END IF;
  PERFORM 1 FROM properties WHERE id = p_property_id FOR UPDATE;

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
   WHERE COALESCE(i.property_id, f.property_id) = p_property_id AND p.status IN ('completed','partially_refunded','refunded')
     AND (p.received_at AT TIME ZONE COALESCE((SELECT timezone FROM properties WHERE id = p_property_id), 'UTC'))::date = v_date;

  INSERT INTO daily_closes (property_id, business_date, closed_by, arrivals_expected, arrivals_checked_in, no_shows_marked, departures_expected,
      departures_checked_out, still_in_house_past_checkout, rooms_occupied, rooms_total, occupancy_percent, room_revenue_gbp, payments_received_gbp, notes)
  VALUES (p_property_id, v_date, p_actor, v_arr_exp, v_arr_in, v_noshow, v_dep_exp, v_dep_out, v_overstay, v_occ, v_total,
      CASE WHEN v_total > 0 THEN ROUND(v_occ::numeric / v_total * 100, 2) ELSE 0 END, ROUND(v_room_rev, 2), ROUND(v_payments, 2),
      jsonb_build_object('room_charges_posted', v_posted))
  RETURNING * INTO v_close;
  UPDATE properties SET last_business_date = v_date WHERE id = p_property_id;
  RETURN jsonb_build_object('already_closed', false, 'close', to_jsonb(v_close));
END;
$$;

-- ------------------------------------------------------------
-- Payments may belong to a folio: RLS from 00019 only knew invoices.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS payments_front_desk_select ON payments;
DROP POLICY IF EXISTS payments_front_desk_insert ON payments;
DROP POLICY IF EXISTS payments_management_update ON payments;
CREATE POLICY payments_front_desk_select ON payments FOR SELECT TO authenticated
  USING (role_at_least(50) AND (
    invoice_id IN (SELECT id FROM invoices WHERE can_access_property(property_id))
    OR folio_id IN (SELECT id FROM folios WHERE can_access_property(property_id))));
CREATE POLICY payments_front_desk_insert ON payments FOR INSERT TO authenticated
  WITH CHECK (role_at_least(50) AND (
    invoice_id IN (SELECT id FROM invoices WHERE can_access_property(property_id))
    OR folio_id IN (SELECT id FROM folios WHERE can_access_property(property_id))));
CREATE POLICY payments_management_update ON payments FOR UPDATE TO authenticated
  USING (role_at_least(70) AND (
    invoice_id IN (SELECT id FROM invoices WHERE can_access_property(property_id))
    OR folio_id IN (SELECT id FROM folios WHERE can_access_property(property_id))))
  WITH CHECK (role_at_least(70));

-- Post the nights stayed so far for one booking (used before check-out so a
-- refused departure still shows the balance owed). Idempotent.
CREATE OR REPLACE FUNCTION post_booking_room_charges(p_booking_id UUID)
RETURNS INT
LANGUAGE plpgsql AS $$
DECLARE v_b bookings%ROWTYPE; v_today DATE; v_d DATE; v_n INT := 0;
BEGIN
  SELECT * INTO v_b FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_b.status <> 'checked_in' THEN RETURN 0; END IF;
  v_today := property_business_date(v_b.property_id);
  PERFORM open_folio(v_b.id);
  v_d := v_b.check_in;
  WHILE v_d < GREATEST(LEAST(v_b.check_out, v_today), v_b.check_in + 1) LOOP
    v_n := v_n + post_room_charges(v_b.property_id, v_d, 'checkout');
    v_d := v_d + 1;
  END LOOP;
  RETURN v_n;
END $$;
