/**
 * HospitAI Notification Engine
 *
 * Creates, retrieves, and manages notifications for staff members.
 * Supports broadcast notifications (staff_id = null) that go to all active staff.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NotificationInput {
  staff_id?: string | null;
  /**
   * Broadcast only to this property's staff (home property or a
   * staff_properties membership). Required in practice whenever `supabase`
   * is the service-role client: without RLS a broadcast would otherwise
   * reach every active staff member of every property.
   */
  property_id?: string | null;
  title: string;
  message: string;
  type?: "info" | "success" | "warning" | "error" | "ai_decision";
  category?:
    | "booking"
    | "housekeeping"
    | "maintenance"
    | "energy"
    | "guest"
    | "pricing"
    | "brain"
    | "system";
  link?: string | null;
}

export interface Notification {
  id: string;
  staff_id: string | null;
  title: string;
  message: string;
  type: string;
  category: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// createNotification
// ---------------------------------------------------------------------------

/**
 * Create a notification for one staff member, or for every active staff
 * member when `staff_id` is omitted (broadcast). Returns how many were created.
 *
 * The insert deliberately does not ask for the rows back: with row-level
 * security, INSERT ... RETURNING also has to pass the SELECT policy, and a
 * manager cannot read a receptionist's notifications, so a broadcast with
 * RETURNING was rejected wholesale ("new row violates row-level security
 * policy") and no one was ever notified. Found 18 Oct 2026.
 */
export async function createNotification(
  supabase: SupabaseClient,
  input: NotificationInput
): Promise<number> {
  const { staff_id, property_id, title, message, type = "info", category, link } = input;
  const base = { title, message, type, category: category || null, link: link || null };

  if (staff_id) {
    const { error } = await supabase.from("notifications").insert({ staff_id, ...base });
    if (error) {
      logger.error({ err: error.message }, "[Notifications] Failed to create notification");
      return 0;
    }
    return 1;
  }

  if (!property_id) {
    // With the service-role client this reaches every property's staff, and
    // under RLS (00033) a property-less row is visible to no one.
    logger.warn({ title }, "[Notifications] Broadcast without property_id");
  }

  // Broadcast: one row per active staff member (of one property when given)
  let staffQuery = supabase.from("staff").select("id").eq("is_active", true);
  if (property_id) {
    const { data: members } = await supabase.from("staff_properties").select("staff_id").eq("property_id", property_id);
    const memberIds = ((members || []) as { staff_id: string }[]).map((m) => m.staff_id);
    staffQuery = memberIds.length
      ? staffQuery.or(`property_id.eq.${property_id},id.in.(${memberIds.join(",")})`)
      : staffQuery.eq("property_id", property_id);
  }
  const { data: staffMembers, error: staffError } = await staffQuery;

  if (property_id && !staffError && (!staffMembers || staffMembers.length === 0)) {
    // A property-scoped broadcast must never fall back to a global row.
    return 0;
  }
  if (staffError || !staffMembers || staffMembers.length === 0) {
    logger.error({ err: staffError?.message }, "[Notifications] Failed to fetch staff for broadcast");
    if (property_id) return 0;
    // Still create one with null staff_id as fallback
    const { error } = await supabase.from("notifications").insert({ staff_id: null, ...base });
    if (error) {
      logger.error({ err: error.message }, "[Notifications] Fallback insert failed");
      return 0;
    }
    return 1;
  }

  const rows = staffMembers.map((s: { id: string }) => ({ staff_id: s.id, ...base }));
  const { error } = await supabase.from("notifications").insert(rows);
  if (error) {
    logger.error({ err: error.message }, "[Notifications] Broadcast insert failed");
    return 0;
  }
  return rows.length;
}

// ---------------------------------------------------------------------------
// getNotifications
// ---------------------------------------------------------------------------

export async function getNotifications(
  supabase: SupabaseClient,
  staffId: string,
  options: { unread_only?: boolean; limit?: number } = {}
): Promise<Notification[]> {
  const { unread_only = false, limit = 20 } = options;

  let query = supabase
    .from("notifications")
    .select("*")
    .or(`staff_id.eq.${staffId},staff_id.is.null`)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (unread_only) {
    query = query.eq("read", false);
  }

  const { data, error } = await query;

  if (error) {
    logger.error({ err: error.message }, "[Notifications] Failed to get notifications");
    return [];
  }

  return (data || []) as Notification[];
}

// ---------------------------------------------------------------------------
// markRead
// ---------------------------------------------------------------------------

export async function markRead(
  supabase: SupabaseClient,
  notificationId: string
): Promise<boolean> {
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", notificationId);

  if (error) {
    logger.error({ err: error.message }, "[Notifications] Failed to mark read");
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// markAllRead
// ---------------------------------------------------------------------------

export async function markAllRead(
  supabase: SupabaseClient,
  staffId: string
): Promise<boolean> {
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .or(`staff_id.eq.${staffId},staff_id.is.null`)
    .eq("read", false);

  if (error) {
    logger.error({ err: error.message }, "[Notifications] Failed to mark all read");
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// getUnreadCount
// ---------------------------------------------------------------------------

export async function getUnreadCount(
  supabase: SupabaseClient,
  staffId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .or(`staff_id.eq.${staffId},staff_id.is.null`)
    .eq("read", false);

  if (error) {
    logger.error({ err: error.message }, "[Notifications] Failed to get unread count");
    return 0;
  }

  return count || 0;
}
