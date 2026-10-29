-- ============================================================
-- Migration 00040: Booking concierge — Sales module, slice 5
--
-- A guest-facing assistant on the website (and WhatsApp) that answers
-- questions in the guest's language, quotes real availability through the
-- booking engine and creates holds. Conversations are kept per session so a
-- guest can continue after a reload; stored text is scrubbed of contact
-- details (the guest record holds them, the chat log does not).
--
--   1. concierge_sessions  one per visitor (web token) or WhatsApp number
--   2. concierge_messages  the transcript, scrubbed, with tool calls
--   3. sales_settings      concierge switch and daily message cap
-- ============================================================

CREATE TABLE IF NOT EXISTS concierge_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  channel varchar(10) NOT NULL DEFAULT 'web' CHECK (channel IN ('web', 'whatsapp')),
  token_hash char(64) UNIQUE,
  external_hash char(64),
  external_ref_enc text,
  locale varchar(5) NOT NULL DEFAULT 'en',
  status varchar(10) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'handoff')),
  booking_id uuid REFERENCES bookings(id),
  message_count integer NOT NULL DEFAULT 0,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_concierge_sessions_external ON concierge_sessions (property_id, channel, external_hash) WHERE external_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_concierge_sessions_recent ON concierge_sessions (property_id, last_message_at DESC);
DROP TRIGGER IF EXISTS concierge_sessions_updated_at ON concierge_sessions;
CREATE TRIGGER concierge_sessions_updated_at BEFORE UPDATE ON concierge_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
COMMENT ON COLUMN concierge_sessions.external_ref_enc IS 'WhatsApp number, encrypted with PII_ENCRYPTION_KEY; external_hash is its SHA-256 for lookup';

CREATE TABLE IF NOT EXISTS concierge_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES concierge_sessions(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  role varchar(10) NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  tool_calls jsonb,
  model varchar(60),
  input_tokens integer,
  output_tokens integer,
  stop_reason varchar(20),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_concierge_messages_session ON concierge_messages (session_id, created_at);

ALTER TABLE sales_settings ADD COLUMN IF NOT EXISTS concierge_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE sales_settings ADD COLUMN IF NOT EXISTS concierge_daily_message_cap integer NOT NULL DEFAULT 2000 CHECK (concierge_daily_message_cap BETWEEN 0 AND 100000);
ALTER TABLE sales_settings ADD COLUMN IF NOT EXISTS concierge_handoff_email varchar(100);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['concierge_sessions', 'concierge_messages'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (role_at_least(50) AND can_access_property(property_id))', t || '_select', t);
    EXECUTE format('GRANT SELECT ON %I TO authenticated', t);
    EXECUTE format('GRANT ALL ON %I TO service_role', t);
    EXECUTE format('REVOKE ALL ON %I FROM anon', t);
  END LOOP;
END $$;
-- Staff may close or hand off a session, never rewrite the transcript.
CREATE POLICY concierge_sessions_update ON concierge_sessions FOR UPDATE TO authenticated
  USING (role_at_least(50) AND can_access_property(property_id)) WITH CHECK (role_at_least(50) AND can_access_property(property_id));
GRANT UPDATE (status) ON concierge_sessions TO authenticated;
-- The encrypted number is never readable by staff sessions.
REVOKE SELECT ON concierge_sessions FROM authenticated;
GRANT SELECT (id, property_id, channel, locale, status, booking_id, message_count, last_message_at, created_at, updated_at) ON concierge_sessions TO authenticated;
