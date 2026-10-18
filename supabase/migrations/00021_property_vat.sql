-- ============================================================
-- Migration 00021: Property VAT rate (audit Oct 2026)
-- Invoices default to the property's VAT percent when the request
-- does not supply tax_rate. Egyptian properties default to 14%.
-- ============================================================
ALTER TABLE properties ADD COLUMN IF NOT EXISTS vat_rate_percent DECIMAL(5,2) NOT NULL DEFAULT 0
  CHECK (vat_rate_percent >= 0 AND vat_rate_percent <= 100);

UPDATE properties SET vat_rate_percent = 14.00 WHERE country = 'EG' AND vat_rate_percent = 0;
UPDATE properties SET vat_rate_percent = 20.00 WHERE country = 'GB' AND vat_rate_percent = 0;

COMMENT ON COLUMN properties.vat_rate_percent IS 'Default VAT/sales tax percent applied to invoices when none is specified';
