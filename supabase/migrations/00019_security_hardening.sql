-- ============================================================
-- Migration 00019: Security hardening (audit Oct 2026)
--   1. audit_log table (was referenced by code but never created)
--   2. readonly role allowed on staff
--   3. guests gain property_id so they can be tenant-scoped
--   4. Role-aware helper functions
--   5. Replace every USING (true) policy on PII / money tables
--   6. Enable RLS on system_events, brain_decisions, notifications, workflows
--
-- Apply with the Supabase SQL editor or `supabase db push`. Idempotent.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Audit log
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,              -- auth.users.id or 'system'
  user_email TEXT NOT NULL,
  action VARCHAR(100) NOT NULL,
  category VARCHAR(30) NOT NULL,
  resource_type VARCHAR(50),
  resource_id TEXT,
  description TEXT NOT NULL,
  old_data JSONB,
  new_data JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_category ON audit_log (category);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log (resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log (user_id);

-- ------------------------------------------------------------
-- 2. Allow the readonly role the application already defines
-- ------------------------------------------------------------
ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_role_check;
ALTER TABLE staff ADD CONSTRAINT staff_role_check
  CHECK (role IN ('owner', 'admin', 'manager', 'receptionist', 'housekeeping', 'maintenance', 'readonly'));

-- ------------------------------------------------------------
-- 3. Tenant key on guests
-- ------------------------------------------------------------
ALTER TABLE guests ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES properties(id);

UPDATE guests g
SET property_id = (
  SELECT b.property_id FROM bookings b
  WHERE b.guest_id = g.id
  ORDER BY b.created_at
  LIMIT 1
)
WHERE g.property_id IS NULL;

-- Guests with no booking yet belong to the first (currently only) property.
UPDATE guests
SET property_id = (SELECT id FROM properties ORDER BY created_at LIMIT 1)
WHERE property_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_guests_property_id ON guests (property_id);

-- ------------------------------------------------------------
-- 4. Role helpers (SECURITY DEFINER so they can read staff under RLS)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION staff_role_level()
RETURNS INT AS $$
  SELECT CASE role
    WHEN 'owner' THEN 100
    WHEN 'admin' THEN 90
    WHEN 'manager' THEN 70
    WHEN 'receptionist' THEN 50
    WHEN 'housekeeping' THEN 30
    WHEN 'maintenance' THEN 30
    WHEN 'readonly' THEN 10
    ELSE 0 END
  FROM staff
  WHERE auth_user_id = auth.uid() AND is_active
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_staff_id()
RETURNS UUID AS $$
  SELECT id FROM staff WHERE auth_user_id = auth.uid() AND is_active LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- True when the caller belongs to the property, or is admin/owner
-- (admin/owner may manage every property of the group).
CREATE OR REPLACE FUNCTION can_access_property(p_property_id UUID)
RETURNS BOOLEAN AS $$
  SELECT p_property_id = get_staff_property_id()
      OR COALESCE(staff_role_level(), 0) >= 90;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION role_at_least(p_level INT)
RETURNS BOOLEAN AS $$
  SELECT COALESCE(staff_role_level(), 0) >= p_level;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ------------------------------------------------------------
-- 5. Replace open policies on PII and money tables
-- ------------------------------------------------------------

-- guests: front desk and above, tenant scoped; guests may read their own row
DROP POLICY IF EXISTS staff_manage_guests ON guests;
DROP POLICY IF EXISTS guests_front_desk_select ON guests;
DROP POLICY IF EXISTS guests_front_desk_insert ON guests;
DROP POLICY IF EXISTS guests_front_desk_update ON guests;
DROP POLICY IF EXISTS guests_admin_delete ON guests;
DROP POLICY IF EXISTS guests_read_own ON guests;
CREATE POLICY guests_front_desk_select ON guests FOR SELECT TO authenticated
  USING (role_at_least(50) AND can_access_property(property_id));
CREATE POLICY guests_front_desk_insert ON guests FOR INSERT TO authenticated
  WITH CHECK (role_at_least(50) AND can_access_property(property_id));
CREATE POLICY guests_front_desk_update ON guests FOR UPDATE TO authenticated
  USING (role_at_least(50) AND can_access_property(property_id))
  WITH CHECK (role_at_least(50) AND can_access_property(property_id));
CREATE POLICY guests_admin_delete ON guests FOR DELETE TO authenticated
  USING (role_at_least(90));
CREATE POLICY guests_read_own ON guests FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

-- Tables keyed by guest_id: scope through the guest's property
DROP POLICY IF EXISTS staff_manage_guest_prefs ON guest_preferences;
DROP POLICY IF EXISTS guest_prefs_front_desk ON guest_preferences;
CREATE POLICY guest_prefs_front_desk ON guest_preferences FOR ALL TO authenticated
  USING (role_at_least(50) AND guest_id IN (SELECT id FROM guests WHERE can_access_property(property_id)))
  WITH CHECK (role_at_least(50) AND guest_id IN (SELECT id FROM guests WHERE can_access_property(property_id)));

DROP POLICY IF EXISTS staff_manage_guest_comms ON guest_communications;
DROP POLICY IF EXISTS guest_comms_front_desk ON guest_communications;
CREATE POLICY guest_comms_front_desk ON guest_communications FOR ALL TO authenticated
  USING (role_at_least(50) AND guest_id IN (SELECT id FROM guests WHERE can_access_property(property_id)))
  WITH CHECK (role_at_least(50) AND guest_id IN (SELECT id FROM guests WHERE can_access_property(property_id)));

DROP POLICY IF EXISTS staff_read_activity_log ON guest_activity_log;
DROP POLICY IF EXISTS guest_activity_front_desk ON guest_activity_log;
CREATE POLICY guest_activity_front_desk ON guest_activity_log FOR ALL TO authenticated
  USING (role_at_least(50) AND guest_id IN (SELECT id FROM guests WHERE can_access_property(property_id)))
  WITH CHECK (role_at_least(30) AND guest_id IN (SELECT id FROM guests WHERE can_access_property(property_id)));

DROP POLICY IF EXISTS staff_read_loyalty ON loyalty_programme;
DROP POLICY IF EXISTS loyalty_front_desk ON loyalty_programme;
CREATE POLICY loyalty_front_desk ON loyalty_programme FOR ALL TO authenticated
  USING (role_at_least(50) AND guest_id IN (SELECT id FROM guests WHERE can_access_property(property_id)))
  WITH CHECK (role_at_least(50) AND guest_id IN (SELECT id FROM guests WHERE can_access_property(property_id)));

DROP POLICY IF EXISTS staff_manage_reviews ON reviews;
DROP POLICY IF EXISTS reviews_staff_select ON reviews;
DROP POLICY IF EXISTS reviews_front_desk_write ON reviews;
CREATE POLICY reviews_staff_select ON reviews FOR SELECT TO authenticated
  USING (role_at_least(10) AND guest_id IN (SELECT id FROM guests WHERE can_access_property(property_id)));
CREATE POLICY reviews_front_desk_write ON reviews FOR ALL TO authenticated
  USING (role_at_least(50) AND guest_id IN (SELECT id FROM guests WHERE can_access_property(property_id)))
  WITH CHECK (role_at_least(50) AND guest_id IN (SELECT id FROM guests WHERE can_access_property(property_id)));

DROP POLICY IF EXISTS staff_read_predictions ON guest_predictions;
DROP POLICY IF EXISTS predictions_management ON guest_predictions;
CREATE POLICY predictions_management ON guest_predictions FOR ALL TO authenticated
  USING (role_at_least(70) AND guest_id IN (SELECT id FROM guests WHERE can_access_property(property_id)))
  WITH CHECK (role_at_least(70));

DROP POLICY IF EXISTS staff_read_ai_feedback ON ai_learning_feedback;
DROP POLICY IF EXISTS ai_feedback_management ON ai_learning_feedback;
CREATE POLICY ai_feedback_management ON ai_learning_feedback FOR ALL TO authenticated
  USING (role_at_least(70)) WITH CHECK (role_at_least(70));

-- payments: scoped through the invoice's property
DROP POLICY IF EXISTS staff_manage_payments ON payments;
DROP POLICY IF EXISTS payments_front_desk_select ON payments;
DROP POLICY IF EXISTS payments_front_desk_insert ON payments;
DROP POLICY IF EXISTS payments_management_update ON payments;
CREATE POLICY payments_front_desk_select ON payments FOR SELECT TO authenticated
  USING (role_at_least(50) AND invoice_id IN (SELECT id FROM invoices WHERE can_access_property(property_id)));
CREATE POLICY payments_front_desk_insert ON payments FOR INSERT TO authenticated
  WITH CHECK (role_at_least(50) AND invoice_id IN (SELECT id FROM invoices WHERE can_access_property(property_id)));
CREATE POLICY payments_management_update ON payments FOR UPDATE TO authenticated
  USING (role_at_least(70) AND invoice_id IN (SELECT id FROM invoices WHERE can_access_property(property_id)))
  WITH CHECK (role_at_least(70));
-- No DELETE policy: payments are reversed with a refund row, never deleted.

-- availability, booking_addons, apartment_images: scoped through apartment / booking
DROP POLICY IF EXISTS staff_manage_availability ON availability;
DROP POLICY IF EXISTS availability_scoped ON availability;
CREATE POLICY availability_scoped ON availability FOR ALL TO authenticated
  USING (apartment_id IN (SELECT id FROM apartments WHERE can_access_property(property_id)))
  WITH CHECK (role_at_least(70) AND apartment_id IN (SELECT id FROM apartments WHERE can_access_property(property_id)));

DROP POLICY IF EXISTS staff_manage_booking_addons ON booking_addons;
DROP POLICY IF EXISTS booking_addons_scoped ON booking_addons;
CREATE POLICY booking_addons_scoped ON booking_addons FOR ALL TO authenticated
  USING (booking_id IN (SELECT id FROM bookings WHERE can_access_property(property_id)))
  WITH CHECK (role_at_least(50) AND booking_id IN (SELECT id FROM bookings WHERE can_access_property(property_id)));

DROP POLICY IF EXISTS staff_manage_apartment_images ON apartment_images;
DROP POLICY IF EXISTS apartment_images_scoped ON apartment_images;
CREATE POLICY apartment_images_scoped ON apartment_images FOR ALL TO authenticated
  USING (apartment_id IS NULL OR apartment_id IN (SELECT id FROM apartments WHERE can_access_property(property_id)))
  WITH CHECK (role_at_least(70));

DROP POLICY IF EXISTS staff_manage_facility_bookings ON facility_bookings;
DROP POLICY IF EXISTS facility_bookings_scoped ON facility_bookings;
CREATE POLICY facility_bookings_scoped ON facility_bookings FOR ALL TO authenticated
  USING (facility_id IN (SELECT id FROM facilities WHERE can_access_property(property_id)))
  WITH CHECK (role_at_least(50) AND facility_id IN (SELECT id FROM facilities WHERE can_access_property(property_id)));

-- Marketplace tables have no tenant key yet: apply role floors
DROP POLICY IF EXISTS staff_manage_certs ON partner_certifications;
DROP POLICY IF EXISTS certs_role_floor ON partner_certifications;
CREATE POLICY certs_role_floor ON partner_certifications FOR ALL TO authenticated
  USING (role_at_least(10)) WITH CHECK (role_at_least(70));

DROP POLICY IF EXISTS staff_manage_excursion_bookings ON excursion_bookings;
DROP POLICY IF EXISTS excursion_bookings_role_floor ON excursion_bookings;
CREATE POLICY excursion_bookings_role_floor ON excursion_bookings FOR ALL TO authenticated
  USING (role_at_least(50)) WITH CHECK (role_at_least(50));

DROP POLICY IF EXISTS staff_manage_shuttle_schedules ON shuttle_schedules;
DROP POLICY IF EXISTS shuttle_schedules_role_floor ON shuttle_schedules;
CREATE POLICY shuttle_schedules_role_floor ON shuttle_schedules FOR ALL TO authenticated
  USING (role_at_least(10)) WITH CHECK (role_at_least(70));

DROP POLICY IF EXISTS staff_manage_shuttle_bookings ON shuttle_bookings;
DROP POLICY IF EXISTS shuttle_bookings_role_floor ON shuttle_bookings;
CREATE POLICY shuttle_bookings_role_floor ON shuttle_bookings FOR ALL TO authenticated
  USING (role_at_least(50)) WITH CHECK (role_at_least(50));

-- ------------------------------------------------------------
-- 6. Tables that had no RLS at all
-- ------------------------------------------------------------
ALTER TABLE system_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS system_events_management_select ON system_events;
DROP POLICY IF EXISTS system_events_staff_write ON system_events;
CREATE POLICY system_events_management_select ON system_events FOR SELECT TO authenticated
  USING (role_at_least(70));
CREATE POLICY system_events_staff_write ON system_events FOR ALL TO authenticated
  USING (role_at_least(30)) WITH CHECK (role_at_least(30));

ALTER TABLE brain_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brain_decisions_management_select ON brain_decisions;
DROP POLICY IF EXISTS brain_decisions_admin_write ON brain_decisions;
CREATE POLICY brain_decisions_management_select ON brain_decisions FOR SELECT TO authenticated
  USING (role_at_least(70));
CREATE POLICY brain_decisions_admin_write ON brain_decisions FOR ALL TO authenticated
  USING (role_at_least(70)) WITH CHECK (role_at_least(70));

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_own_select ON notifications;
DROP POLICY IF EXISTS notifications_own_update ON notifications;
DROP POLICY IF EXISTS notifications_staff_insert ON notifications;
CREATE POLICY notifications_own_select ON notifications FOR SELECT TO authenticated
  USING (staff_id = get_staff_id() OR (staff_id IS NULL AND role_at_least(50)));
CREATE POLICY notifications_own_update ON notifications FOR UPDATE TO authenticated
  USING (staff_id = get_staff_id()) WITH CHECK (staff_id = get_staff_id());
CREATE POLICY notifications_staff_insert ON notifications FOR INSERT TO authenticated
  WITH CHECK (role_at_least(30));

ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workflows_staff_select ON workflows;
DROP POLICY IF EXISTS workflows_management_write ON workflows;
CREATE POLICY workflows_staff_select ON workflows FOR SELECT TO authenticated
  USING (property_id IS NULL OR can_access_property(property_id));
CREATE POLICY workflows_management_write ON workflows FOR ALL TO authenticated
  USING (role_at_least(70) AND (property_id IS NULL OR can_access_property(property_id)))
  WITH CHECK (role_at_least(70));

-- audit_log: append-only; admins read
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_log_insert ON audit_log;
DROP POLICY IF EXISTS audit_log_admin_select ON audit_log;
CREATE POLICY audit_log_insert ON audit_log FOR INSERT TO authenticated
  WITH CHECK (role_at_least(10));
CREATE POLICY audit_log_admin_select ON audit_log FOR SELECT TO authenticated
  USING (role_at_least(90));
-- No UPDATE / DELETE policies: the audit trail is immutable from the app.
