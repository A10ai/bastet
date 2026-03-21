-- Workflow Engine: turns AI recommendations into executable multi-step actions
-- with human approval checkpoints.

CREATE TABLE workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID,
  title TEXT NOT NULL,
  description TEXT,
  source TEXT NOT NULL CHECK (source IN ('ai_brain', 'automation', 'manual', 'event', 'anomaly')),
  source_id TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'awaiting_approval', 'approved', 'completed', 'failed', 'cancelled')),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  steps JSONB DEFAULT '[]',
  current_step INT DEFAULT 0,
  total_steps INT DEFAULT 0,
  created_by TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  outcome JSONB,
  outcome_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workflows_status ON workflows(status, created_at DESC);
CREATE INDEX idx_workflows_source ON workflows(source, created_at DESC);
CREATE INDEX idx_workflows_priority ON workflows(priority);
