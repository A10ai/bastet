-- ============================================================
-- Migration 00023: Collision-safe booking references and invoice numbers
-- (found by the Oct 2026 deep test: the sequences start at 1 while rows
-- seeded or created before 00016 already hold BAS-HRG-26NNNN / INV-26NNNN,
-- so the first API booking after deploy failed with a duplicate key).
-- ============================================================

-- Move each sequence past the highest number already in use this year.
SELECT setval('booking_reference_seq', GREATEST(
  (SELECT COALESCE(MAX(substring(reference FROM '(\d{4})$')::INT), 0)
     FROM bookings WHERE reference ~ ('^BAS-HRG-' || to_char(NOW(), 'YY') || '\d{4}$')), 1), true);

SELECT setval('invoice_number_seq', GREATEST(
  (SELECT COALESCE(MAX(substring(invoice_number FROM '(\d{4})$')::INT), 0)
     FROM invoices WHERE invoice_number ~ ('^INV-(HRG-)?' || to_char(NOW(), 'YY') || '\d{4}$')), 1), true);

-- Skip over any value that is already taken instead of failing the insert.
CREATE OR REPLACE FUNCTION next_booking_reference()
RETURNS VARCHAR AS $$
DECLARE
  candidate VARCHAR;
  yy VARCHAR(2) := to_char(NOW(), 'YY');
BEGIN
  LOOP
    candidate := 'BAS-HRG-' || yy || lpad(nextval('booking_reference_seq')::TEXT, 4, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM bookings WHERE reference = candidate);
  END LOOP;
  RETURN candidate;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION next_invoice_number()
RETURNS VARCHAR AS $$
DECLARE
  candidate VARCHAR;
  yy VARCHAR(2) := to_char(NOW(), 'YY');
BEGIN
  LOOP
    candidate := 'INV-' || yy || lpad(nextval('invoice_number_seq')::TEXT, 4, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM invoices WHERE invoice_number = candidate);
  END LOOP;
  RETURN candidate;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
