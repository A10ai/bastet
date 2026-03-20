"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, Filter, Loader2, Search, Plus } from "lucide-react";
import { STAFF_ROLES } from "@/lib/constants";
import type { Staff } from "@/types";

interface StaffTaskCounts {
  [staffId: string]: number;
}

export default function StaffPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<string>("true");
  const [search, setSearch] = useState("");
  const [taskCounts, setTaskCounts] = useState<StaffTaskCounts>({});

  useEffect(() => {
    const fetchStaff = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (activeFilter) params.set("is_active", activeFilter);
        if (search) params.set("search", search);
        const res = await fetch(`/api/v1/staff?${params}`);
        const json = await res.json();
        const data = json.data || [];
        setStaff(data);

        // Fetch task counts
        fetchTaskCounts(data);
      } catch {
        setStaff([]);
      } finally {
        setLoading(false);
      }
    };
    fetchStaff();
  }, [activeFilter, search]);

  const fetchTaskCounts = async (staffList: Staff[]) => {
    const counts: StaffTaskCounts = {};

    try {
      const [hkRes, mxRes] = await Promise.all([
        fetch("/api/v1/housekeeping").catch(() => null),
        fetch("/api/v1/maintenance").catch(() => null),
      ]);

      if (hkRes) {
        const hkJson = await hkRes.json();
        const tasks = hkJson.data || [];
        for (const t of tasks) {
          if (t.assigned_staff_id && ["pending", "assigned", "in_progress"].includes(t.status)) {
            counts[t.assigned_staff_id] = (counts[t.assigned_staff_id] || 0) + 1;
          }
        }
      }

      if (mxRes) {
        const mxJson = await mxRes.json();
        const requests = mxJson.data || [];
        for (const r of requests) {
          if (r.assigned_staff_id && ["open", "assigned", "in_progress"].includes(r.status)) {
            counts[r.assigned_staff_id] = (counts[r.assigned_staff_id] || 0) + 1;
          }
        }
      }
    } catch { /* — */ }

    setTaskCounts(counts);
  };

  const filtered =
    roleFilter === "all"
      ? staff
      : staff.filter((s) => s.role === roleFilter);

  const roleCounts = STAFF_ROLES.reduce(
    (acc, r) => {
      acc[r] = staff.filter((s) => s.role === r).length;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-text-primary">Staff</h1>
          <p className="text-sm text-text-secondary mt-1">
            {staff.length} team members
          </p>
        </div>
        <Link href="/dashboard/staff/new">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Add Staff
          </Button>
        </Link>
      </div>

      {/* Search & Active Toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search staff..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-bastet-bg border border-bastet-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-bastet-gold/50"
          />
        </div>
        <div className="flex gap-1 bg-bastet-card border border-bastet-border rounded-lg p-0.5">
          <button
            onClick={() => setActiveFilter("true")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeFilter === "true"
                ? "bg-bastet-gold text-bastet-bg"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Active
          </button>
          <button
            onClick={() => setActiveFilter("false")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeFilter === "false"
                ? "bg-bastet-gold text-bastet-bg"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Inactive
          </button>
          <button
            onClick={() => setActiveFilter("")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeFilter === ""
                ? "bg-bastet-gold text-bastet-bg"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            All
          </button>
        </div>
      </div>

      {/* Role Filter Pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setRoleFilter("all")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            roleFilter === "all"
              ? "bg-bastet-gold text-bastet-bg"
              : "bg-bastet-card border border-bastet-border text-text-secondary hover:text-text-primary"
          }`}
        >
          All ({staff.length})
        </button>
        {STAFF_ROLES.map((role) => (
          <button
            key={role}
            onClick={() => setRoleFilter(role)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
              roleFilter === role
                ? "bg-bastet-gold text-bastet-bg"
                : "bg-bastet-card border border-bastet-border text-text-secondary hover:text-text-primary"
            }`}
          >
            {role} ({roleCounts[role] || 0})
          </button>
        ))}
      </div>

      {/* Staff Table */}
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
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Name</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Email</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Role</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Department</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3 hidden md:table-cell">Active Tasks</th>
                  <th className="text-right text-xs font-medium text-text-muted px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((member) => {
                  const taskCount = taskCounts[member.id] || 0;
                  return (
                    <tr
                      key={member.id}
                      className="border-b border-bastet-border last:border-0 hover:bg-bastet-bg/50 transition-colors"
                    >
                      <td className="px-6 py-3">
                        <span className="text-sm font-semibold text-text-primary">
                          {member.first_name} {member.last_name}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm text-text-secondary">
                        {member.email}
                      </td>
                      <td className="px-6 py-3">
                        <Badge status={member.role} variant="status">
                          {member.role}
                        </Badge>
                      </td>
                      <td className="px-6 py-3 text-sm text-text-secondary capitalize">
                        {member.department || "—"}
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            member.is_active
                              ? "bg-status-success/10 text-status-success"
                              : "bg-status-error/10 text-status-error"
                          }`}
                        >
                          {member.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-6 py-3 hidden md:table-cell">
                        {taskCount > 0 ? (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-mono font-bold bg-bastet-gold/15 text-bastet-gold">
                            {taskCount}
                          </span>
                        ) : (
                          <span className="text-xs text-text-muted">0</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <Link
                          href={`/dashboard/staff/${member.id}`}
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
              <p className="text-sm text-text-secondary">No staff members found</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
