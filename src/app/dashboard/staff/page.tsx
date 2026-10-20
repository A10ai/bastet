"use client";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useApi } from "@/hooks/use-api";
import { useState, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, Filter, Loader2, Search, Plus, Users, UserCheck, UserX } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { STAFF_ROLES } from "@/lib/constants";
import type { Staff } from "@/types";
import type { RechartsValue } from "@/types/recharts";
import { darkTooltipProps } from "@/lib/chart-styles";

const ACCENT = "#22D3EE";
const ROLE_COLORS = ["#22D3EE", "#34D399", "#FBBF24", "#A78BFA", "#F97316", "#F472B6"];
const DEPT_COLORS = ["#818CF8", "#6EE7B7", "#FB923C", "#E879F9", "#38BDF8", "#FCD34D"];


interface StaffTaskCounts {
  [staffId: string]: number;
}

export default function StaffPage() {
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<string>("true");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (activeFilter) params.set("is_active", activeFilter);
    if (debouncedSearch) params.set("search", debouncedSearch);
    return params.toString();
  }, [activeFilter, debouncedSearch]);

  const { data: staffRows, isLoading: loading } = useApi<Staff[]>(`/api/v1/staff?${query}`, undefined, ["staff"]);
  const staff = useMemo(() => staffRows ?? [], [staffRows]);
  type AssignedRow = { assigned_staff_id?: string | null; status: string };
  const { data: hkRows } = useApi<AssignedRow[]>("/api/v1/housekeeping", undefined, ["housekeeping_tasks"]);
  const { data: mxRows } = useApi<AssignedRow[]>("/api/v1/maintenance", undefined, ["maintenance_requests"]);

  const taskCounts = useMemo<StaffTaskCounts>(() => {
    const counts: StaffTaskCounts = {};
    for (const t of hkRows ?? []) {
      if (t.assigned_staff_id && ["pending", "assigned", "in_progress"].includes(t.status)) counts[t.assigned_staff_id] = (counts[t.assigned_staff_id] || 0) + 1;
    }
    for (const r of mxRows ?? []) {
      if (r.assigned_staff_id && ["open", "assigned", "in_progress"].includes(r.status)) counts[r.assigned_staff_id] = (counts[r.assigned_staff_id] || 0) + 1;
    }
    return counts;
  }, [hkRows, mxRows]);

  /* ---------- Chart data ---------- */
  const statCards = useMemo(() => {
    const total = staff.length;
    const active = staff.filter((s) => s.is_active).length;
    const inactive = total - active;
    return { total, active, inactive };
  }, [staff]);

  const roleChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of staff) {
      const r = s.role || "other";
      counts[r] = (counts[r] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }))
      .filter((d) => d.value > 0);
  }, [staff]);

  const deptChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of staff) {
      const d = s.department || "Unassigned";
      counts[d] = (counts[d] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }))
      .filter((d) => d.value > 0);
  }, [staff]);

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

      {/* Stat Cards */}
      {!loading && staff.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { label: "Total Staff", value: statCards.total, icon: Users, color: ACCENT },
            { label: "Active", value: statCards.active, icon: UserCheck, color: "#34D399" },
            { label: "Inactive", value: statCards.inactive, icon: UserX, color: "#F97316" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${s.color}15` }}>
                  <s.icon className="w-5 h-5" style={{ color: s.color }} />
                </div>
                <div>
                  <p className="text-xs text-text-muted">{s.label}</p>
                  <p className="text-xl font-bold text-text-primary">{s.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Charts */}
      {!loading && staff.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Staff by Role */}
          {roleChartData.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-text-primary mb-3">Staff by Role</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={roleChartData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                      {roleChartData.map((_, i) => (
                        <Cell key={i} fill={ROLE_COLORS[i % ROLE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip {...darkTooltipProps} formatter={(v: RechartsValue) => [`${v} staff`, "Count"]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap justify-center gap-3 mt-2">
                  {roleChartData.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-1.5 text-xs text-text-secondary">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: ROLE_COLORS[i % ROLE_COLORS.length] }} />
                      {d.name} ({d.value})
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Staff by Department */}
          {deptChartData.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-text-primary mb-3">Staff by Department</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={deptChartData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                      {deptChartData.map((_, i) => (
                        <Cell key={i} fill={DEPT_COLORS[i % DEPT_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip {...darkTooltipProps} formatter={(v: RechartsValue) => [`${v} staff`, "Count"]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap justify-center gap-3 mt-2">
                  {deptChartData.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-1.5 text-xs text-text-secondary">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: DEPT_COLORS[i % DEPT_COLORS.length] }} />
                      {d.name} ({d.value})
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Search & Active Toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search staff..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-brand-bg border border-brand-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-accent/50"
          />
        </div>
        <div className="flex gap-1 bg-brand-card border border-brand-border rounded-lg p-0.5">
          <button
            onClick={() => setActiveFilter("true")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeFilter === "true"
                ? "bg-brand-accent text-brand-bg"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Active
          </button>
          <button
            onClick={() => setActiveFilter("false")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeFilter === "false"
                ? "bg-brand-accent text-brand-bg"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Inactive
          </button>
          <button
            onClick={() => setActiveFilter("")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeFilter === ""
                ? "bg-brand-accent text-brand-bg"
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
              ? "bg-brand-accent text-brand-bg"
              : "bg-brand-card border border-brand-border text-text-secondary hover:text-text-primary"
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
                ? "bg-brand-accent text-brand-bg"
                : "bg-brand-card border border-brand-border text-text-secondary hover:text-text-primary"
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
              <Loader2 className="w-6 h-6 animate-spin text-brand-accent" />
            </div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-brand-border">
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
                      className="border-b border-brand-border last:border-0 hover:bg-brand-bg/50 transition-colors"
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
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-mono font-bold bg-brand-accent/15 text-brand-accent">
                            {taskCount}
                          </span>
                        ) : (
                          <span className="text-xs text-text-muted">0</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <Link
                          href={`/dashboard/staff/${member.id}`}
                          className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-brand-accent transition-colors"
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
