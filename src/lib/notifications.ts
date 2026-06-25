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

export async function createNotification(
  supabase: SupabaseClient,
  input: NotificationInput
): Promise<Notification[]> {
  const { staff_id, title, message, type = "info", category, link } = input;

  // If staff_id is provided, create a single notification
  if (staff_id) {
    const { data, error } = await supabase
      .from("notifications")
      .insert({
        staff_id,
        title,
        message,
        type,
        category: category || null,
        link: link || null,
      })
      .select("*")
      .single();

    if (error) {
      logger.error({ err: error.message }, "[Notifications] Failed to create notification");
      return [];
    }

    return data ? [data as Notification] : [];
  }

  // Broadcast: create a notification for every active staff member
  const { data: staffMembers, error: staffError } = await supabase
    .from("staff")
    .select("id")
    .eq("is_active", true);

  if (staffError || !staffMembers || staffMembers.length === 0) {
    logger.error({ err: staffError?.message }, "[Notifications] Failed to fetch staff for broadcast");
    // Still create one with null staff_id as fallback
    const { data, error } = await supabase
      .from("notifications")
      .insert({
        staff_id: null,
        title,
        message,
        type,
        category: category || null,
        link: link || null,
      })
      .select("*")
      .single();

    if (error) {
      logger.error({ err: error.message }, "[Notifications] Fallback insert failed");
      return [];
    }
    return data ? [data as Notification] : [];
  }

  const rows = staffMembers.map((s: { id: string }) => ({
    staff_id: s.id,
    title,
    message,
    type,
    category: category || null,
    link: link || null,
  }));

  const { data, error } = await supabase
    .from("notifications")
    .insert(rows)
    .select("*");

  if (error) {
    logger.error({ err: error.message }, "[Notifications] Broadcast insert failed");
    return [];
  }

  return (data || []) as Notification[];
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
