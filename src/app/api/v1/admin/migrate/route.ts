import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/api-auth";

/**
 * Migration status checker.
 * Returns whether required tables exist and SQL to create missing ones.
 *
 * GET /api/v1/admin/migrate
 */
export async function GET(request: NextRequest) {
  // Require owner/admin role — this endpoint exposes DB schema details
  const auth = await requireRole(request, ["owner", "admin"]);
  if (!auth.authenticated) return auth.error!;

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { error } = await supabase.from("workflows").select("id").limit(1);
    const tableExists = !error || error.code !== "PGRST205";

    if (tableExists) {
      return NextResponse.json({ workflows_table: "exists" });
    }

    return NextResponse.json({
      workflows_table: "missing",
      message: "Run this SQL in Supabase Dashboard > SQL Editor",
      dashboard_url: "https://supabase.com/dashboard/project/nhvrnwkytfpgvwtkocce/sql/new",
      sql: `-- HospitAI Workflow Engine table (migration 00015)
CREATE TABLE IF NOT EXISTS workflows (
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
CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflows_source ON workflows(source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflows_priority ON workflows(priority);
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on workflows" ON workflows FOR ALL USING (true) WITH CHECK (true);`,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}