-- 00031: Chart of accounts for the accounting export
--
-- Every folio line maps to a general-ledger account by a stable key
-- (room_revenue, vat_output, cash ...). Properties can rename codes to match
-- their own accounting package; the keys never change. The export
-- (/api/v1/finance/export) builds a balanced double-entry journal from
-- folio_lines using this mapping.

CREATE TABLE IF NOT EXISTS gl_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  key varchar(40) NOT NULL,
  code varchar(20) NOT NULL,
  name varchar(100) NOT NULL,
  kind varchar(20) NOT NULL CHECK (kind IN ('asset', 'liability', 'revenue', 'expense', 'equity')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, key)
);
DROP TRIGGER IF EXISTS gl_accounts_updated_at ON gl_accounts;
CREATE TRIGGER gl_accounts_updated_at BEFORE UPDATE ON gl_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE gl_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gl_accounts_select ON gl_accounts;
DROP POLICY IF EXISTS gl_accounts_manage ON gl_accounts;
CREATE POLICY gl_accounts_select ON gl_accounts FOR SELECT TO authenticated USING (can_access_property(property_id));
CREATE POLICY gl_accounts_manage ON gl_accounts FOR ALL TO authenticated
  USING (role_at_least(70) AND can_access_property(property_id)) WITH CHECK (role_at_least(70) AND can_access_property(property_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON gl_accounts TO authenticated;
GRANT ALL ON gl_accounts TO service_role;

-- Default chart (UK-style numbering). Idempotent per property.
CREATE OR REPLACE FUNCTION ensure_default_gl_accounts(p_property_id uuid) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE v_n integer;
BEGIN
  INSERT INTO gl_accounts (property_id, key, code, name, kind) VALUES
    (p_property_id, 'guest_ledger',   '1200', 'Guest ledger (debtors)',        'asset'),
    (p_property_id, 'cash',           '1000', 'Cash',                          'asset'),
    (p_property_id, 'card_clearing',  '1010', 'Card clearing',                 'asset'),
    (p_property_id, 'bank',           '1020', 'Bank',                          'asset'),
    (p_property_id, 'other_receipts', '1030', 'Other receipts',                'asset'),
    (p_property_id, 'vat_output',     '2200', 'VAT output tax',                'liability'),
    (p_property_id, 'tourism_levy',   '2210', 'Tourism levy payable',          'liability'),
    (p_property_id, 'room_revenue',   '4000', 'Room revenue',                  'revenue'),
    (p_property_id, 'fnb_revenue',    '4100', 'Food and beverage revenue',     'revenue'),
    (p_property_id, 'extras_revenue', '4200', 'Other guest revenue',           'revenue'),
    (p_property_id, 'adjustments',    '4900', 'Adjustments and allowances',    'revenue')
  ON CONFLICT (property_id, key) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;
GRANT EXECUTE ON FUNCTION ensure_default_gl_accounts(uuid) TO authenticated, service_role;
SELECT ensure_default_gl_accounts(id) FROM properties;
