-- ============================================================
-- 00035: owners can edit booking channels again; anon cannot burn
-- booking / invoice numbers
-- ============================================================
-- 00033 revoked every privilege on booking_channels from app roles and
-- granted SELECT on all columns except api_connection, so the owner-only
-- PUT /api/v1/booking-channels/:id answered 403 for everyone. Channels are
-- shared by every property, so only an owner may change them, and only the
-- editable columns: api_connection (credentials), id and code stay
-- server-only.
--
-- next_booking_reference() and next_invoice_number() advance shared
-- sequences; anon could call them and skip numbers. Staff and the service
-- role keep EXECUTE.
--
-- Idempotent: safe to re-run.
-- ============================================================

REVOKE UPDATE ON booking_channels FROM anon, authenticated;
GRANT UPDATE (name, commission_rate, is_active) ON booking_channels TO authenticated;

DROP POLICY IF EXISTS booking_channels_owner_update ON booking_channels;
CREATE POLICY booking_channels_owner_update ON booking_channels FOR UPDATE TO authenticated
  USING (role_at_least(100)) WITH CHECK (role_at_least(100));

REVOKE EXECUTE ON FUNCTION next_booking_reference() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION next_invoice_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION next_booking_reference() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION next_invoice_number() TO authenticated, service_role;
