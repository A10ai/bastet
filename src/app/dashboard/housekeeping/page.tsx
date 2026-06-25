"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, Filter, Loader2, Plus, Star, Zap } from "lucide-react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { HOUSEKEEPING_STATUSES, HOUSEKEEPING_TYPES } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import type { HousekeepingTask } from "@/types";
import type { RechartsValue, RechartsName } from "@/types/recharts";

const HK_STATUS_COLORS: Record<string, string> = {
  pending: "#22D3EE",
  assigned: "#A78BFA",
  in_progress: "#FBBF24",
  completed: "#34D399",
  verified: "#10B981",
  cancelled: "#6B7280",
  skipped: "#9CA3AF",
};

const FLOOR_COLORS = ["#22D3EE", "#34D399", "#FBBF24", "#A78BFA", "#F97316", "#F472B6", "#818CF8"];

const darkTooltipStyle = {
  contentStyle: { background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 8, fontSize: 12, color: "#e2e8f0" },
  itemStyle: { color: "#e2e8f0" },
};

interface NextGuestInfo {
  [apartmentId: string]: {
    guest_name: string;
    arriving: string; // "today" | "tomorrow"
    is_vip: boolean;
  };
}

export default function HousekeepingPage() {
  const [tasks, setTasks] = useState<HousekeepingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [nextGuests, setNextGuests] = useState<NextGuestInfo>({});
  const [vipPriorityCount, setVipPriorityCount] = useState(0);

  useEffect(() => {
    const fetchTasks = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/v1/housekeeping");
        const json = await res.json();
        const data = json.data || [];
        setTasks(data);

        // Fetch cross-data
        fetchNextGuests(data);
      } catch {
        setTasks([]);
      } finally {
        setLoading(false);
      }
    };
    fetchTasks();
  }, []);

  const fetchNextGuests = async (hkTasks: HousekeepingTask[]) => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

      // Fetch confirmed bookings arriving today/tomorrow
      const res = await fetch("/api/v1/bookings?status=confirmed&limit=500");
      const json = await res.json();
      const bookings = json.data || [];

      const nextGuest: NextGuestInfo = {};
      const vipApartmentIds = new Set<string>();

      for (const b of bookings) {
        if (!b.apartment_id) continue;
        const checkIn = b.check_in?.split("T")[0];
        if (checkIn === today || checkIn === tomorrow) {
          const guestName = b.guest
            ? `${b.guest.first_name} ${b.guest.last_name}`
            : "Guest";
          const isVip = b.guest?.vip_status || false;

          nextGuest[b.apartment_id] = {
            guest_name: guestName,
            arriving: checkIn === today ? "today" : "tomorrow",
            is_vip: isVip,
          };

          if (isVip) {
            vipApartmentIds.add(b.apartment_id);
          }
        }
      }

      // Also try to get VIP info from guests endpoint
      try {
        const gRes = await fetch("/api/v1/guests?vip=true&limit=500");
        const gJson = await gRes.json();
        const vipGuests = gJson.data || [];
        const vipGuestIds = new Set(vipGuests.map((g: Record<string, any>) => g.id));

        for (const b of bookings) {
          if (b.apartment_id && b.guest_id && vipGuestIds.has(b.guest_id)) {
            const checkIn = b.check_in?.split("T")[0];
            if (checkIn === today || checkIn === tomorrow) {
              if (nextGuest[b.apartment_id]) {
                nextGuest[b.apartment_id].is_vip = true;
              }
              vipApartmentIds.add(b.apartment_id);
            }
          }
        }
      } catch { /* — */ }

      setNextGuests(nextGuest);

      // Count VIP rooms needing priority cleaning
      const pendingAptIds = new Set(
        hkTasks
          .filter((t) => ["pending", "assigned"].includes(t.status))
          .map((t) => t.apartment_id)
      );
      let vipCount = 0;
      vipApartmentIds.forEach((aptId) => {
        if (pendingAptIds.has(aptId)) vipCount++;
      });
      setVipPriorityCount(vipCount);
    } catch { /* — */ }
  };

  const filtered = tasks.filter((t) => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (typeFilter !== "all" && t.type !== typeFilter) return false;
    return true;
  });

  const statusCounts = HOUSEKEEPING_STATUSES.reduce(
    (acc, s) => {
      acc[s] = tasks.filter((t) => t.status === s).length;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-text-primary">Housekeeping</h1>
          <p className="text-sm text-text-secondary mt-1">
            {tasks.length} tasks — {statusCounts["pending"] || 0} pending, {statusCounts["in_progress"] || 0} in progress
          </p>
        </div>
        <Link href="/dashboard/housekeeping/new">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            New Task
          </Button>
        </Link>
      </div>

      {/* AI Priority Card */}
      {vipPriorityCount > 0 && (
        <Card className="border-bastet-gold/20">
          <CardContent className="py-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-bastet-gold/10 flex items-center justify-center">
                <Star className="w-4 h-4 text-bastet-gold fill-bastet-gold" />
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">
                  AI Priority: <span className="text-bastet-gold font-bold">{vipPriorityCount}</span> VIP room{vipPriorityCount !== 1 ? "s" : ""} need priority cleaning today
                </p>
                <p className="text-xs text-text-muted mt-0.5">
                  VIP guests arriving — ensure these rooms are cleaned first
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts */}
      {tasks.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Status Donut */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-text-primary">Tasks by Status</h3>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center gap-6">
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie
                      data={HOUSEKEEPING_STATUSES.filter((s) => (statusCounts[s] || 0) > 0).map((s) => ({ name: s.replace("_", " "), value: statusCounts[s] || 0 }))}
                      cx="50%" cy="50%" innerRadius={45} outerRadius={70}
                      paddingAngle={2} dataKey="value"
                    >
                      {HOUSEKEEPING_STATUSES.filter((s) => (statusCounts[s] || 0) > 0).map((s) => (
                        <Cell key={s} fill={HK_STATUS_COLORS[s] || "#6B7280"} />
                      ))}
                    </Pie>
                    <Tooltip {...darkTooltipStyle} formatter={(value: RechartsValue) => [value, "Tasks"]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5">
                  {HOUSEKEEPING_STATUSES.filter((s) => (statusCounts[s] || 0) > 0).map((s) => (
                    <div key={s} className="flex items-center gap-2 text-xs">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: HK_STATUS_COLORS[s] || "#6B7280" }} />
                      <span className="text-text-secondary capitalize">{s.replace("_", " ")}</span>
                      <span className="font-mono text-text-muted ml-auto">{statusCounts[s]}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Floor Breakdown */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-text-primary">Tasks by Floor</h3>
            </CardHeader>
            <CardContent>
              {(() => {
                const floorMap: Record<string, number> = {};
                tasks.forEach((t) => {
                  const floor = t.apartment?.floor != null ? `Floor ${t.apartment.floor}` : "Unknown";
                  floorMap[floor] = (floorMap[floor] || 0) + 1;
                });
                const floorData = Object.entries(floorMap).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })).map(([name, value]) => ({ name, value }));
                return (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={floorData} margin={{ left: 0, right: 12, top: 4, bottom: 4 }}>
                      <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip {...darkTooltipStyle} formatter={(value: RechartsValue) => [value, "Tasks"]} cursor={{ fill: "rgba(34,211,238,0.08)" }} />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={28}>
                        {floorData.map((_, i) => (
                          <Cell key={i} fill={FLOOR_COLORS[i % FLOOR_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Status Filter Pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setStatusFilter("all")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            statusFilter === "all"
              ? "bg-bastet-gold text-bastet-bg"
              : "bg-bastet-card border border-bastet-border text-text-secondary hover:text-text-primary"
          }`}
        >
          All ({tasks.length})
        </button>
        {HOUSEKEEPING_STATUSES.map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
              statusFilter === status
                ? "bg-bastet-gold text-bastet-bg"
                : "bg-bastet-card border border-bastet-border text-text-secondary hover:text-text-primary"
            }`}
          >
            {status.replace("_", " ")} ({statusCounts[status] || 0})
          </button>
        ))}
      </div>

      {/* Type Filter */}
      <div className="flex flex-wrap gap-2">
        <span className="text-xs text-text-muted py-1.5">Type:</span>
        <button
          onClick={() => setTypeFilter("all")}
          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
            typeFilter === "all" ? "bg-bastet-card border border-bastet-gold text-bastet-gold" : "bg-bastet-card border border-bastet-border text-text-secondary hover:text-text-primary"
          }`}
        >
          All
        </button>
        {HOUSEKEEPING_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => setTypeFilter(type)}
            className={`px-2.5 py-1 rounded text-xs font-medium capitalize transition-colors ${
              typeFilter === type ? "bg-bastet-card border border-bastet-gold text-bastet-gold" : "bg-bastet-card border border-bastet-border text-text-secondary hover:text-text-primary"
            }`}
          >
            {type.replace("_", " ")}
          </button>
        ))}
      </div>

      {/* Tasks Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-bastet-gold" />
            </div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-bastet-border">
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Apartment</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Type</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Priority</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Assigned To</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Scheduled</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3 hidden md:table-cell">Next Guest</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3 hidden md:table-cell">Energy</th>
                  <th className="text-right text-xs font-medium text-text-muted px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((task) => {
                  const ng = task.apartment_id ? nextGuests[task.apartment_id] : undefined;
                  const isVacant = !ng; // Simplified — no current guest means vacant
                  const showEnergy = isVacant && ["pending", "assigned", "in_progress"].includes(task.status);

                  return (
                    <tr
                      key={task.id}
                      className="border-b border-bastet-border last:border-0 hover:bg-bastet-bg/50 transition-colors"
                    >
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-mono font-semibold text-bastet-gold">
                            {task.apartment?.number || "—"}
                          </span>
                          {ng?.is_vip && (
                            <Star className="w-3 h-3 text-bastet-gold fill-bastet-gold" />
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <Badge variant="status" status={task.type}>
                          {task.type.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="px-6 py-3">
                        <Badge variant="status" status={task.priority} />
                      </td>
                      <td className="px-6 py-3">
                        <Badge variant="status" status={task.status} />
                      </td>
                      <td className="px-6 py-3 text-sm text-text-secondary">
                        {task.assigned_staff
                          ? `${task.assigned_staff.first_name} ${task.assigned_staff.last_name}`
                          : "Unassigned"}
                      </td>
                      <td className="px-6 py-3 text-sm text-text-secondary">
                        {formatDate(task.scheduled_date)}
                      </td>
                      <td className="px-6 py-3 hidden md:table-cell">
                        {ng ? (
                          <div>
                            <span className="text-sm text-text-primary">{ng.guest_name}</span>
                            <span className={`ml-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                              ng.arriving === "today"
                                ? "bg-status-warning/15 text-status-warning"
                                : "bg-bastet-gold/15 text-bastet-gold"
                            }`}>
                              Arriving {ng.arriving}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-text-muted">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3 hidden md:table-cell">
                        {showEnergy && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-bastet-gold/15 text-bastet-gold">
                            <Zap className="w-3 h-3" />
                            Standby
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <Link
                          href={`/dashboard/housekeeping/${task.id}`}
                          className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-bastet-gold transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center py-12 text-center">
              <Filter className="w-8 h-8 text-text-muted mb-2" />
              <p className="text-sm text-text-secondary">No housekeeping tasks found</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
