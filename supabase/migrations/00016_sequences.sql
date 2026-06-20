-- ============================================================
-- Migration 00016: Sequences for booking references and invoice numbers
-- Eliminates race conditions in getNextBookingReference and getNextInvoiceNumber
-- ============================================================

-- Booking reference sequence: BAS-HRG-YYNNNN
-- Format: BAS-HRG-260001, BAS-HRG-260002, etc.
CREATE SEQUENCE IF NOT EXISTS booking_reference_seq
  START 1
  INCREMENT 1
  NO CYCLE;

-- Invoice number sequence: INV-YYNNNN
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq
  START 1
  INCREMENT 1
  NO CYCLE;

-- Function to generate next booking reference
CREATE OR REPLACE FUNCTION next_booking_reference()
RETURNS VARCHAR AS $$
DECLARE
  next_val INT;
  year_suffix VARCHAR(2);
BEGIN
  next_val := nextval('booking_reference_seq');
  year_suffix := to_char(NOW(), 'YY');
  RETURN 'BAS-HRG-' || year_suffix || lpad(next_val::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to generate next invoice number
CREATE OR REPLACE FUNCTION next_invoice_number()
RETURNS VARCHAR AS $$
DECLARE
  next_val INT;
  year_suffix VARCHAR(2);
BEGIN
  next_val := nextval('invoice_number_seq');
  year_suffix := to_char(NOW(), 'YY');
  RETURN 'INV-' || year_suffix || lpad(next_val::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION next_booking_reference() TO authenticated;
GRANT EXECUTE ON FUNCTION next_invoice_number() TO authenticated;