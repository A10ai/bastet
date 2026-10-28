/**
 * HospitAI Audit Trail
 *
 * Logs every AI decision, human action, and system event.
 * Every action is traceable — who, what, when, why.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyAccessToken } from "@/lib/jwt-verify";
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
const SENSITIVE_KEYS = /password|passport|secret|token|card_number|cvv/i;

/**
 * Strip secrets and identity-document numbers from audit payloads so the
 * audit trail never becomes a second copy of them.
 */
export function redactAuditData(
  data?: Record<string, unknown>
): Record<string, unknown> | null {
  if (!data) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    out[key] = SENSITIVE_KEYS.test(key) ? "[REDACTED]" : value;
  }
  return out;
}

/**
 * Resolve the acting user. With a request-scoped client the row must carry
 * the signed-in user's own id: the audit_log insert policy (00033) requires
 * user_id = auth.uid(), so an entry naming someone else (or "system") would
 * be rejected, and the trail must not be forgeable anyway. Only a client with
 * no user session (service role: cron, background jobs) may name the actor
 * itself or fall back to "system".
 */
async function sessionUser(supabase: SupabaseClient): Promise<{ user_id: string; user_email: string } | null> {
  try {
    // Prefer the locally verified token (no auth-server round trip per write).
    const session = (await supabase.auth.getSession?.())?.data?.session;
    if (session?.access_token) {
      const verified = await verifyAccessToken(session.access_token);
      if (verified.ok) return { user_id: verified.claims.sub, user_email: verified.claims.email || "unknown" };
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) return { user_id: user.id, user_email: user.email || "unknown" };
  } catch {
    // service-role client or no session
  }
  return null;
}

function actorFor(
  session: { user_id: string; user_email: string } | null,
  entry: AuditEntry
): { user_id: string; user_email: string } {
  if (session) {
    if (entry.user_id && entry.user_id !== session.user_id) {
      logger.warn({ action: entry.action }, "[Audit] Entry named another user; recorded as the signed-in user");
    }
    return { user_id: session.user_id, user_email: entry.user_email || session.user_email };
  }
  if (entry.user_id) return { user_id: entry.user_id, user_email: entry.user_email || "unknown" };
  return { user_id: "system", user_email: "system@hospitai.uk" };
}

/**
 * Log an action to the audit trail.
 */
export async function logAudit(
  supabase: SupabaseClient,
  entry: AuditEntry
): Promise<void> {
  try {
    const actor = actorFor(await sessionUser(supabase), entry);
    const { error } = await supabase.from("audit_log").insert({
      ...actor,
      action: entry.action,
      category: entry.category,
      resource_type: entry.resource_type,
      resource_id: entry.resource_id,
      description: entry.description,
      old_data: redactAuditData(entry.old_data),
      new_data: redactAuditData(entry.new_data),
      metadata: entry.metadata || {},
    });
    if (error) {
      logger.error({ action: entry.action, err: error.message }, "[Audit] Insert failed");
    }
  } catch (err) {
    // Non-critical — don't break the main operation
    logger.error({ action: entry.action, err: String(err) }, "[Audit] Failed to log");
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
    const session = await sessionUser(supabase);
    const rows = entries.map((entry) => ({
      ...actorFor(session, entry),
      action: entry.action,
      category: entry.category,
      resource_type: entry.resource_type,
      resource_id: entry.resource_id,
      description: entry.description,
      old_data: redactAuditData(entry.old_data),
      new_data: redactAuditData(entry.new_data),
      metadata: entry.metadata || {},
    }));
    const { error } = await supabase.from("audit_log").insert(rows);
    if (error) {
      logger.error({ entries: entries.length, err: error.message }, "[Audit] Batch insert failed");
    }
  } catch (err) {
    logger.error({ entries: entries.length, err: String(err) }, "[Audit] Failed to batch log");
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
