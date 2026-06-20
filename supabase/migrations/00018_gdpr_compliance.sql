-- Migration 00018: GDPR audit trail for data access and erasure requests
-- Tracks all GDPR-related actions: data exports, erasure requests, consent changes

CREATE TABLE IF NOT EXISTS gdpr_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id UUID REFERENCES guests(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id),
  request_type TEXT NOT NULL CHECK (request_type IN ('export', 'erasure', 'rectification', 'consent_change')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'rejected', 'expired')),
  requested_by UUID, -- auth.uid() of the requester
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ, -- erasure requests have 30 days to complete
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- RLS: staff can see GDPR requests for their property's guests
ALTER TABLE gdpr_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view GDPR requests" ON gdpr_requests
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM staff
      WHERE staff.auth_user_id = auth.uid()
    )
  );
CREATE POLICY "Admin/owner can create GDPR requests" ON gdpr_requests
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM staff
      WHERE staff.auth_user_id = auth.uid()
      AND staff.role IN ('owner', 'admin', 'manager')
    )
  );
CREATE POLICY "Admin/owner can update GDPR requests" ON gdpr_requests
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM staff
      WHERE staff.auth_user_id = auth.uid()
      AND staff.role IN ('owner', 'admin')
    )
  );

CREATE INDEX idx_gdpr_guest ON gdpr_requests(guest_id);
CREATE INDEX idx_gdpr_status ON gdpr_requests(status);
CREATE INDEX idx_gdpr_type ON gdpr_requests(request_type);

-- Guest consent tracking table
CREATE TABLE IF NOT EXISTS guest_consent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL CHECK (consent_type IN ('marketing', 'analytics', 'profiling', 'third_party_sharing')),
  granted BOOLEAN NOT NULL DEFAULT false,
  granted_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ,
  method TEXT DEFAULT 'explicit' CHECK (method IN ('explicit', 'implicit', 'opt_out')),
  ip_address INET,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(guest_id, consent_type)
);

ALTER TABLE guest_consent ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view guest consent" ON guest_consent
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM staff WHERE staff.auth_user_id = auth.uid()
    )
  );
CREATE POLICY "Staff can manage guest consent" ON guest_consent
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM staff
      WHERE staff.auth_user_id = auth.uid()
      AND staff.role IN ('owner', 'admin', 'manager', 'receptionist')
    )
  );