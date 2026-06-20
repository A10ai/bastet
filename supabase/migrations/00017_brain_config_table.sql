-- Migration 00017: Brain config table (replaces in-memory state)
-- Stores the AI Brain configuration in the database so it persists
-- across serverless function invocations and Edge Box restarts.

CREATE TABLE IF NOT EXISTS brain_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  mode TEXT NOT NULL DEFAULT 'supervised' CHECK (mode IN ('supervised', 'autonomous')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  cycle_interval_minutes INTEGER NOT NULL DEFAULT 30,
  last_cycle TIMESTAMPTZ,
  total_cycles INTEGER NOT NULL DEFAULT 0,
  total_decisions INTEGER NOT NULL DEFAULT 0,
  total_executed INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert default row (enforce singleton)
INSERT INTO brain_config (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- RLS: only authenticated users can read/write
ALTER TABLE brain_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read brain config" ON brain_config
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Only admin/owner can update brain config" ON brain_config
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM staff
      WHERE staff.auth_user_id = auth.uid()
      AND staff.role IN ('owner', 'admin')
    )
  );