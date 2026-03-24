"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Workflow,
  Play,
  Loader2,
  Clock,
  Zap,
  CheckCircle,
  AlertTriangle,
  TrendingUp,
  Sparkles,
  Shield,
  Leaf,
  Wrench,
  ChevronRight,
} from "lucide-react";
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AutomationMeta {
  id: string;
  name: string;
  type: string;
  description: string;
  enabled: boolean;
  last_run: string | null;
  actions_taken: number;
}

interface AutomationResultItem {
  action: string;
  description: string;
  impact: string;
  timestamp: string;
}

interface RunResultGroup {
  automation_id: string;
  automation_name: string;
  results: AutomationResultItem[];
}

interface LogEntry extends AutomationResultItem {
  automation_id: string;
  automation_name: string;
}

// ---------------------------------------------------------------------------
// Icon + colour mapping per automation type
// ---------------------------------------------------------------------------

const automationConfig: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; accent: string; bg: string }
> = {
  auto_pricing: {
    icon: TrendingUp,
    accent: "text-emerald-400",
    bg: "bg-emerald-400/10",
  },
  auto_housekeeping: {
    icon: Sparkles,
    accent: "text-bastet-gold",
    bg: "bg-bastet-gold/10",
  },
  maintenance_pattern: {
    icon: Wrench,
    accent: "text-amber-400",
    bg: "bg-amber-400/10",
  },
  vip_preparation: {
    icon: Shield,
    accent: "text-violet-400",
    bg: "bg-violet-400/10",
  },
  energy_standby: {
    icon: Leaf,
    accent: "text-teal-400",
    bg: "bg-teal-400/10",
  },
};

function getActionIcon(action: string) {
  if (action.includes("error")) return <AlertTriangle className="w-3.5 h-3.5 text-red-400" />;
  if (action.endsWith("_check")) return <CheckCircle className="w-3.5 h-3.5 text-text-muted" />;
  return <Zap className="w-3.5 h-3.5 text-bastet-gold" />;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<AutomationMeta[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null); // "all" | automation_id | null

  // Fetch automations metadata
  const fetchAutomations = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/ai/automations");
      const json = await res.json();
      if (json.data) {
        setAutomations(
          Array.isArray(json.data) ? json.data : json.data.automations || []
        );
      }
    } catch {
      // fail silently
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAutomations();
  }, [fetchAutomations]);

  // Run all automations
  const handleRunAll = async () => {
    setRunning("all");
    try {
      const res = await fetch("/api/v1/ai/automations/run", { method: "POST" });
      const json = await res.json();
      if (json.data) {
        setAutomations(json.data.automations || []);
        if (json.data.log) {
          setLog((prev) => [...json.data.log, ...prev]);
        } else if (json.data.run_results) {
          const entries: LogEntry[] = (json.data.run_results as RunResultGroup[]).flatMap((r) =>
            r.results.map((result) => ({
              automation_id: r.automation_id,
              automation_name: r.automation_name,
              ...result,
            }))
          );
          setLog((prev) => [...entries, ...prev]);
        }
      }
    } catch {
      // fail silently
    } finally {
      setRunning(null);
    }
  };

  // Run single automation
  const handleRunSingle = async (id: string) => {
    setRunning(id);
    try {
      const res = await fetch("/api/v1/ai/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ automation_id: id }),
      });
      const json = await res.json();
      if (json.data) {
        setAutomations(json.data.automations || []);
        if (json.data.run_results) {
          const entries: LogEntry[] = (json.data.run_results as RunResultGroup[]).flatMap((r) =>
            r.results.map((result) => ({
              automation_id: r.automation_id,
              automation_name: r.automation_name || id,
              ...result,
            }))
          );
          setLog((prev) => [...entries, ...prev]);
        }
      }
    } catch {
      // fail silently
    } finally {
      setRunning(null);
    }
  };

  // Toggle enabled state (local only — no persistence endpoint)
  const handleToggle = (id: string) => {
    setAutomations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a))
    );
  };

  // ---------------------------------------------------
  // Loading state
  // ---------------------------------------------------
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Workflow className="w-8 h-8 animate-pulse text-bastet-gold" />
        <p className="text-sm text-text-secondary">
          Loading smart automations...
        </p>
      </div>
    );
  }

  // ---------------------------------------------------
  // Render
  // ---------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Workflow className="w-6 h-6 text-bastet-gold" />
            <h1 className="text-2xl font-display font-bold text-text-primary">
              Smart Automations
            </h1>
          </div>
          <p className="text-sm text-text-secondary mt-1">
            AI-powered operational automations running against live property data
          </p>
        </div>
        <Button
          onClick={handleRunAll}
          disabled={running !== null}
          size="md"
        >
          {running === "all" ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Play className="w-4 h-4 mr-2" />
          )}
          {running === "all" ? "Running..." : "Run All"}
        </Button>
      </div>

      {/* Charts */}
      {automations.length > 0 && (() => {
        const DARK_TOOLTIP = { backgroundColor: '#111827', border: '1px solid #1F2937', borderRadius: '8px' };
        const typeData = automations.map((a) => ({
          name: a.name.replace(/^Auto\s*/i, "").slice(0, 14),
          actions: a.actions_taken,
        }));
        const enabledCount = automations.filter((a) => a.enabled).length;
        const disabledCount = automations.length - enabledCount;
        const statusData = [
          { name: "Enabled", value: enabledCount, color: "#22D3EE" },
          { name: "Disabled", value: disabledCount, color: "#374151" },
        ].filter((d) => d.value > 0);

        return (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader>
                <h3 className="text-sm font-semibold text-text-primary">Actions by Automation</h3>
              </CardHeader>
              <CardContent className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={typeData} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                    <XAxis dataKey="name" tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={DARK_TOOLTIP} labelStyle={{ color: '#D1D5DB' }} itemStyle={{ color: '#22D3EE' }} formatter={(value: any) => [value, "Actions"]} />
                    <Bar dataKey="actions" fill="#22D3EE" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <h3 className="text-sm font-semibold text-text-primary">Status Split</h3>
              </CardHeader>
              <CardContent className="h-56 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={72} dataKey="value" paddingAngle={3} stroke="none">
                      {statusData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={DARK_TOOLTIP} itemStyle={{ color: '#D1D5DB' }} formatter={(value: any, name: any) => [value, name]} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
              <div className="px-6 pb-4 flex justify-center gap-4">
                {statusData.map((d) => (
                  <div key={d.name} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="text-xs text-text-muted">{d.name} ({d.value})</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        );
      })()}

      {/* Automation Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {automations.map((automation) => {
          const config = automationConfig[automation.type] || automationConfig.auto_pricing;
          const Icon = config.icon;
          const isRunning = running === automation.id || running === "all";
          const recentlyRan =
            automation.last_run &&
            Date.now() - new Date(automation.last_run).getTime() < 300_000; // 5 mins

          return (
            <Card key={automation.id} className="relative overflow-hidden">
              <CardContent className="py-5">
                {/* Top row: icon + toggle */}
                <div className="flex items-start justify-between mb-3">
                  <div className={cn("p-2.5 rounded-lg", config.bg)}>
                    <Icon className={cn("w-5 h-5", config.accent)} />
                  </div>
                  <button
                    onClick={() => handleToggle(automation.id)}
                    className={cn(
                      "relative w-10 h-5 rounded-full transition-colors",
                      automation.enabled ? "bg-emerald-500" : "bg-bastet-border"
                    )}
                    aria-label={`Toggle ${automation.name}`}
                    role="switch"
                    aria-checked={automation.enabled}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform",
                        automation.enabled && "translate-x-5"
                      )}
                    />
                  </button>
                </div>

                {/* Name + description */}
                <h3 className="text-sm font-semibold text-text-primary mb-1">
                  {automation.name}
                </h3>
                <p className="text-xs text-text-muted leading-relaxed mb-4 line-clamp-2">
                  {automation.description}
                </p>

                {/* Stats row */}
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex items-center gap-1.5">
                    <Zap className="w-3 h-3 text-text-muted" />
                    <span className="text-xs font-mono text-text-secondary">
                      {automation.actions_taken}
                    </span>
                    <span className="text-[10px] text-text-muted">actions</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-text-muted" />
                    <span className="text-xs text-text-secondary">
                      {automation.last_run
                        ? relativeTime(automation.last_run)
                        : "Never run"}
                    </span>
                  </div>
                </div>

                {/* Run button + status */}
                <div className="flex items-center justify-between">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleRunSingle(automation.id)}
                    disabled={!automation.enabled || running !== null}
                  >
                    {isRunning ? (
                      <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                    ) : (
                      <Play className="w-3 h-3 mr-1.5" />
                    )}
                    {isRunning ? "Running" : "Run Now"}
                  </Button>

                  {recentlyRan && (
                    <div className="flex items-center gap-1.5">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                      </span>
                      <span className="text-[10px] text-emerald-400 font-medium">
                        Active
                      </span>
                    </div>
                  )}

                  {!automation.enabled && (
                    <Badge className="bg-bastet-border/50 text-text-muted text-[10px]">
                      Disabled
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Automation Log */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-bastet-gold" />
            <h3 className="text-lg font-semibold text-text-primary">
              Automation Log
            </h3>
          </div>
          {log.length > 0 && (
            <span className="text-xs text-text-muted">
              {log.length} event{log.length !== 1 ? "s" : ""}
            </span>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {log.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Workflow className="w-8 h-8 text-bastet-border mx-auto mb-3" />
              <p className="text-sm text-text-muted">
                No automation events yet. Run automations to see results here.
              </p>
            </div>
          ) : (
            <div className="max-h-[520px] overflow-y-auto divide-y divide-bastet-border">
              {log.map((entry, i) => {
                const config =
                  automationConfig[
                    automations.find((a) => a.id === entry.automation_id)?.type || ""
                  ] || automationConfig.auto_pricing;

                return (
                  <div
                    key={`${entry.timestamp}-${i}`}
                    className="px-6 py-3.5 flex items-start gap-3 hover:bg-bastet-bg/50 transition-colors"
                  >
                    {/* Timeline dot */}
                    <div className="flex flex-col items-center pt-1">
                      {getActionIcon(entry.action)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span
                          className={cn(
                            "text-[10px] font-semibold uppercase tracking-wider",
                            config.accent
                          )}
                        >
                          {entry.automation_name}
                        </span>
                        <ChevronRight className="w-3 h-3 text-bastet-border" />
                        <span className="text-[10px] font-mono text-text-muted">
                          {entry.action}
                        </span>
                      </div>
                      <p className="text-xs text-text-secondary leading-relaxed">
                        {entry.description}
                      </p>
                      {entry.impact && (
                        <p className="text-[11px] text-text-muted mt-1 italic">
                          Impact: {entry.impact}
                        </p>
                      )}
                    </div>

                    {/* Timestamp */}
                    <span className="text-[10px] font-mono text-text-muted shrink-0 pt-0.5">
                      {relativeTime(entry.timestamp)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
