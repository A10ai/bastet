"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Loader2, Activity } from "lucide-react";
import { formatDate, timeAgo } from "@/lib/utils";
import type { GuestActivityLog } from "@/types";

interface GuestActivityTimelineProps {
  guestId: string;
}

const ACTIVITY_ICONS: Record<string, string> = {
  booking: "📅",
  checkin: "🏨",
  checkout: "🚪",
  payment: "💳",
  review: "⭐",
  communication: "💬",
  preference_update: "⚙️",
  loyalty: "🏆",
};

export function GuestActivityTimeline({ guestId }: GuestActivityTimelineProps) {
  const [activities, setActivities] = useState<GuestActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActivities = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/guests/${guestId}/activity`);
        const json = await res.json();
        setActivities(json.data || []);
      } catch {
        setActivities([]);
      } finally {
        setLoading(false);
      }
    };
    fetchActivities();
  }, [guestId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-bastet-gold" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="text-lg font-semibold text-text-primary">
          Activity Timeline
        </h3>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-center">
            <Activity className="w-8 h-8 text-text-muted mb-2" />
            <p className="text-sm text-text-secondary">No activity recorded yet</p>
          </div>
        ) : (
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-3 top-2 bottom-2 w-px bg-bastet-border" />

            <div className="space-y-4">
              {activities.map((activity) => (
                <div key={activity.id} className="flex gap-4 relative">
                  <div className="w-6 h-6 rounded-full bg-bastet-card border border-bastet-border flex items-center justify-center shrink-0 z-10 text-xs">
                    {ACTIVITY_ICONS[activity.activity_type] || "📌"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-text-primary capitalize">
                        {activity.activity_type.replace(/_/g, " ")}
                      </p>
                      <span className="text-xs text-text-muted shrink-0">
                        {timeAgo(activity.created_at)}
                      </span>
                    </div>
                    {activity.activity_detail && Object.keys(activity.activity_detail).length > 0 && (
                      <p className="text-xs text-text-secondary mt-0.5 truncate">
                        {JSON.stringify(activity.activity_detail)
                          .replace(/[{}"]/g, "")
                          .replace(/,/g, ", ")
                          .slice(0, 100)}
                      </p>
                    )}
                    <p className="text-[10px] text-text-muted mt-0.5">
                      via {activity.source} — {formatDate(activity.created_at, "dd MMM yyyy HH:mm")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
