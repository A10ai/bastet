-- Notifications system for HospitAI PMS
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES staff(id),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info', -- info, success, warning, error, ai_decision
  category TEXT, -- booking, housekeeping, maintenance, energy, guest, pricing, brain, system
  link TEXT, -- optional URL to navigate to
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_staff ON notifications(staff_id, read, created_at DESC);
