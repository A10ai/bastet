"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CalendarDays,
  Sparkles,
  Wrench,
  Zap,
  Users,
  TrendingUp,
  Brain,
  Settings,
  CheckCheck,
  Info,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Cpu,
} from "lucide-react";
import { timeAgo } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Notification {
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
// Category icon mapping
// ---------------------------------------------------------------------------

const categoryIcons: Record<string, typeof Bell> = {
  booking: CalendarDays,
  housekeeping: Sparkles,
  maintenance: Wrench,
  energy: Zap,
  guest: Users,
  pricing: TrendingUp,
  brain: Brain,
  system: Settings,
};

// ---------------------------------------------------------------------------
// Type color mapping
// ---------------------------------------------------------------------------

function getTypeColor(type: string): string {
  switch (type) {
    case "success":
      return "text-emerald-400";
    case "warning":
      return "text-amber-400";
    case "error":
      return "text-red-400";
    case "ai_decision":
      return "text-purple-400";
    case "info":
    default:
      return "text-cyan-400";
  }
}

function getTypeIcon(type: string) {
  switch (type) {
    case "success":
      return CheckCircle2;
    case "warning":
      return AlertTriangle;
    case "error":
      return XCircle;
    case "ai_decision":
      return Cpu;
    case "info":
    default:
      return Info;
  }
}

// ---------------------------------------------------------------------------
// NotificationBell Component
// ---------------------------------------------------------------------------

interface NotificationBellProps {
  staffId?: string | null;
}

export function NotificationBell({ staffId }: NotificationBellProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: "15" });
      if (staffId) params.set("staff_id", staffId);

      const res = await fetch(`/api/v1/notifications?${params.toString()}`);
      if (!res.ok) return;

      const data = await res.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unread_count || 0);
    } catch {
      // Silently fail on fetch errors
    }
  }, [staffId]);

  // Initial fetch and polling
  useEffect(() => {
    fetchNotifications();

    const interval = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close panel on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Mark a single notification as read
  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read) {
      try {
        await fetch("/api/v1/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "mark_read",
            id: notification.id,
            staff_id: staffId,
          }),
        });

        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notification.id ? { ...n, read: true } : n
          )
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch {
        // Silently fail
      }
    }

    if (notification.link) {
      setIsOpen(false);
      router.push(notification.link);
    }
  };

  // Mark all as read
  const handleMarkAllRead = async () => {
    if (!staffId) return;

    setLoading(true);
    try {
      await fetch("/api/v1/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "mark_all_read",
          staff_id: staffId,
        }),
      });

      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  };

  // Toggle panel
  const togglePanel = () => {
    setIsOpen((prev) => !prev);
    if (!isOpen) {
      fetchNotifications();
    }
  };

  return (
    <div className="relative">
      {/* Bell Button */}
      <button
        ref={buttonRef}
        onClick={togglePanel}
        className="relative p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bastet-bg transition-colors"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-status-error text-white text-[10px] font-bold px-1 leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full mt-2 w-[380px] max-h-[400px] bg-bastet-card border border-bastet-border rounded-xl shadow-2xl shadow-black/40 z-50 flex flex-col overflow-hidden"
          role="dialog"
          aria-label="Notifications panel"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-bastet-border">
            <h3 className="text-sm font-semibold text-text-primary">
              Notifications
            </h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                disabled={loading}
                className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors disabled:opacity-50"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark all read
              </button>
            )}
          </div>

          {/* Notification List */}
          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-text-muted">
                <Bell className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              <ul role="list">
                {notifications.map((notification) => {
                  const CategoryIcon =
                    (notification.category &&
                      categoryIcons[notification.category]) ||
                    getTypeIcon(notification.type);
                  const colorClass = getTypeColor(notification.type);

                  return (
                    <li key={notification.id}>
                      <button
                        onClick={() => handleNotificationClick(notification)}
                        className={`w-full text-left px-4 py-3 hover:bg-bastet-bg/50 transition-colors flex gap-3 ${
                          !notification.read
                            ? "border-l-2 border-l-cyan-400"
                            : "border-l-2 border-l-transparent"
                        }`}
                      >
                        {/* Icon */}
                        <div
                          className={`flex-shrink-0 mt-0.5 ${colorClass}`}
                        >
                          <CategoryIcon className="w-4 h-4" />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p
                              className={`text-sm leading-tight ${
                                !notification.read
                                  ? "font-medium text-text-primary"
                                  : "text-text-secondary"
                              }`}
                            >
                              {notification.title}
                            </p>
                            {!notification.read && (
                              <span className="flex-shrink-0 w-2 h-2 mt-1.5 rounded-full bg-cyan-400" />
                            )}
                          </div>
                          <p className="text-xs text-text-muted mt-0.5 line-clamp-2">
                            {notification.message}
                          </p>
                          <p className="text-[11px] text-text-muted/60 mt-1">
                            {timeAgo(notification.created_at)}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
