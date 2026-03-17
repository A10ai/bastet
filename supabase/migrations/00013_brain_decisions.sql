-- Brain Decisions table for HospitAI Brain
CREATE TABLE brain_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id TEXT NOT NULL,
  category TEXT NOT NULL,
  action TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  confidence INT DEFAULT 0,
  impact_estimate TEXT,
  auto_executable BOOLEAN DEFAULT false,
  executed BOOLEAN DEFAULT false,
  approved BOOLEAN,
  mode TEXT DEFAULT 'supervised',
  event_type TEXT,
  event_payload JSONB DEFAULT '{}',
  data_snapshot JSONB DEFAULT '{}',
  summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_brain_decisions_cycle ON brain_decisions(cycle_id);
CREATE INDEX idx_brain_decisions_created ON brain_decisions(created_at DESC);
