"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, Filter, Loader2, Plus, Search, AlertTriangle, Zap, RefreshCw } from "lucide-react";
import { MAINTENANCE_STATUSES } from "@/lib/constants";
import { timeAgo } from "@/lib/utils";
import type { MaintenanceRequest } from "@/types";

interface MaintenanceCrossData {
  [requestId: string]: {
    is_occupied?: boolean;
    has_pattern?: boolean;
    is_hvac?: boolean;
  };
}

interface AlertStats {
  urgent_count: number;
  emergency_count: number;
  pattern_count: number;
}

export default function MaintenancePage() {
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [crossData, setCrossData] = useState<MaintenanceCrossData>({});
  const [alertStats, setAlertStats] = useState<AlertStats>({ urgent_count: 0, emergency_count: 0, pattern_count: 0 });

  useEffect(() => {
    const fetchRequests = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (search) params.set("search", search);
        const res = await fetch(`/api/v1/maintenance?${params}`);
        const json = await res.json();
        const data = json.data || [];
        setRequests(data);

        // Fetch cross-data
        fetchCrossData(data);
      } catch {
        setRequests([]);
      } finally {
        setLoading(false);
      }
    };
    fetchRequests();
  }, [search]);

  const fetchCrossData = async (mxRequests: MaintenanceRequest[]) => {
    const cd: MaintenanceCrossData = {};

    // Fetch active bookings to check occupied apartments
    try {
      const bkRes = await fetch("/api/v1/bookings?status=checked_in&limit=500");
      const bkJson = await bkRes.json();
      const bookings = bkJson.data || [];
      const occupiedApts = new Set(bookings.map((b: any) => b.apartment_id).filter(Boolean));

      for (const req of mxRequests) {
        cd[req.id] = {
          ...cd[req.id],
          is_occupied: req.apartment_id ? occupiedApts.has(req.apartment_id) : false,
        };
      }
    } catch { /* — */ }

    // Detect patterns: 3+ tickets for same apartment or category in 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const recentRequests = mxRequests.filter((r) => r.created_at >= thirtyDaysAgo);

    // Count by apartment
    const aptCounts: Record<string, number> = {};
    const catCounts: Record<string, number> = {};
    for (const r of recentRequests) {
      if (r.apartment_id) {
        aptCounts[r.apartment_id] = (aptCounts[r.apartment_id] || 0) + 1;
      }
      if (r.category) {
        const key = `${r.apartment_id || ""}:${r.category}`;
        catCounts[key] = (catCounts[key] || 0) + 1;
      }
    }

    let patternCount = 0;
    for (const req of mxRequests) {
      const aptCount = req.apartment_id ? (aptCounts[req.apartment_id] || 0) : 0;
      const catKey = `${req.apartment_id || ""}:${req.category}`;
      const catCount = catCounts[catKey] || 0;
      const hasPattern = aptCount >= 3 || catCount >= 3;

      const isHvac = ["hvac", "heating", "cooling", "air_conditioning", "ac"].includes(
        (req.category || "").toLowerCase()
      );

      cd[req.id] = {
        ...cd[req.id],
        has_pattern: hasPattern,
        is_hvac: isHvac,
      };

      if (hasPattern) patternCount++;
    }

    setCrossData(cd);

    // Compute alert stats
    const activeStatuses = ["open", "assigned", "in_progress"];
    const urgentCount = mxRequests.filter((r) => r.priority === "urgent" && activeStatuses.includes(r.status)).length;
    const emergencyCount = mxRequests.filter((r) => r.priority === "emergency" && activeStatuses.includes(r.status)).length;
    setAlertStats({
      urgent_count: urgentCount,
      emergency_count: emergencyCount,
      pattern_count: patternCount,
    });
  };

  const filtered =
    statusFilter === "all"
      ? requests
      : requests.filter((r) => r.status === statusFilter);

  const statusCounts = MAINTENANCE_STATUSES.reduce(
    (acc, s) => {
      acc[s] = requests.filter((r) => r.status === s).length;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-bold text-text-primary">Maintenance</h1>
          <p className="text-sm text-text-secondary mt-1">
            {requests.length} requests — {statusCounts["open"] || 0} open, {statusCounts["in_progress"] || 0} in progress
          </p>
        </div>
        <Link href="/dashboard/maintenance/new">
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            New Request
          </Button>
        </Link>
      </div>

      {/* AI Alert Card */}
      {(alertStats.urgent_count > 0 || alertStats.emergency_count > 0 || alertStats.pattern_count > 0) && (
        <Card className="border-status-warning/20">
          <CardContent className="py-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-status-warning/10 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-status-warning" />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {alertStats.emergency_count > 0 && (
                  <span className="text-sm text-status-error font-medium">
                    {alertStats.emergency_count} emergency
                  </span>
                )}
                {alertStats.urgent_count > 0 && (
                  <span className="text-sm text-status-warning font-medium">
                    {alertStats.urgent_count} urgent
                  </span>
                )}
                {alertStats.pattern_count > 0 && (
                  <span className="inline-flex items-center gap-1 text-sm text-amber-400 font-medium">
                    <RefreshCw className="w-3 h-3" />
                    {alertStats.pattern_count} patterns detected
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          type="text"
          placeholder="Search requests..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:max-w-sm pl-9 pr-3 py-2 bg-bastet-bg border border-bastet-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-bastet-gold/50"
        />
      </div>

      {/* Status Filter Pills */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setStatusFilter("all")}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
            statusFilter === "all"
              ? "bg-bastet-gold text-bastet-bg"
              : "bg-bastet-card border border-bastet-border text-text-secondary hover:text-text-primary"
          }`}
        >
          All ({requests.length})
        </button>
        {MAINTENANCE_STATUSES.map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
              statusFilter === status
                ? "bg-bastet-gold text-bastet-bg"
                : "bg-bastet-card border border-bastet-border text-text-secondary hover:text-text-primary"
            }`}
          >
            {status.replace("_", " ")} ({statusCounts[status] || 0})
          </button>
        ))}
      </div>

      {/* Requests — card list on mobile, table on desktop */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-bastet-gold" />
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-bastet-border">
                      <th className="text-left text-xs font-medium text-text-muted px-4 py-3">Title</th>
                      <th className="text-left text-xs font-medium text-text-muted px-4 py-3">Apartment</th>
                      <th className="text-left text-xs font-medium text-text-muted px-4 py-3">Category</th>
                      <th className="text-left text-xs font-medium text-text-muted px-4 py-3">Priority</th>
                      <th className="text-left text-xs font-medium text-text-muted px-4 py-3">Status</th>
                      <th className="text-left text-xs font-medium text-text-muted px-4 py-3">Assigned</th>
                      <th className="text-left text-xs font-medium text-text-muted px-4 py-3">Created</th>
                      <th className="text-left text-xs font-medium text-text-muted px-4 py-3">Impact</th>
                      <th className="text-left text-xs font-medium text-text-muted px-4 py-3">Flags</th>
                      <th className="text-right text-xs font-medium text-text-muted px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((req) => {
                      const cd = crossData[req.id];
                      return (
                        <tr
                          key={req.id}
                          className="border-b border-bastet-border last:border-0 hover:bg-bastet-bg/50 transition-colors"
                        >
                          <td className="px-4 py-3 text-sm font-semibold text-text-primary">{req.title}</td>
                          <td className="px-4 py-3 text-sm font-mono text-bastet-gold">{req.apartment?.number || "—"}</td>
                          <td className="px-4 py-3"><Badge variant="status" status={req.category}>{req.category}</Badge></td>
                          <td className="px-4 py-3"><Badge variant="status" status={req.priority} /></td>
                          <td className="px-4 py-3"><Badge variant="status" status={req.status} /></td>
                          <td className="px-4 py-3 text-sm text-text-secondary">
                            {req.assigned_staff ? `${req.assigned_staff.first_name} ${req.assigned_staff.last_name}` : "Unassigned"}
                          </td>
                          <td className="px-4 py-3 text-sm text-text-secondary">{timeAgo(req.created_at)}</td>
                          <td className="px-4 py-3">
                            {cd?.is_occupied ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-status-error/15 text-status-error">
                                Occupied
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-400/15 text-gray-400">
                                Vacant
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {cd?.has_pattern && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-400/15 text-amber-400">
                                  <RefreshCw className="w-2.5 h-2.5" />
                                  Pattern
                                </span>
                              )}
                              {cd?.is_hvac && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-400/15 text-amber-400">
                                  <Zap className="w-2.5 h-2.5" />
                                  Energy
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link href={`/dashboard/maintenance/${req.id}`} className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-bastet-gold transition-colors">
                              <Eye className="w-3.5 h-3.5" /> View
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile card list */}
              <div className="md:hidden divide-y divide-bastet-border">
                {filtered.map((req) => {
                  const cd = crossData[req.id];
                  return (
                    <Link
                      key={req.id}
                      href={`/dashboard/maintenance/${req.id}`}
                      className="flex items-center justify-between px-4 py-3 hover:bg-bastet-bg/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-mono text-bastet-gold">{req.apartment?.number || "—"}</span>
                          <Badge variant="status" status={req.priority} />
                          <Badge variant="status" status={req.status} />
                          {cd?.is_occupied && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-status-error/15 text-status-error">
                              Occupied
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-text-primary truncate">{req.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-xs text-text-muted capitalize">{req.category} · {timeAgo(req.created_at)}</p>
                          {cd?.has_pattern && (
                            <span className="text-[9px] text-amber-400 font-medium">Pattern</span>
                          )}
                        </div>
                      </div>
                      <Eye className="w-4 h-4 text-text-muted shrink-0 ml-3" />
                    </Link>
                  );
                })}
              </div>
            </>
          )}
          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center py-12 text-center">
              <Filter className="w-8 h-8 text-text-muted mb-2" />
              <p className="text-sm text-text-secondary">No maintenance requests found</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
