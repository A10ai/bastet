import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  createNotification,
  getNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
} from "@/lib/notifications";

// ---------------------------------------------------------------------------
// GET /api/v1/notifications
// Query params: ?unread_only=true&limit=20&staff_id=xxx
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
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
    console.error("[Notifications API] GET error:", err);
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
    const supabase = createServerSupabaseClient();
    const body = await request.json();
    const { action } = body;

    // Resolve staff ID from session
    let staffId: string | null = body.staff_id || null;
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
        if (!body.id) {
          return NextResponse.json(
            { error: "Missing notification id" },
            { status: 400 }
          );
        }
        const success = await markRead(supabase, body.id);
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
        return NextResponse.json({ success });
      }

      case "create": {
        const { title, message, type, category, link } = body;
        if (!title || !message) {
          return NextResponse.json(
            { error: "Missing title or message" },
            { status: 400 }
          );
        }
        const notifications = await createNotification(supabase, {
          staff_id: body.staff_id || null,
          title,
          message,
          type: type || "info",
          category: category || null,
          link: link || null,
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
    console.error("[Notifications API] POST error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
