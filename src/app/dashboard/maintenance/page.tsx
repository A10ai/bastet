"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, Filter, Loader2, Plus, Search } from "lucide-react";
import { MAINTENANCE_STATUSES } from "@/lib/constants";
import { timeAgo } from "@/lib/utils";
import type { MaintenanceRequest } from "@/types";

export default function MaintenancePage() {
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetchRequests = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (search) params.set("search", search);
        const res = await fetch(`/api/v1/maintenance?${params}`);
        const json = await res.json();
        setRequests(json.data || []);
      } catch {
        setRequests([]);
      } finally {
        setLoading(false);
      }
    };
    fetchRequests();
  }, [search]);

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
                      <th className="text-right text-xs font-medium text-text-muted px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((req) => (
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
                        <td className="px-4 py-3 text-right">
                          <Link href={`/dashboard/maintenance/${req.id}`} className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-bastet-gold transition-colors">
                            <Eye className="w-3.5 h-3.5" /> View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile card list */}
              <div className="md:hidden divide-y divide-bastet-border">
                {filtered.map((req) => (
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
                      </div>
                      <p className="text-sm font-medium text-text-primary truncate">{req.title}</p>
                      <p className="text-xs text-text-muted mt-0.5 capitalize">{req.category} · {timeAgo(req.created_at)}</p>
                    </div>
                    <Eye className="w-4 h-4 text-text-muted shrink-0 ml-3" />
                  </Link>
                ))}
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
