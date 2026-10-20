-- ============================================================
-- Migration 00024: Encrypted identity documents + property membership
--   1. guests.passport_number widened to hold AES-GCM ciphertext
--      (format enc:v1:<iv>:<tag>:<data>, written by src/lib/pii-crypto.ts)
--   2. staff_properties: which properties an owner/admin may act on.
--      Cross-property access is membership-based, not role-based.
-- ============================================================

-- 1. Ciphertext is longer than the old VARCHAR(20)
ALTER TABLE guests ALTER COLUMN passport_number TYPE TEXT;
COMMENT ON COLUMN guests.passport_number IS 'Encrypted at the application layer (enc:v1:...). Plaintext only for rows created before 00024 until the admin backfill runs.';

-- 2. Property membership
CREATE TABLE IF NOT EXISTS staff_properties (
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (staff_id, property_id)
);

-- Every staff member is a member of their home property.
INSERT INTO staff_properties (staff_id, property_id)
SELECT id, property_id FROM staff WHERE property_id IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION staff_home_membership()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.property_id IS NOT NULL THEN
    INSERT INTO staff_properties (staff_id, property_id)
    VALUES (NEW.id, NEW.property_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_staff_home_membership ON staff;
CREATE TRIGGER trg_staff_home_membership
  AFTER INSERT OR UPDATE OF property_id ON staff
  FOR EACH ROW EXECUTE FUNCTION staff_home_membership();

-- Membership-aware access check (replaces the role-only shortcut from 00019).
CREATE OR REPLACE FUNCTION can_access_property(p_property_id UUID)
RETURNS BOOLEAN AS $$
  SELECT p_property_id = get_staff_property_id()
      OR EXISTS (
        SELECT 1 FROM staff_properties sp
        JOIN staff s ON s.id = sp.staff_id
        WHERE s.auth_user_id = auth.uid() AND s.is_active AND sp.property_id = p_property_id
      );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

ALTER TABLE staff_properties ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_properties_select ON staff_properties;
DROP POLICY IF EXISTS staff_properties_admin_write ON staff_properties;
CREATE POLICY staff_properties_select ON staff_properties FOR SELECT TO authenticated
  USING (staff_id = get_staff_id() OR role_at_least(90));
CREATE POLICY staff_properties_admin_write ON staff_properties FOR ALL TO authenticated
  USING (role_at_least(90)) WITH CHECK (role_at_least(90));

GRANT ALL ON staff_properties TO anon, authenticated, service_role;
