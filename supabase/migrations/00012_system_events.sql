-- System Events table for the Event Bus cross-system intelligence layer
CREATE TABLE IF NOT EXISTS system_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  source_system TEXT NOT NULL,
  payload JSONB DEFAULT '{}',
  processed BOOLEAN DEFAULT false,
  results JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_events_type ON system_events(type);
CREATE INDEX idx_events_created ON system_events(created_at DESC);
CREATE INDEX idx_events_source ON system_events(source_system);
CREATE INDEX idx_events_processed ON system_events(processed);
