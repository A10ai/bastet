import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import {
  createNotification,
  getNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
} from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { validateBody, formatZodErrors, notificationSchema } from "@/lib/validation";

// ---------------------------------------------------------------------------
// GET /api/v1/notifications
// Query params: ?unread_only=true&limit=20&staff_id=xxx
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();
    const { searchParams } = new URL(request.url);

    const unreadOnly = searchParams.get("unread_only") === "true";
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100);
    const staffId = searchParams.get("staff_id");

    // Try to get staff_id from auth session if not provided
    let resolvedStaffId = staffId;
    if (!resolvedStaffId) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: staffData } = await supabase
          .from("staff")
          .select("id")
          .eq("auth_user_id", session.user.id)
          .single();
        resolvedStaffId = staffData?.id || null;
      }
    }

    if (!resolvedStaffId) {
      // No staff context — return all recent notifications (admin/system view)
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        notifications: data || [],
        unread_count: 0,
      });
    }

    const [notifications, unreadCount] = await Promise.all([
      getNotifications(supabase, resolvedStaffId, { unread_only: unreadOnly, limit }),
      getUnreadCount(supabase, resolvedStaffId),
    ]);

    return NextResponse.json({
      notifications,
      unread_count: unreadCount,
    });
  } catch (err) {
    logger.error({ err }, "[Notifications API] GET error");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/v1/notifications
// Body: { action: "mark_read", id: "xxx" }
//     | { action: "mark_all_read" }
//     | { action: "create", title, message, type, category, link }
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();
    const body = await request.json();

    const validation = validateBody(notificationSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
    }
    const validated = validation.data;
    const { action } = validated;

    // Resolve staff ID from session
    let staffId: string | null = validated.staff_id || null;
    if (!staffId) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: staffData } = await supabase
          .from("staff")
          .select("id")
          .eq("auth_user_id", session.user.id)
          .single();
        staffId = staffData?.id || null;
      }
    }

    switch (action) {
      case "mark_read": {
        if (!validated.id) {
          return NextResponse.json(
            { error: "Missing notification id" },
            { status: 400 }
          );
        }
        const success = await markRead(supabase, validated.id);
        await logAudit(supabase, {
          action: "notification.mark_read",
          category: "system",
          resource_type: "notification",
          resource_id: validated.id,
          description: `Marked notification ${validated.id} as read`,
        });
        return NextResponse.json({ success });
      }

      case "mark_all_read": {
        if (!staffId) {
          return NextResponse.json(
            { error: "No staff context available" },
            { status: 400 }
          );
        }
        const success = await markAllRead(supabase, staffId);
        await logAudit(supabase, {
          action: "notification.mark_all_read",
          category: "system",
          resource_type: "notification",
          resource_id: staffId,
          description: `Marked all notifications as read for staff ${staffId}`,
        });
        return NextResponse.json({ success });
      }

      case "create": {
        const { title, message, type, category, link } = validated;
        if (!title || !message) {
          return NextResponse.json(
            { error: "Missing title or message" },
            { status: 400 }
          );
        }
        const notifications = await createNotification(supabase, {
          staff_id: validated.staff_id || null,
          title,
          message,
          type: type || "info",
          category: category ?? undefined,
          link: link || null,
        });
        await logAudit(supabase, {
          action: "notification.create",
          category: "system",
          resource_type: "notification",
          description: `Created notification: ${title}`,
          new_data: validated,
        });
        return NextResponse.json({ notifications });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (err) {
    logger.error({ err }, "[Notifications API] POST error");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
