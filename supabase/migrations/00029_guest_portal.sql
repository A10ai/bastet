-- 00029: Guest portal
--
-- A guest reaches their stay through a link that carries a random token.
-- Only the SHA-256 hash of the token is stored; the link expires a week after
-- check-out and can be revoked by staff. The portal shows the stay, the
-- booking terms and the folio, and takes the pre-arrival check-in form.
--
-- Objects:
--   1. booking_access_tokens (hash, expiry, revocation, usage), RLS for staff
--   2. bookings.precheckin (jsonb) + bookings.precheckin_completed_at

CREATE TABLE IF NOT EXISTS booking_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  purpose varchar(20) NOT NULL DEFAULT 'portal' CHECK (purpose IN ('portal')),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_by uuid REFERENCES staff(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  use_count integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_booking_access_tokens_booking ON booking_access_tokens (booking_id) WHERE revoked_at IS NULL;

ALTER TABLE booking_access_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS booking_access_tokens_select ON booking_access_tokens;
DROP POLICY IF EXISTS booking_access_tokens_write ON booking_access_tokens;
-- Staff see and manage links for their property; the public never reads this
-- table directly (the portal routes resolve the hash with the service role).
CREATE POLICY booking_access_tokens_select ON booking_access_tokens FOR SELECT TO authenticated
  USING (role_at_least(50) AND can_access_property(property_id));
CREATE POLICY booking_access_tokens_write ON booking_access_tokens FOR ALL TO authenticated
  USING (role_at_least(50) AND can_access_property(property_id))
  WITH CHECK (role_at_least(50) AND can_access_property(property_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON booking_access_tokens TO authenticated;
GRANT ALL ON booking_access_tokens TO service_role;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS precheckin jsonb;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS precheckin_completed_at timestamptz;
