"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GitBranch, CheckCircle, Clock, AlertTriangle, RefreshCw, Plus, Activity, BarChart3, Timer, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import type { RechartsValue, RechartsName } from "@/types/recharts";
import type { Workflow, WorkflowStats} from "@/components/ai/workflow-sections";
import { SOURCE_CONFIG, STATUS_CONFIG, WorkflowCard, CreateWorkflowModal } from "@/components/ai/workflow-sections";

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [stats, setStats] = useState<WorkflowStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [workflowsRes, statsRes] = await Promise.all([
        fetch("/api/v1/ai/workflows?limit=100"),
        fetch("/api/v1/ai/workflows?type=stats"),
      ]);

      const [workflowsJson, statsJson] = await Promise.all([
        workflowsRes.json(),
        statsRes.json(),
      ]);

      if (workflowsJson.data) setWorkflows(workflowsJson.data);
      if (statsJson.data) setStats(statsJson.data);
    } catch {
      setError("Failed to load workflows");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAction = async (action: string, id: string, extra?: Record<string, unknown>) => {
    setActionLoading(id);
    try {
      const res = await fetch("/api/v1/ai/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id, ...extra }),
      });
      const json = await res.json();
      if (json.data) {
        // Update the workflow in the local state
        setWorkflows((prev) =>
          prev.map((w) => (w.id === json.data.id ? json.data : w))
        );
      }
      // Refresh stats
      const statsRes = await fetch("/api/v1/ai/workflows?type=stats");
      const statsJson = await statsRes.json();
      if (statsJson.data) setStats(statsJson.data);
    } catch {
      setError("Action failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreate = async (data: {
    title: string;
    description: string;
    priority: string;
    steps: Array<{ title: string; action_type: string; action_params: Record<string, unknown>; requires_approval: boolean }>;
  }) => {
    try {
      const res = await fetch("/api/v1/ai/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          title: data.title,
          description: data.description,
          source: "manual",
          priority: data.priority,
          steps: data.steps,
          created_by: "staff",
        }),
      });
      const json = await res.json();
      if (json.data) {
        setWorkflows((prev) => [json.data, ...prev]);
      }
      // Refresh stats
      const statsRes = await fetch("/api/v1/ai/workflows?type=stats");
      const statsJson = await statsRes.json();
      if (statsJson.data) setStats(statsJson.data);
    } catch {
      setError("Failed to create workflow");
    }
  };

  // Filtered workflows
  const pendingApproval = workflows.filter((w) => w.status === "awaiting_approval");
  const active = workflows.filter((w) =>
    ["pending", "in_progress", "approved"].includes(w.status)
  );
  const history = workflows.filter((w) =>
    ["completed", "cancelled", "failed"].includes(w.status)
  );

  const displayed =
    filter === "approval"
      ? pendingApproval
      : filter === "active"
      ? active
      : filter === "history"
      ? history
      : workflows;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <GitBranch className="w-8 h-8 animate-pulse text-cyan-400" />
        <p className="text-sm text-text-secondary">Loading workflows...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <GitBranch className="w-6 h-6 text-cyan-400" />
            <h1 className="text-xl md:text-2xl font-display font-bold text-text-primary">
              Workflow Engine
            </h1>
          </div>
          <p className="text-sm text-text-secondary mt-1">
            AI recommendations become executable actions -- approve, execute, track
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <Button variant="secondary" size="sm" onClick={fetchData}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>
          <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New Workflow
          </Button>
        </div>
      </div>

      {/* A. Stats Row */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="py-5 text-center">
              <Activity className="w-5 h-5 text-cyan-400 mx-auto mb-2" />
              <p className="text-xs text-text-muted mb-1">Active Workflows</p>
              <p className="text-lg font-mono font-bold text-text-primary">
                {(stats.by_status.pending || 0) +
                  (stats.by_status.in_progress || 0) +
                  (stats.by_status.approved || 0)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className={cn("py-5 text-center", (stats.by_status.awaiting_approval || 0) > 0 && "border-amber-400/20")}>
              <ShieldCheck className="w-5 h-5 text-amber-400 mx-auto mb-2" />
              <p className="text-xs text-text-muted mb-1">Awaiting Approval</p>
              <p className={cn(
                "text-lg font-mono font-bold",
                (stats.by_status.awaiting_approval || 0) > 0 ? "text-amber-400" : "text-text-primary"
              )}>
                {stats.by_status.awaiting_approval || 0}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-5 text-center">
              <CheckCircle className="w-5 h-5 text-status-success mx-auto mb-2" />
              <p className="text-xs text-text-muted mb-1">Completed This Week</p>
              <p className="text-lg font-mono font-bold text-text-primary">
                {stats.completed_this_week}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-5 text-center">
              <Timer className="w-5 h-5 text-cyan-400 mx-auto mb-2" />
              <p className="text-xs text-text-muted mb-1">Avg Completion</p>
              <p className="text-lg font-mono font-bold text-text-primary">
                {stats.avg_completion_hours !== null
                  ? stats.avg_completion_hours < 1
                    ? `${Math.round(stats.avg_completion_hours * 60)}m`
                    : `${stats.avg_completion_hours}h`
                  : "--"}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts: Workflow Status Donut + Completion Rate by Source */}
      {stats && workflows.length > 0 && (() => {
        const DARK_TOOLTIP = { backgroundColor: '#111827', border: '1px solid #1F2937', borderRadius: '8px' };
        const STATUS_COLORS: Record<string, string> = {
          pending: "#FBBF24", in_progress: "#22D3EE", awaiting_approval: "#F59E0B",
          approved: "#3B82F6", completed: "#34D399", failed: "#EF4444", cancelled: "#6B7280",
        };
        const statusData = Object.entries(stats.by_status)
          .filter(([, count]) => count > 0)
          .map(([status, count]) => ({
            name: STATUS_CONFIG[status]?.label || status,
            value: count,
            color: STATUS_COLORS[status] || "#6B7280",
          }));

        // Completion rate by source
        const sourceGroups: Record<string, { total: number; completed: number }> = {};
        workflows.forEach((w) => {
          if (!sourceGroups[w.source]) sourceGroups[w.source] = { total: 0, completed: 0 };
          sourceGroups[w.source].total++;
          if (w.status === "completed") sourceGroups[w.source].completed++;
        });
        const completionData = Object.entries(sourceGroups).map(([src, data]) => ({
          name: SOURCE_CONFIG[src]?.label || src,
          rate: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0,
          total: data.total,
        }));

        return (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <h3 className="text-sm font-semibold text-text-primary">Workflow Status</h3>
              </CardHeader>
              <CardContent className="h-56 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={72} dataKey="value" paddingAngle={3} stroke="none">
                      {statusData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={DARK_TOOLTIP} itemStyle={{ color: '#D1D5DB' }} formatter={(value: RechartsValue, name: RechartsName) => [value, name]} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
              <div className="px-6 pb-4 flex flex-wrap justify-center gap-3">
                {statusData.map((d) => (
                  <div key={d.name} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="text-xs text-text-muted">{d.name} ({d.value})</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader>
                <h3 className="text-sm font-semibold text-text-primary">Completion Rate by Source</h3>
              </CardHeader>
              <CardContent className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={completionData} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                    <XAxis dataKey="name" tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 100]} unit="%" />
                    <Tooltip contentStyle={DARK_TOOLTIP} labelStyle={{ color: '#D1D5DB' }} formatter={(value: RechartsValue, name: RechartsName, props: { payload?: { total?: number } }) => [`${value}% (${props.payload?.total ?? 0} total)`, "Completion"]} />
                    <Bar dataKey="rate" fill="#22D3EE" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 p-1 bg-brand-bg rounded-lg w-fit">
        {[
          { key: "all", label: "All", count: workflows.length },
          { key: "approval", label: "Needs Approval", count: pendingApproval.length },
          { key: "active", label: "Active", count: active.length },
          { key: "history", label: "History", count: history.length },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              filter === tab.key
                ? "bg-brand-card text-text-primary shadow-sm"
                : "text-text-muted hover:text-text-secondary"
            )}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={cn(
                "ml-1.5 px-1.5 py-0.5 rounded-full text-[10px]",
                tab.key === "approval" && tab.count > 0
                  ? "bg-amber-400/20 text-amber-400"
                  : "bg-brand-border text-text-muted"
              )}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* B. Pending Approvals (always show at top if any exist and not filtering) */}
      {pendingApproval.length > 0 && filter !== "history" && filter !== "active" && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-text-primary">
              Pending Approval ({pendingApproval.length})
            </h2>
          </div>
          <div className="space-y-3">
            {pendingApproval.map((w) => (
              <WorkflowCard
                key={w.id}
                workflow={w}
                onApprove={(id) => handleAction("approve", id, { approved_by: "staff" })}
                onReject={(id) => handleAction("cancel", id, { reason: "Rejected by staff" })}
                onExecute={(id) => handleAction("execute_step", id)}
                loading={actionLoading}
              />
            ))}
          </div>
        </div>
      )}

      {/* C. Active Workflows */}
      {(filter === "all" || filter === "active") && active.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-text-primary">
              Active Workflows ({active.length})
            </h2>
          </div>
          <div className="space-y-3">
            {active.map((w) => (
              <WorkflowCard
                key={w.id}
                workflow={w}
                onApprove={(id) => handleAction("approve", id, { approved_by: "staff" })}
                onReject={(id) => handleAction("cancel", id, { reason: "Rejected by staff" })}
                onExecute={(id) => handleAction("execute_step", id)}
                loading={actionLoading}
              />
            ))}
          </div>
        </div>
      )}

      {/* D. Workflow History */}
      {(filter === "all" || filter === "history") && history.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-text-muted" />
            <h2 className="text-sm font-semibold text-text-primary">
              History ({history.length})
            </h2>
          </div>
          <div className="space-y-3">
            {history.map((w) => (
              <WorkflowCard
                key={w.id}
                workflow={w}
                onApprove={(id) => handleAction("approve", id, { approved_by: "staff" })}
                onReject={(id) => handleAction("cancel", id, { reason: "Rejected by staff" })}
                onExecute={(id) => handleAction("execute_step", id)}
                loading={actionLoading}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {displayed.length === 0 && !loading && (
        <div className="text-center py-16">
          <GitBranch className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-text-secondary">
            {filter === "approval"
              ? "No workflows awaiting approval"
              : filter === "active"
              ? "No active workflows"
              : filter === "history"
              ? "No workflow history yet"
              : "No workflows yet. Run the AI Brain or create one manually."}
          </p>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-status-error/10 border border-status-error/20">
          <AlertTriangle className="w-4 h-4 text-status-error flex-shrink-0" />
          <p className="text-sm text-status-error">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-status-error" aria-label="Dismiss error">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Create Modal */}
      <CreateWorkflowModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={handleCreate}
      />
    </div>
  );
}
