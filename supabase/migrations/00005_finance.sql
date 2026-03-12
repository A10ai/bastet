-- ============================================================
-- Migration 00005: Finance Module (5 tables)
-- Tables: invoices, payments, expenses, currency_rates,
--         financial_reports
-- ============================================================

-- 1. invoices
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id),
  booking_id UUID REFERENCES bookings(id),
  guest_id UUID REFERENCES guests(id),
  invoice_number VARCHAR(20) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'paid', 'partially_paid', 'overdue', 'cancelled', 'refunded')),
  subtotal_gbp DECIMAL(12,2) NOT NULL,
  tax_amount_gbp DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount_amount_gbp DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_gbp DECIMAL(12,2) NOT NULL,
  total_guest_currency DECIMAL(12,2),
  guest_currency VARCHAR(3) DEFAULT 'GBP',
  fx_rate_used DECIMAL(12,6),
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  due_date DATE NOT NULL,
  sent_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. payments
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  amount_gbp DECIMAL(12,2) NOT NULL,
  amount_original DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'GBP',
  fx_rate DECIMAL(12,6),
  method VARCHAR(20) NOT NULL
    CHECK (method IN ('stripe', 'card', 'cash', 'bank_transfer', 'cheque', 'crypto', 'other')),
  stripe_payment_id VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed', 'refunded', 'partially_refunded')),
  reference VARCHAR(100),
  received_by UUID REFERENCES staff(id),
  received_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. expenses
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id),
  category VARCHAR(30) NOT NULL
    CHECK (category IN ('staff', 'utilities', 'maintenance', 'supplies', 'marketing', 'insurance', 'tax', 'commission', 'technology', 'other')),
  description VARCHAR(200) NOT NULL,
  amount_egp DECIMAL(12,2) NOT NULL,
  amount_gbp DECIMAL(12,2),
  fx_rate DECIMAL(12,6),
  vendor VARCHAR(100),
  invoice_reference VARCHAR(50),
  receipt_url TEXT,
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  recurring_frequency VARCHAR(20),
  is_r_and_d BOOLEAN NOT NULL DEFAULT false,
  approved_by UUID REFERENCES staff(id),
  expense_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER expenses_updated_at
  BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. currency_rates
CREATE TABLE currency_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency VARCHAR(3) NOT NULL DEFAULT 'GBP',
  target_currency VARCHAR(3) NOT NULL,
  rate DECIMAL(12,6) NOT NULL,
  source VARCHAR(30) NOT NULL DEFAULT 'open_exchange_rates',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(base_currency, target_currency, fetched_at)
);

-- 5. financial_reports
CREATE TABLE financial_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id),
  report_type VARCHAR(30) NOT NULL
    CHECK (report_type IN ('daily', 'weekly', 'monthly', 'quarterly', 'annual', 'custom')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  revenue_gbp DECIMAL(12,2),
  expenses_gbp DECIMAL(12,2),
  net_profit_gbp DECIMAL(12,2),
  occupancy_rate DECIMAL(5,2),
  adr_gbp DECIMAL(10,2),
  revpaa_gbp DECIMAL(10,2),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by UUID REFERENCES staff(id)
);
