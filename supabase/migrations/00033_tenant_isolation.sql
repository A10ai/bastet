-- ============================================================
-- Migration 00033: Tenant isolation and role floors (deep test, Oct 2026)
--
-- Database-level findings from the October 2026 deep test, all reproduced
-- against a fresh database built from 00001-00032:
--   * deactivated staff kept full access (helpers ignored staff.is_active)
--   * an admin could add themselves to any property (staff_properties) and
--     delete another property's guests
--   * bookings, invoices, expenses, apartments, rates ... had no role floor:
--     housekeeping and readonly accounts could rewrite money and stays
--   * policies with no tenant key (notifications, system_events, audit_log,
--     gdpr_requests, guest_consent, workflows, apartment_images, marketplace
--     and shuttle tables, daily_closes) leaked across properties
--   * booking_channels.api_connection readable by every signed-in user
--   (workflows created by the service role without a property stayed
--   visible to every property until the app passed one; see 00036)
--   * SECURITY DEFINER helpers had no search_path; TRUNCATE granted to app roles
--
-- This file and 00034 are the authoritative definitions of every policy and
-- function they touch. Both are idempotent: re-running them restores the
-- intended state. Re-running an OLDER migration (00016, 00019, 00020, 00024,
-- 00025, 00026) after these silently reinstates superseded definitions;
-- if that ever happens, re-run 00033 and 00034 afterwards.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Caller helpers
-- ------------------------------------------------------------

-- Trusted callers: the service role (server-side admin client) and direct
-- database sessions (SQL editor, migrations, pg_cron). PostgREST requests
-- always run as anon or authenticated; SECURITY DEFINER changes current_user
-- but not the role setting, so this is reliable inside definer functions.
CREATE OR REPLACE FUNCTION is_trusted_caller()
RETURNS BOOLEAN
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE current_setting('role', true)
    WHEN 'service_role' THEN true
    WHEN 'authenticated' THEN false
    WHEN 'anon' THEN false
    WHEN 'none' THEN session_user::text NOT IN ('authenticator', 'anon', 'authenticated')
    ELSE true
  END;
$$;

-- Active staff only, everywhere.
CREATE OR REPLACE FUNCTION get_staff_property_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT property_id FROM staff WHERE auth_user_id = auth.uid() AND is_active LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION get_staff_role()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT role FROM staff WHERE auth_user_id = auth.uid() AND is_active LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION get_staff_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id FROM staff WHERE auth_user_id = auth.uid() AND is_active LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION staff_role_level()
RETURNS INT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;

-- Level of any staff member (for "cannot grant above your own role").
CREATE OR REPLACE FUNCTION staff_level_of(p_staff_id UUID)
RETURNS INT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE role
    WHEN 'owner' THEN 100 WHEN 'admin' THEN 90 WHEN 'manager' THEN 70 WHEN 'receptionist' THEN 50
    WHEN 'housekeeping' THEN 30 WHEN 'maintenance' THEN 30 WHEN 'readonly' THEN 10 ELSE 0 END
  FROM staff WHERE id = p_staff_id;
$$;

CREATE OR REPLACE FUNCTION role_at_least(p_level INT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(staff_role_level(), 0) >= p_level;
$$;

-- Home property or an explicit membership, active staff only.
CREATE OR REPLACE FUNCTION can_access_property(p_property_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- Strictly true/false: callers negate it (require_staff), so NULL must not leak.
  SELECT p_property_id IS NOT NULL AND (
    COALESCE(p_property_id = get_staff_property_id(), false)
    OR EXISTS (
      SELECT 1 FROM staff_properties sp
      JOIN staff s ON s.id = sp.staff_id
      WHERE s.auth_user_id = auth.uid() AND s.is_active AND sp.property_id = p_property_id
    ));
$$;

-- Guard used at the top of ledger functions (00034). Trusted callers pass;
-- staff must reach the property (otherwise the entity is reported as not
-- found, as RLS would) and hold the role level.
CREATE OR REPLACE FUNCTION require_staff(p_property_id UUID, p_level INT, p_not_found TEXT)
RETURNS VOID
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF is_trusted_caller() THEN RETURN; END IF;
  IF p_property_id IS NULL OR NOT COALESCE(can_access_property(p_property_id), false) THEN
    RAISE EXCEPTION '%', p_not_found USING ERRCODE = 'P0002';
  END IF;
  IF NOT COALESCE(role_at_least(p_level), false) THEN
    RAISE EXCEPTION 'ROLE_FORBIDDEN: your role cannot perform this action' USING ERRCODE = '42501';
  END IF;
END $$;

-- Every remaining SECURITY DEFINER function gets a fixed search_path so a
-- temporary table named like a public one cannot redirect it.
ALTER FUNCTION is_guest() SET search_path = public, pg_temp;
ALTER FUNCTION next_booking_reference() SET search_path = public, pg_temp;
ALTER FUNCTION next_invoice_number() SET search_path = public, pg_temp;

-- Text that names a UUID, or NULL (used to read property ids out of jsonb).
CREATE OR REPLACE FUNCTION try_uuid(p TEXT)
RETURNS UUID
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN p::uuid END;
$$;

-- ------------------------------------------------------------
-- 2. Standard property-keyed tables: tenant scope plus role floors
--    matching the API role groups (src/lib/api-auth.ts):
--      10 ALL_STAFF  30 OPERATIONS  50 FRONT_DESK  70 MANAGEMENT  90 ADMIN
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.drop_policies(p_table TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = p_table LOOP
    EXECUTE format('DROP POLICY %I ON %I', r.policyname, p_table);
  END LOOP;
END $$;

-- SELECT at p_read, every write at p_write (NULL: no direct writes).
CREATE OR REPLACE FUNCTION pg_temp.tenant_table(p_table TEXT, p_key TEXT, p_read INT, p_write INT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.drop_policies(p_table);
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (role_at_least(%s) AND can_access_property(%I))',
                 p_table || '_tenant_select', p_table, p_read, p_key);
  IF p_write IS NOT NULL THEN
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING (role_at_least(%s) AND can_access_property(%I)) WITH CHECK (role_at_least(%s) AND can_access_property(%I))',
                   p_table || '_tenant_write', p_table, p_write, p_key, p_write, p_key);
  END IF;
END $$;

SELECT pg_temp.tenant_table('properties',          'id',          10, NULL);
SELECT pg_temp.tenant_table('staff',               'property_id', 10, NULL);  -- written by the service role only
SELECT pg_temp.tenant_table('buildings',           'property_id', 10, 70);
SELECT pg_temp.tenant_table('apartment_types',     'property_id', 10, 70);
SELECT pg_temp.tenant_table('rates',               'property_id', 10, 70);
SELECT pg_temp.tenant_table('bookings',            'property_id', 10, 50);
SELECT pg_temp.tenant_table('invoices',            'property_id', 10, 50);
SELECT pg_temp.tenant_table('expenses',            'property_id', 10, 70);
SELECT pg_temp.tenant_table('financial_reports',   'property_id', 10, 70);
SELECT pg_temp.tenant_table('housekeeping_tasks',  'property_id', 10, 30);
SELECT pg_temp.tenant_table('maintenance_requests','property_id', 10, 30);
SELECT pg_temp.tenant_table('inventory',           'property_id', 10, 70);
SELECT pg_temp.tenant_table('facilities',          'property_id', 10, 70);
SELECT pg_temp.tenant_table('partners',            'property_id', 10, 70);
SELECT pg_temp.tenant_table('excursions',          'property_id', 10, 70);
SELECT pg_temp.tenant_table('beach_partnerships',  'property_id', 10, 70);
SELECT pg_temp.tenant_table('promotions',          'property_id', 10, 70);
SELECT pg_temp.tenant_table('flash_deals',         'property_id', 10, 70);
SELECT pg_temp.tenant_table('shuttle_routes',      'property_id', 10, 70);
SELECT pg_temp.tenant_table('analytics_events',    'property_id', 10, NULL);
SELECT pg_temp.tenant_table('demand_forecasts',    'property_id', 10, NULL);
SELECT pg_temp.tenant_table('pricing_decisions',   'property_id', 10, NULL);
SELECT pg_temp.tenant_table('booking_access_tokens','property_id', 50, 50);
SELECT pg_temp.tenant_table('department_budgets',  'property_id', 70, 70);

-- Invoices: issued invoices are removed only by cancelling (trigger below);
-- deleting a draft is a management action.
DROP POLICY IF EXISTS invoices_tenant_write ON invoices;
CREATE POLICY invoices_tenant_insert ON invoices FOR INSERT TO authenticated
  WITH CHECK (role_at_least(50) AND can_access_property(property_id));
CREATE POLICY invoices_tenant_update ON invoices FOR UPDATE TO authenticated
  USING (role_at_least(50) AND can_access_property(property_id))
  WITH CHECK (role_at_least(50) AND can_access_property(property_id));
CREATE POLICY invoices_tenant_delete ON invoices FOR DELETE TO authenticated
  USING (role_at_least(70) AND can_access_property(property_id));

-- Apartments: housekeeping and maintenance flip the status (clean, under
-- repair); everything else about a unit is a management change.
SELECT pg_temp.tenant_table('apartments', 'property_id', 10, NULL);
CREATE POLICY apartments_tenant_insert ON apartments FOR INSERT TO authenticated
  WITH CHECK (role_at_least(70) AND can_access_property(property_id));
CREATE POLICY apartments_tenant_update ON apartments FOR UPDATE TO authenticated
  USING (role_at_least(30) AND can_access_property(property_id))
  WITH CHECK (role_at_least(30) AND can_access_property(property_id));
CREATE POLICY apartments_tenant_delete ON apartments FOR DELETE TO authenticated
  USING (role_at_least(70) AND can_access_property(property_id));

CREATE OR REPLACE FUNCTION apartments_status_only_below_management()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF is_trusted_caller() OR role_at_least(70) THEN RETURN NEW; END IF;
  IF (to_jsonb(NEW) - 'status' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'updated_at') THEN
    RAISE EXCEPTION 'ROLE_FORBIDDEN: only managers can change apartment details' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_apartments_status_only ON apartments;
CREATE TRIGGER trg_apartments_status_only BEFORE UPDATE ON apartments
  FOR EACH ROW EXECUTE FUNCTION apartments_status_only_below_management();

-- ------------------------------------------------------------
-- 3. Tables scoped through a parent row
-- ------------------------------------------------------------
-- Writes need the floor in USING too, otherwise DELETE (which only checks
-- USING) is open to every role that can read.

SELECT pg_temp.drop_policies('staff_schedules');
CREATE POLICY staff_schedules_select ON staff_schedules FOR SELECT TO authenticated
  USING (role_at_least(10) AND staff_id IN (SELECT id FROM staff WHERE can_access_property(property_id)));
CREATE POLICY staff_schedules_write ON staff_schedules FOR ALL TO authenticated
  USING (role_at_least(70) AND staff_id IN (SELECT id FROM staff WHERE can_access_property(property_id)))
  WITH CHECK (role_at_least(70) AND staff_id IN (SELECT id FROM staff WHERE can_access_property(property_id)));

SELECT pg_temp.drop_policies('apartment_images');
CREATE POLICY apartment_images_select ON apartment_images FOR SELECT TO authenticated
  USING (role_at_least(10) AND (
    apartment_id IN (SELECT id FROM apartments WHERE can_access_property(property_id))
    OR (apartment_id IS NULL AND apartment_type_id IN (SELECT id FROM apartment_types WHERE can_access_property(property_id)))));
CREATE POLICY apartment_images_write ON apartment_images FOR ALL TO authenticated
  USING (role_at_least(70) AND (
    apartment_id IN (SELECT id FROM apartments WHERE can_access_property(property_id))
    OR (apartment_id IS NULL AND apartment_type_id IN (SELECT id FROM apartment_types WHERE can_access_property(property_id)))))
  WITH CHECK (role_at_least(70)
    AND (apartment_id IS NULL OR apartment_id IN (SELECT id FROM apartments WHERE can_access_property(property_id)))
    AND (apartment_type_id IS NULL OR apartment_type_id IN (SELECT id FROM apartment_types WHERE can_access_property(property_id))));

SELECT pg_temp.drop_policies('availability');
CREATE POLICY availability_select ON availability FOR SELECT TO authenticated
  USING (role_at_least(10) AND apartment_id IN (SELECT id FROM apartments WHERE can_access_property(property_id)));
CREATE POLICY availability_write ON availability FOR ALL TO authenticated
  USING (role_at_least(70) AND apartment_id IN (SELECT id FROM apartments WHERE can_access_property(property_id)))
  WITH CHECK (role_at_least(70) AND apartment_id IN (SELECT id FROM apartments WHERE can_access_property(property_id)));

SELECT pg_temp.drop_policies('booking_addons');
CREATE POLICY booking_addons_select ON booking_addons FOR SELECT TO authenticated
  USING (role_at_least(10) AND booking_id IN (SELECT id FROM bookings WHERE can_access_property(property_id)));
CREATE POLICY booking_addons_write ON booking_addons FOR ALL TO authenticated
  USING (role_at_least(50) AND booking_id IN (SELECT id FROM bookings WHERE can_access_property(property_id)))
  WITH CHECK (role_at_least(50) AND booking_id IN (SELECT id FROM bookings WHERE can_access_property(property_id)));

SELECT pg_temp.drop_policies('facility_bookings');
CREATE POLICY facility_bookings_select ON facility_bookings FOR SELECT TO authenticated
  USING (role_at_least(10) AND facility_id IN (SELECT id FROM facilities WHERE can_access_property(property_id)));
CREATE POLICY facility_bookings_write ON facility_bookings FOR ALL TO authenticated
  USING (role_at_least(50) AND facility_id IN (SELECT id FROM facilities WHERE can_access_property(property_id)))
  WITH CHECK (role_at_least(50) AND facility_id IN (SELECT id FROM facilities WHERE can_access_property(property_id)));

SELECT pg_temp.drop_policies('partner_certifications');
CREATE POLICY partner_certifications_select ON partner_certifications FOR SELECT TO authenticated
  USING (role_at_least(10) AND partner_id IN (SELECT id FROM partners WHERE can_access_property(property_id)));
CREATE POLICY partner_certifications_write ON partner_certifications FOR ALL TO authenticated
  USING (role_at_least(70) AND partner_id IN (SELECT id FROM partners WHERE can_access_property(property_id)))
  WITH CHECK (role_at_least(70) AND partner_id IN (SELECT id FROM partners WHERE can_access_property(property_id)));

SELECT pg_temp.drop_policies('shuttle_schedules');
CREATE POLICY shuttle_schedules_select ON shuttle_schedules FOR SELECT TO authenticated
  USING (role_at_least(10) AND route_id IN (SELECT id FROM shuttle_routes WHERE can_access_property(property_id)));
CREATE POLICY shuttle_schedules_write ON shuttle_schedules FOR ALL TO authenticated
  USING (role_at_least(70) AND route_id IN (SELECT id FROM shuttle_routes WHERE can_access_property(property_id)))
  WITH CHECK (role_at_least(70) AND route_id IN (SELECT id FROM shuttle_routes WHERE can_access_property(property_id)));

SELECT pg_temp.drop_policies('excursion_bookings');
CREATE POLICY excursion_bookings_scoped ON excursion_bookings FOR ALL TO authenticated
  USING (role_at_least(50) AND excursion_id IN (SELECT id FROM excursions WHERE can_access_property(property_id)))
  WITH CHECK (role_at_least(50) AND excursion_id IN (SELECT id FROM excursions WHERE can_access_property(property_id))
              AND guest_id IN (SELECT id FROM guests WHERE can_access_property(property_id)));

SELECT pg_temp.drop_policies('shuttle_bookings');
CREATE POLICY shuttle_bookings_scoped ON shuttle_bookings FOR ALL TO authenticated
  USING (role_at_least(50) AND guest_id IN (SELECT id FROM guests WHERE can_access_property(property_id)))
  WITH CHECK (role_at_least(50) AND guest_id IN (SELECT id FROM guests WHERE can_access_property(property_id))
              AND schedule_id IN (SELECT s.id FROM shuttle_schedules s JOIN shuttle_routes r ON r.id = s.route_id WHERE can_access_property(r.property_id)));

SELECT pg_temp.drop_policies('guest_predictions');
CREATE POLICY guest_predictions_scoped ON guest_predictions FOR ALL TO authenticated
  USING (role_at_least(70) AND guest_id IN (SELECT id FROM guests WHERE can_access_property(property_id)))
  WITH CHECK (role_at_least(70) AND guest_id IN (SELECT id FROM guests WHERE can_access_property(property_id)));

-- Guests: an admin deletes only their own property's guests.
DROP POLICY IF EXISTS guests_admin_delete ON guests;
CREATE POLICY guests_admin_delete ON guests FOR DELETE TO authenticated
  USING (role_at_least(90) AND can_access_property(property_id));

-- GDPR requests and consent: through the guest's property.
SELECT pg_temp.drop_policies('gdpr_requests');
CREATE POLICY gdpr_requests_select ON gdpr_requests FOR SELECT TO authenticated
  USING (role_at_least(70) AND (
    guest_id IN (SELECT id FROM guests WHERE can_access_property(property_id)) OR requested_by = auth.uid()));
CREATE POLICY gdpr_requests_insert ON gdpr_requests FOR INSERT TO authenticated
  WITH CHECK (role_at_least(70) AND (
    guest_id IS NULL OR guest_id IN (SELECT id FROM guests WHERE can_access_property(property_id))));
CREATE POLICY gdpr_requests_update ON gdpr_requests FOR UPDATE TO authenticated
  USING (role_at_least(90) AND (
    guest_id IN (SELECT id FROM guests WHERE can_access_property(property_id)) OR requested_by = auth.uid()))
  WITH CHECK (role_at_least(90) AND (
    guest_id IS NULL OR guest_id IN (SELECT id FROM guests WHERE can_access_property(property_id))));

SELECT pg_temp.drop_policies('guest_consent');
CREATE POLICY guest_consent_scoped ON guest_consent FOR ALL TO authenticated
  USING (role_at_least(50) AND guest_id IN (SELECT id FROM guests WHERE can_access_property(property_id)))
  WITH CHECK (role_at_least(50) AND guest_id IN (SELECT id FROM guests WHERE can_access_property(property_id)));

-- ------------------------------------------------------------
-- 4. Property membership: admins manage other staff's memberships, only
--    for properties they already reach and only for staff at or below
--    their own level. Nobody grants themselves a property.
-- ------------------------------------------------------------
SELECT pg_temp.drop_policies('staff_properties');
CREATE POLICY staff_properties_select ON staff_properties FOR SELECT TO authenticated
  USING (staff_id = get_staff_id() OR (role_at_least(90) AND can_access_property(property_id)));
CREATE POLICY staff_properties_admin_write ON staff_properties FOR ALL TO authenticated
  USING (role_at_least(90) AND can_access_property(property_id) AND staff_id <> get_staff_id())
  WITH CHECK (
    role_at_least(90)
    AND can_access_property(property_id)
    AND staff_id <> get_staff_id()
    AND staff_id IN (SELECT id FROM staff WHERE can_access_property(property_id))
    AND COALESCE(staff_level_of(staff_id), 0) <= COALESCE(staff_role_level(), 0));

-- ------------------------------------------------------------
-- 5. Tables without a tenant key get one
-- ------------------------------------------------------------

-- notifications.property_id: from the recipient, else the sender.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES properties(id) ON DELETE CASCADE;
UPDATE notifications n SET property_id = s.property_id FROM staff s WHERE n.staff_id = s.id AND n.property_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_property ON notifications (property_id, created_at DESC);

CREATE OR REPLACE FUNCTION notifications_fill_property()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.staff_id IS NOT NULL THEN
    -- The recipient decides the tenant; a caller cannot relabel it.
    NEW.property_id := (SELECT property_id FROM staff WHERE id = NEW.staff_id);
  ELSIF NEW.property_id IS NULL THEN
    NEW.property_id := get_staff_property_id();
  END IF;
  RETURN NEW;
END $$;
-- SECURITY DEFINER so the recipient's property is read even if the caller
-- cannot see that staff row (the insert is then refused by the policy).
ALTER FUNCTION notifications_fill_property() SECURITY DEFINER;
DROP TRIGGER IF EXISTS trg_notifications_fill_property ON notifications;
CREATE TRIGGER trg_notifications_fill_property BEFORE INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION notifications_fill_property();

SELECT pg_temp.drop_policies('notifications');
CREATE POLICY notifications_own_select ON notifications FOR SELECT TO authenticated
  USING (staff_id = get_staff_id()
         OR (staff_id IS NULL AND role_at_least(50) AND can_access_property(property_id)));
CREATE POLICY notifications_own_update ON notifications FOR UPDATE TO authenticated
  USING (staff_id = get_staff_id()) WITH CHECK (staff_id = get_staff_id());
CREATE POLICY notifications_staff_insert ON notifications FOR INSERT TO authenticated
  WITH CHECK (role_at_least(30) AND can_access_property(property_id));

-- system_events: property and creator.
ALTER TABLE system_events ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE system_events ADD COLUMN IF NOT EXISTS created_by UUID;
UPDATE system_events SET property_id = try_uuid(payload->>'property_id')
 WHERE property_id IS NULL AND try_uuid(payload->>'property_id') IN (SELECT id FROM properties);
CREATE INDEX IF NOT EXISTS idx_system_events_property ON system_events (property_id, created_at DESC);

CREATE OR REPLACE FUNCTION system_events_fill_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE v_prop UUID;
BEGIN
  IF NEW.property_id IS NULL THEN
    v_prop := try_uuid(NEW.payload->>'property_id');
    IF v_prop IS NOT NULL AND EXISTS (SELECT 1 FROM properties WHERE id = v_prop) THEN
      NEW.property_id := v_prop;
    ELSE
      NEW.property_id := get_staff_property_id();
    END IF;
  END IF;
  IF NOT is_trusted_caller() THEN NEW.created_by := auth.uid(); END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION system_events_fill_owner() SECURITY DEFINER;
DROP TRIGGER IF EXISTS trg_system_events_fill_owner ON system_events;
CREATE TRIGGER trg_system_events_fill_owner BEFORE INSERT ON system_events
  FOR EACH ROW EXECUTE FUNCTION system_events_fill_owner();

SELECT pg_temp.drop_policies('system_events');
-- The emitter sees its own event (the event bus reads back the id and
-- records results); management sees its properties; events with no
-- property (system-wide) are for owners only.
CREATE POLICY system_events_select ON system_events FOR SELECT TO authenticated
  USING (created_by = auth.uid()
         OR (role_at_least(70) AND can_access_property(property_id))
         OR (property_id IS NULL AND role_at_least(100)));
CREATE POLICY system_events_insert ON system_events FOR INSERT TO authenticated
  WITH CHECK (role_at_least(30) AND created_by = auth.uid()
              AND (property_id IS NULL OR can_access_property(property_id)));
CREATE POLICY system_events_update ON system_events FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR (role_at_least(70) AND can_access_property(property_id)))
  WITH CHECK (role_at_least(30) AND (property_id IS NULL OR can_access_property(property_id)));

-- audit_log: tenant key, honest authorship.
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES properties(id) ON DELETE SET NULL;
UPDATE audit_log a SET property_id = try_uuid(a.metadata->>'property_id')
 WHERE a.property_id IS NULL AND try_uuid(a.metadata->>'property_id') IN (SELECT id FROM properties);
UPDATE audit_log a SET property_id = s.property_id FROM staff s
 WHERE a.property_id IS NULL AND try_uuid(a.user_id) = s.auth_user_id;
CREATE INDEX IF NOT EXISTS idx_audit_log_property ON audit_log (property_id, created_at DESC);

CREATE OR REPLACE FUNCTION audit_log_fill_property()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE v_prop UUID;
BEGIN
  IF NEW.property_id IS NULL THEN
    v_prop := try_uuid(NEW.metadata->>'property_id');
    IF v_prop IS NOT NULL AND EXISTS (SELECT 1 FROM properties WHERE id = v_prop) THEN
      NEW.property_id := v_prop;
    ELSE
      NEW.property_id := get_staff_property_id();
    END IF;
  END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION audit_log_fill_property() SECURITY DEFINER;
DROP TRIGGER IF EXISTS trg_audit_log_fill_property ON audit_log;
CREATE TRIGGER trg_audit_log_fill_property BEFORE INSERT ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_fill_property();

SELECT pg_temp.drop_policies('audit_log');
CREATE POLICY audit_log_insert ON audit_log FOR INSERT TO authenticated
  WITH CHECK (role_at_least(10) AND user_id = auth.uid()::text
              AND (property_id IS NULL OR can_access_property(property_id)));
CREATE POLICY audit_log_admin_select ON audit_log FOR SELECT TO authenticated
  USING (role_at_least(90) AND (can_access_property(property_id) OR (property_id IS NULL AND role_at_least(100))));

-- workflows: a workflow belongs to the property of whoever creates it.
CREATE OR REPLACE FUNCTION workflows_fill_property()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.property_id IS NULL AND NOT is_trusted_caller() THEN
    NEW.property_id := get_staff_property_id();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_workflows_fill_property ON workflows;
CREATE TRIGGER trg_workflows_fill_property BEFORE INSERT ON workflows
  FOR EACH ROW EXECUTE FUNCTION workflows_fill_property();

SELECT pg_temp.drop_policies('workflows');
CREATE POLICY workflows_staff_select ON workflows FOR SELECT TO authenticated
  USING (role_at_least(10) AND (property_id IS NULL OR can_access_property(property_id)));
CREATE POLICY workflows_management_write ON workflows FOR ALL TO authenticated
  USING (role_at_least(70) AND (property_id IS NULL OR can_access_property(property_id)))
  WITH CHECK (role_at_least(70) AND (property_id IS NULL OR can_access_property(property_id)));

-- brain_config is one row for the whole installation: owners change it.
SELECT pg_temp.drop_policies('brain_config');
CREATE POLICY brain_config_select ON brain_config FOR SELECT TO authenticated USING (role_at_least(10));
CREATE POLICY brain_config_owner_update ON brain_config FOR UPDATE TO authenticated
  USING (role_at_least(100)) WITH CHECK (role_at_least(100));

-- Global reference data: readable by staff, not by every signed-in account.
SELECT pg_temp.drop_policies('currency_rates');
CREATE POLICY currency_rates_staff_read ON currency_rates FOR SELECT TO authenticated USING (role_at_least(10));
SELECT pg_temp.drop_policies('guest_segments');
CREATE POLICY guest_segments_staff_read ON guest_segments FOR SELECT TO authenticated USING (role_at_least(10));

-- booking_channels: global list; the API credentials column is server-only.
DO $$
DECLARE v_cols TEXT;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'booking_channels' AND column_name <> 'api_connection';
  EXECUTE 'REVOKE ALL ON booking_channels FROM anon, authenticated';
  EXECUTE format('GRANT SELECT (%s) ON booking_channels TO authenticated', v_cols);
END $$;
SELECT pg_temp.drop_policies('booking_channels');
CREATE POLICY booking_channels_staff_read ON booking_channels FOR SELECT TO authenticated USING (role_at_least(10));

-- ------------------------------------------------------------
-- 6. Ledger tables: written only by the functions in 00034
-- ------------------------------------------------------------
SELECT pg_temp.drop_policies('folios');
CREATE POLICY folios_select ON folios FOR SELECT TO authenticated
  USING (role_at_least(30) AND can_access_property(property_id));

SELECT pg_temp.drop_policies('folio_lines');
CREATE POLICY folio_lines_select ON folio_lines FOR SELECT TO authenticated
  USING (role_at_least(50) AND folio_id IN (SELECT id FROM folios WHERE can_access_property(property_id)));

SELECT pg_temp.drop_policies('payments');
CREATE POLICY payments_select ON payments FOR SELECT TO authenticated
  USING (role_at_least(50) AND (
    invoice_id IN (SELECT id FROM invoices WHERE can_access_property(property_id))
    OR folio_id IN (SELECT id FROM folios WHERE can_access_property(property_id))));

SELECT pg_temp.drop_policies('refunds');
CREATE POLICY refunds_select ON refunds FOR SELECT TO authenticated
  USING (role_at_least(50) AND payment_id IN (
    SELECT p.id FROM payments p
      LEFT JOIN invoices i ON i.id = p.invoice_id
      LEFT JOIN folios f ON f.id = p.folio_id
     WHERE can_access_property(COALESCE(f.property_id, i.property_id))));

SELECT pg_temp.drop_policies('daily_closes');
CREATE POLICY daily_closes_management_select ON daily_closes FOR SELECT TO authenticated
  USING (role_at_least(70) AND can_access_property(property_id));

SELECT pg_temp.drop_policies('pos_tickets');
CREATE POLICY pos_tickets_select ON pos_tickets FOR SELECT TO authenticated
  USING (role_at_least(10) AND can_access_property(property_id));

REVOKE INSERT, UPDATE, DELETE ON folios, folio_lines, payments, refunds, daily_closes, pos_tickets FROM anon, authenticated;

-- Portal links: the property is the booking's; once revoked a link stays
-- revoked; expiry can only be shortened; usage counters are server-side.
CREATE OR REPLACE FUNCTION booking_access_tokens_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE v_b RECORD;
BEGIN
  SELECT property_id, check_out INTO v_b FROM bookings WHERE id = NEW.booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.property_id IS DISTINCT FROM v_b.property_id THEN
      RAISE EXCEPTION 'PROPERTY_FORBIDDEN: the link must belong to the booking''s property' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.expires_at > (v_b.check_out + 9)::timestamptz THEN
      RAISE EXCEPTION 'INVALID_INPUT: a portal link expires at most a week after check-out' USING ERRCODE = 'P0001';
    END IF;
    IF NOT is_trusted_caller() THEN NEW.use_count := 0; NEW.last_used_at := NULL; NEW.revoked_at := NULL; END IF;
    RETURN NEW;
  END IF;
  IF NEW.booking_id IS DISTINCT FROM OLD.booking_id OR NEW.property_id IS DISTINCT FROM OLD.property_id
     OR NEW.token_hash IS DISTINCT FROM OLD.token_hash OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.purpose IS DISTINCT FROM OLD.purpose
     OR NEW.expires_at > OLD.expires_at
     OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) THEN
    RAISE EXCEPTION 'INVALID_INPUT: a portal link can only be revoked or shortened' USING ERRCODE = 'P0001';
  END IF;
  IF NOT is_trusted_caller() AND (NEW.use_count IS DISTINCT FROM OLD.use_count OR NEW.last_used_at IS DISTINCT FROM OLD.last_used_at) THEN
    RAISE EXCEPTION 'INVALID_INPUT: usage counters are maintained by the portal' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION booking_access_tokens_guard() SECURITY DEFINER;
DROP TRIGGER IF EXISTS trg_booking_access_tokens_guard ON booking_access_tokens;
CREATE TRIGGER trg_booking_access_tokens_guard BEFORE INSERT OR UPDATE ON booking_access_tokens
  FOR EACH ROW EXECUTE FUNCTION booking_access_tokens_guard();

-- ------------------------------------------------------------
-- 7. Grants: no TRUNCATE / TRIGGER / REFERENCES for application roles
--    (TRUNCATE skips RLS and the ledger triggers). The service role keeps
--    TRUNCATE except on the ledger and audit tables.
-- ------------------------------------------------------------
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE TRUNCATE ON folio_lines, folios, payments, refunds, invoices, daily_closes, audit_log FROM service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon, authenticated;

-- ------------------------------------------------------------
-- 8. New properties get a default rate plan and chart of accounts
--    (00027 and 00031 only seeded properties that existed then).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION properties_seed_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO rate_plans (property_id, code, name, description, pricing_mode, cancellation_policy, free_cancellation_days, is_default)
  VALUES (NEW.id, 'BAR', 'Best Available Rate', 'Seasonal rate. Free cancellation until the day before arrival.', 'bar', 'flexible', 1, true)
  ON CONFLICT (property_id, code) DO NOTHING;
  PERFORM ensure_default_gl_accounts(NEW.id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_properties_seed_defaults ON properties;
CREATE TRIGGER trg_properties_seed_defaults AFTER INSERT ON properties
  FOR EACH ROW EXECUTE FUNCTION properties_seed_defaults();

INSERT INTO rate_plans (property_id, code, name, description, pricing_mode, cancellation_policy, free_cancellation_days, is_default)
SELECT p.id, 'BAR', 'Best Available Rate', 'Seasonal rate. Free cancellation until the day before arrival.', 'bar', 'flexible', 1,
       NOT EXISTS (SELECT 1 FROM rate_plans r WHERE r.property_id = p.id AND r.is_default)
  FROM properties p
 WHERE NOT EXISTS (SELECT 1 FROM rate_plans r WHERE r.property_id = p.id)
ON CONFLICT (property_id, code) DO NOTHING;
SELECT ensure_default_gl_accounts(id) FROM properties;

-- One default rate plan per property, also for multi-row updates (the
-- BEFORE trigger from 00027 failed with "tuple already modified").
CREATE OR REPLACE FUNCTION rate_plans_single_default()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Another row of the same statement may already have taken the default.
  IF (SELECT is_default FROM rate_plans WHERE id = NEW.id) THEN
    UPDATE rate_plans SET is_default = false
     WHERE property_id = NEW.property_id AND id <> NEW.id AND is_default;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS rate_plans_single_default ON rate_plans;
CREATE TRIGGER rate_plans_single_default AFTER INSERT OR UPDATE OF is_default ON rate_plans
  FOR EACH ROW WHEN (NEW.is_default) EXECUTE FUNCTION rate_plans_single_default();

-- ------------------------------------------------------------
-- 9. Sub-penny and zero amounts cannot be stored as completed payments
-- ------------------------------------------------------------
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_amount_positive;
ALTER TABLE payments ADD CONSTRAINT payments_amount_positive CHECK (amount_gbp > 0) NOT VALID;
