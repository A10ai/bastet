/**
 * HospitAI Audit Trail
 *
 * Logs every AI decision, human action, and system event.
 * Every action is traceable — who, what, when, why.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

export interface AuditEntry {
  user_id?: string;
  user_email?: string;
  action: string;
  category:
    | "ai_decision"
    | "ai_brain"
    | "automation"
    | "booking"
    | "guest"
    | "housekeeping"
    | "maintenance"
    | "finance"
    | "energy"
    | "settings"
    | "auth"
    | "system";
  resource_type?: string;
  resource_id?: string;
  description: string;
  old_data?: Record<string, unknown>;
  new_data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Log an action to the audit trail.
 */
export async function logAudit(
  supabase: SupabaseClient,
  entry: AuditEntry
): Promise<void> {
  try {
    await supabase.from("audit_log").insert({
      user_id: entry.user_id || "system",
      user_email: entry.user_email || "system@hospitai.uk",
      action: entry.action,
      category: entry.category,
      resource_type: entry.resource_type,
      resource_id: entry.resource_id,
      description: entry.description,
      old_data: entry.old_data || null,
      new_data: entry.new_data || null,
      metadata: entry.metadata || {},
    });
  } catch {
    // Non-critical — don't break the main operation
    logger.error({ action: entry.action }, "[Audit] Failed to log");
  }
}

/**
 * Log multiple actions to the audit trail in a single insert.
 */
export async function logAuditBatch(
  supabase: SupabaseClient,
  entries: AuditEntry[]
): Promise<void> {
  if (entries.length === 0) return;
  try {
    const rows = entries.map((entry) => ({
      user_id: entry.user_id || "system",
      user_email: entry.user_email || "system@hospitai.uk",
      action: entry.action,
      category: entry.category,
      resource_type: entry.resource_type,
      resource_id: entry.resource_id,
      description: entry.description,
      old_data: entry.old_data || null,
      new_data: entry.new_data || null,
      metadata: entry.metadata || {},
    }));
    await supabase.from("audit_log").insert(rows);
  } catch {
    logger.error({ entries: entries.length }, "[Audit] Failed to batch log");
  }
}

/**
 * Get audit log entries with filters.
 */
export async function getAuditLog(
  supabase: SupabaseClient,
  options?: {
    category?: string;
    user_id?: string;
    resource_type?: string;
    resource_id?: string;
    limit?: number;
    offset?: number;
  }
): Promise<{ entries: unknown[]; total: number }> {
  const limit = options?.limit || 50;
  const offset = options?.offset || 0;

  let query = supabase
    .from("audit_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (options?.category) query = query.eq("category", options.category);
  if (options?.user_id) query = query.eq("user_id", options.user_id);
  if (options?.resource_type) query = query.eq("resource_type", options.resource_type);
  if (options?.resource_id) query = query.eq("resource_id", options.resource_id);

  const { data, count, error } = await query;

  if (error) return { entries: [], total: 0 };
  return { entries: data || [], total: count || 0 };
}

/**
 * Get audit stats summary.
 */
export async function getAuditStats(
  supabase: SupabaseClient
): Promise<{
  total_entries: number;
  today_entries: number;
  by_category: Record<string, number>;
  by_user: { user_email: string; count: number }[];
  recent_ai_decisions: number;
}> {
  const today = new Date().toISOString().split("T")[0];

  const [totalRes, todayRes, categoryRes] = await Promise.all([
    supabase.from("audit_log").select("id", { count: "exact", head: true }),
    supabase
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .gte("created_at", today),
    supabase.from("audit_log").select("category"),
  ]);

  const byCategory: Record<string, number> = {};
  (categoryRes.data || []).forEach((row: { category: string }) => {
    byCategory[row.category] = (byCategory[row.category] || 0) + 1;
  });

  const aiDecisions = (byCategory["ai_decision"] || 0) + (byCategory["ai_brain"] || 0);

  return {
    total_entries: totalRes.count || 0,
    today_entries: todayRes.count || 0,
    by_category: byCategory,
    by_user: [],
    recent_ai_decisions: aiDecisions,
  };
}
