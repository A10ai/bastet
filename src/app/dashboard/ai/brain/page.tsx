"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Brain,
  Play,
  Shield,
  Zap,
  TrendingUp,
  Wrench,
  Lightbulb,
  Users,
  DollarSign,
  Settings2,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  BarChart3,
  Building2,
  CalendarCheck,
  CalendarMinus,
  Activity,
  Bolt,
} from "lucide-react";
import { cn, formatCurrency, timeAgo } from "@/lib/utils";
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
// Types (mirroring server types)
// ---------------------------------------------------------------------------

interface BrainDecision {
  id: string;
  category: "pricing" | "operations" | "energy" | "guest" | "maintenance" | "revenue";
  action: string;
  reasoning: string;
  confidence: number;
  impact_estimate: string;
  auto_executable: boolean;
  executed: boolean;
  approved: boolean | null;
  created_at: string;
  event_to_emit?: { type: string; payload: Record<string, unknown> };
}

interface BrainCycleResult {
  cycle_id: string;
  mode: "supervised" | "autonomous";
  timestamp: string;
  data_snapshot: Record<string, unknown>;
  decisions: BrainDecision[];
  summary: string;
}

interface BrainConfig {
  mode: "supervised" | "autonomous";
  enabled: boolean;
  cycle_interval_minutes: number;
  last_cycle: string | null;
  total_cycles: number;
  total_decisions: number;
  total_executed: number;
}

// ---------------------------------------------------------------------------
// Category config
// ---------------------------------------------------------------------------

const categoryConfig: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  pricing: { icon: DollarSign, color: "text-emerald-400", bg: "bg-emerald-400/10" },
  operations: { icon: Settings2, color: "text-cyan-400", bg: "bg-cyan-400/10" },
  energy: { icon: Bolt, color: "text-amber-400", bg: "bg-amber-400/10" },
  guest: { icon: Users, color: "text-violet-400", bg: "bg-violet-400/10" },
  maintenance: { icon: Wrench, color: "text-orange-400", bg: "bg-orange-400/10" },
  revenue: { icon: TrendingUp, color: "text-pink-400", bg: "bg-pink-400/10" },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AIBrainPage() {
  const [config, setConfig] = useState<BrainConfig | null>(null);
  const [history, setHistory] = useState<BrainCycleResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningCycle, setRunningCycle] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [expandedCycle, setExpandedCycle] = useState<string | null>(null);
  const [showSnapshot, setShowSnapshot] = useState(false);
  const [confirmAutonomous, setConfirmAutonomous] = useState(false);

  const fetchBrainData = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/ai/brain");
      const json = await res.json();
      if (json.data) {
        setConfig(json.data.config);
        setHistory(json.data.history || []);
      }
    } catch (err) {
      console.error("Failed to fetch brain data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBrainData();
  }, [fetchBrainData]);

  const runCycle = async () => {
    setRunningCycle(true);
    try {
      const res = await fetch("/api/v1/ai/brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_cycle" }),
      });
      const json = await res.json();
      if (json.data) {
        // Refresh all data
        await fetchBrainData();
      }
    } catch (err) {
      console.error("Failed to run brain cycle:", err);
    } finally {
      setRunningCycle(false);
    }
  };

  const updateConfig = async (updates: Partial<BrainConfig>) => {
    try {
      const res = await fetch("/api/v1/ai/brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_config", config: updates }),
      });
      const json = await res.json();
      if (json.data?.config) setConfig(json.data.config);
    } catch (err) {
      console.error("Failed to update config:", err);
    }
  };

  const approveDecision = async (decisionId: string) => {
    setPendingAction(decisionId);
    try {
      await fetch("/api/v1/ai/brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", decision_id: decisionId }),
      });
      await fetchBrainData();
    } catch (err) {
      console.error("Failed to approve:", err);
    } finally {
      setPendingAction(null);
    }
  };

  const rejectDecision = async (decisionId: string) => {
    setPendingAction(decisionId);
    try {
      await fetch("/api/v1/ai/brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", decision_id: decisionId }),
      });
      await fetchBrainData();
    } catch (err) {
      console.error("Failed to reject:", err);
    } finally {
      setPendingAction(null);
    }
  };

  const latestCycle = history.length > 0 ? history[0] : null;
  const pastCycles = history.slice(1);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
          <p className="text-text-secondary text-sm">Loading AI Brain...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* A. Brain Status Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className={cn(
              "w-14 h-14 rounded-2xl flex items-center justify-center",
              config?.enabled
                ? config.mode === "autonomous"
                  ? "bg-amber-400/10"
                  : "bg-emerald-400/10"
                : "bg-red-400/10"
            )}>
              <Brain className={cn(
                "w-7 h-7",
                config?.enabled
                  ? config.mode === "autonomous"
                    ? "text-amber-400"
                    : "text-emerald-400"
                  : "text-red-400"
              )} />
            </div>
            {/* Pulsing indicator */}
            <span className={cn(
              "absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-bastet-card",
              config?.enabled
                ? config.mode === "autonomous"
                  ? "bg-amber-400 animate-pulse"
                  : "bg-emerald-400 animate-pulse"
                : "bg-red-400"
            )} />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-white">
              HospitAI Brain
            </h1>
            <p className="text-text-secondary text-sm">
              {config?.enabled
                ? config.mode === "autonomous"
                  ? "Autonomous mode — AI is making decisions automatically"
                  : "Supervised mode — decisions require human approval"
                : "Brain is disabled"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Mode toggle */}
          <div className="flex items-center bg-bastet-bg rounded-lg p-1">
            <button
              onClick={() => updateConfig({ mode: "supervised" })}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                config?.mode === "supervised"
                  ? "bg-emerald-400/15 text-emerald-400"
                  : "text-text-muted hover:text-text-secondary"
              )}
            >
              <Shield className="w-3.5 h-3.5" />
              Supervised
            </button>
            <button
              onClick={() => {
                if (config?.mode !== "autonomous") {
                  setConfirmAutonomous(true);
                }
              }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                config?.mode === "autonomous"
                  ? "bg-amber-400/15 text-amber-400"
                  : "text-text-muted hover:text-text-secondary"
              )}
            >
              <Zap className="w-3.5 h-3.5" />
              Autonomous
            </button>
          </div>

          {/* Run Cycle Button */}
          <button
            onClick={runCycle}
            disabled={runningCycle || !config?.enabled}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              runningCycle
                ? "bg-cyan-400/10 text-cyan-400 cursor-wait"
                : config?.enabled
                  ? "bg-cyan-400 text-bastet-bg hover:bg-cyan-300"
                  : "bg-bastet-bg text-text-muted cursor-not-allowed"
            )}
          >
            {runningCycle ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Running Cycle...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Run Brain Cycle
              </>
            )}
          </button>
        </div>
      </div>

      {/* Autonomous confirmation dialog */}
      {confirmAutonomous && (
        <Card className="border-amber-400/30 bg-amber-400/5">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="text-white font-medium text-sm">Enable Autonomous Mode?</h3>
                <p className="text-text-secondary text-xs mt-1">
                  In autonomous mode, the AI Brain will automatically execute decisions with high confidence
                  without human approval. This includes rate changes, energy optimization, and VIP preparations.
                  You can switch back to supervised mode at any time.
                </p>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => {
                      updateConfig({ mode: "autonomous" });
                      setConfirmAutonomous(false);
                    }}
                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-amber-400/15 text-amber-400 hover:bg-amber-400/25 transition-colors"
                  >
                    Enable Autonomous
                  </button>
                  <button
                    onClick={() => setConfirmAutonomous(false)}
                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-bastet-bg text-text-secondary hover:text-text-primary transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-3">
            <p className="text-text-muted text-xs">Last Cycle</p>
            <p className="text-white font-medium text-sm mt-0.5">
              {config?.last_cycle ? timeAgo(config.last_cycle) : "Never"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-text-muted text-xs">Total Cycles</p>
            <p className="text-white font-medium text-sm mt-0.5">{config?.total_cycles || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-text-muted text-xs">Decisions Made</p>
            <p className="text-white font-medium text-sm mt-0.5">{config?.total_decisions || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-text-muted text-xs">Executed</p>
            <p className="text-white font-medium text-sm mt-0.5">{config?.total_executed || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts: Decisions by Category + Confidence Distribution */}
      {history.length > 0 && (() => {
        const DARK_TOOLTIP = { backgroundColor: '#111827', border: '1px solid #1F2937', borderRadius: '8px' };
        const allDecisions = history.flatMap((c) => c.decisions);
        const CATEGORY_COLORS: Record<string, string> = {
          pricing: "#34D399", operations: "#22D3EE", energy: "#FBBF24",
          guest: "#A78BFA", maintenance: "#FB923C", revenue: "#F472B6",
        };
        const catCounts: Record<string, number> = {};
        allDecisions.forEach((d) => { catCounts[d.category] = (catCounts[d.category] || 0) + 1; });
        const catData = Object.entries(catCounts).map(([cat, count]) => ({
          name: cat.charAt(0).toUpperCase() + cat.slice(1),
          count,
          fill: CATEGORY_COLORS[cat] || "#22D3EE",
        }));

        const confBuckets = [
          { name: "<50%", min: 0, max: 50, color: "#EF4444" },
          { name: "50-74%", min: 50, max: 75, color: "#FBBF24" },
          { name: "75-89%", min: 75, max: 90, color: "#22D3EE" },
          { name: "90%+", min: 90, max: 101, color: "#34D399" },
        ];
        const confData = confBuckets.map((b) => ({
          name: b.name,
          value: allDecisions.filter((d) => d.confidence >= b.min && d.confidence < b.max).length,
          color: b.color,
        })).filter((d) => d.value > 0);

        return (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader>
                <h3 className="text-sm font-semibold text-white">Decisions by Category</h3>
              </CardHeader>
              <CardContent className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={catData} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                    <XAxis dataKey="name" tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={DARK_TOOLTIP} labelStyle={{ color: '#D1D5DB' }} formatter={(value: any) => [value, "Decisions"]} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {catData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <h3 className="text-sm font-semibold text-white">Confidence Distribution</h3>
              </CardHeader>
              <CardContent className="h-56 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={confData} cx="50%" cy="50%" innerRadius={50} outerRadius={72} dataKey="value" paddingAngle={3} stroke="none">
                      {confData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={DARK_TOOLTIP} itemStyle={{ color: '#D1D5DB' }} formatter={(value: any, name: any) => [value, name]} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
              <div className="px-6 pb-4 flex flex-wrap justify-center gap-3">
                {confData.map((d) => (
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

      {/* C. Brain Summary */}
      {latestCycle && (
        <Card className="border-cyan-400/20 bg-gradient-to-br from-cyan-400/5 to-transparent">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-cyan-400/10 flex items-center justify-center flex-shrink-0">
                <Lightbulb className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <p className="text-xs text-cyan-400 font-medium mb-1">Brain Analysis</p>
                <p className="text-text-primary text-sm leading-relaxed">{latestCycle.summary}</p>
                <p className="text-text-muted text-xs mt-2">
                  Cycle {latestCycle.cycle_id.replace("cycle-", "#")} -- {latestCycle.mode} mode -- {timeAgo(latestCycle.timestamp)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* B. Current Decisions Panel */}
      {latestCycle && latestCycle.decisions.length > 0 && (
        <div>
          <h2 className="text-lg font-display font-semibold text-white mb-3">
            Current Decisions
            <span className="text-text-muted text-sm font-normal ml-2">
              ({latestCycle.decisions.length})
            </span>
          </h2>
          <div className="space-y-3">
            {latestCycle.decisions.map((decision) => (
              <DecisionCard
                key={decision.id}
                decision={decision}
                mode={latestCycle.mode}
                onApprove={() => approveDecision(decision.id)}
                onReject={() => rejectDecision(decision.id)}
                isPending={pendingAction === decision.id}
              />
            ))}
          </div>
        </div>
      )}

      {!latestCycle && (
        <Card>
          <CardContent className="py-12 text-center">
            <Brain className="w-12 h-12 text-text-muted mx-auto mb-3" />
            <h3 className="text-white font-medium">No brain cycles yet</h3>
            <p className="text-text-secondary text-sm mt-1">
              Click &ldquo;Run Brain Cycle&rdquo; to analyze your property and get AI-powered recommendations.
            </p>
          </CardContent>
        </Card>
      )}

      {/* D. Data Snapshot Preview */}
      {latestCycle && (
        <div>
          <button
            onClick={() => setShowSnapshot(!showSnapshot)}
            className="flex items-center gap-2 text-text-secondary hover:text-text-primary text-sm font-medium transition-colors mb-3"
          >
            {showSnapshot ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            Data Snapshot
          </button>
          {showSnapshot && (
            <SnapshotPreview snapshot={latestCycle.data_snapshot} />
          )}
        </div>
      )}

      {/* E. Brain History */}
      {pastCycles.length > 0 && (
        <div>
          <h2 className="text-lg font-display font-semibold text-white mb-3">
            Brain History
          </h2>
          <div className="space-y-2">
            {pastCycles.map((cycle) => (
              <Card key={cycle.cycle_id} className="hover:border-bastet-border/80 transition-colors">
                <CardContent className="py-3">
                  <button
                    onClick={() =>
                      setExpandedCycle(
                        expandedCycle === cycle.cycle_id ? null : cycle.cycle_id
                      )
                    }
                    className="w-full flex items-center justify-between text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn(
                        "w-2 h-2 rounded-full flex-shrink-0",
                        cycle.mode === "autonomous" ? "bg-amber-400" : "bg-emerald-400"
                      )} />
                      <div className="min-w-0">
                        <p className="text-white text-sm font-medium truncate">
                          {cycle.summary.slice(0, 100)}{cycle.summary.length > 100 ? "..." : ""}
                        </p>
                        <p className="text-text-muted text-xs mt-0.5">
                          {timeAgo(cycle.timestamp)} -- {cycle.mode} -- {cycle.decisions.length} decisions,{" "}
                          {cycle.decisions.filter((d) => d.executed).length} executed
                        </p>
                      </div>
                    </div>
                    {expandedCycle === cycle.cycle_id ? (
                      <ChevronDown className="w-4 h-4 text-text-muted flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-text-muted flex-shrink-0" />
                    )}
                  </button>

                  {expandedCycle === cycle.cycle_id && (
                    <div className="mt-3 pt-3 border-t border-bastet-border space-y-2">
                      {cycle.decisions.map((d) => (
                        <DecisionCard
                          key={d.id}
                          decision={d}
                          mode={cycle.mode}
                          onApprove={() => approveDecision(d.id)}
                          onReject={() => rejectDecision(d.id)}
                          isPending={pendingAction === d.id}
                          compact
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* F. Brain Configuration */}
      <Card>
        <CardHeader>
          <h2 className="text-base font-display font-semibold text-white flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-text-muted" />
            Brain Configuration
          </h2>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Enable/Disable */}
            <div>
              <label className="text-text-secondary text-xs font-medium block mb-2">Status</label>
              <button
                onClick={() => updateConfig({ enabled: !config?.enabled })}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-colors",
                  config?.enabled
                    ? "border-emerald-400/30 bg-emerald-400/5 text-emerald-400"
                    : "border-red-400/30 bg-red-400/5 text-red-400"
                )}
              >
                <span>{config?.enabled ? "Enabled" : "Disabled"}</span>
                <div className={cn(
                  "w-8 h-4 rounded-full relative transition-colors",
                  config?.enabled ? "bg-emerald-400/30" : "bg-red-400/30"
                )}>
                  <div className={cn(
                    "w-3 h-3 rounded-full absolute top-0.5 transition-all",
                    config?.enabled ? "right-0.5 bg-emerald-400" : "left-0.5 bg-red-400"
                  )} />
                </div>
              </button>
            </div>

            {/* Mode */}
            <div>
              <label className="text-text-secondary text-xs font-medium block mb-2">Mode</label>
              <div className="px-3 py-2 rounded-lg border border-bastet-border bg-bastet-bg text-sm">
                <span className={cn(
                  config?.mode === "autonomous" ? "text-amber-400" : "text-emerald-400"
                )}>
                  {config?.mode === "autonomous" ? "Autonomous" : "Supervised"}
                </span>
                <p className="text-text-muted text-xs mt-0.5">
                  {config?.mode === "autonomous"
                    ? "AI executes high-confidence decisions automatically"
                    : "All decisions require human approval"}
                </p>
              </div>
            </div>

            {/* Cycle Interval */}
            <div>
              <label className="text-text-secondary text-xs font-medium block mb-2">Cycle Interval</label>
              <select
                value={config?.cycle_interval_minutes || 30}
                onChange={(e) => updateConfig({ cycle_interval_minutes: parseInt(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-bastet-border bg-bastet-bg text-text-primary text-sm focus:outline-none focus:border-cyan-400/50"
              >
                <option value={15}>Every 15 minutes</option>
                <option value={30}>Every 30 minutes</option>
                <option value={60}>Every 1 hour</option>
                <option value={0}>Manual only</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Decision Card
// ---------------------------------------------------------------------------

function DecisionCard({
  decision,
  mode,
  onApprove,
  onReject,
  isPending,
  compact = false,
}: {
  decision: BrainDecision;
  mode: "supervised" | "autonomous";
  onApprove: () => void;
  onReject: () => void;
  isPending: boolean;
  compact?: boolean;
}) {
  const cat = categoryConfig[decision.category] || categoryConfig.operations;
  const Icon = cat.icon;

  const confidenceColor =
    decision.confidence >= 75
      ? "bg-emerald-400"
      : decision.confidence >= 50
        ? "bg-amber-400"
        : "bg-red-400";

  const confidenceTextColor =
    decision.confidence >= 75
      ? "text-emerald-400"
      : decision.confidence >= 50
        ? "text-amber-400"
        : "text-red-400";

  const statusBadge = () => {
    if (decision.executed && decision.approved) {
      return (
        <Badge className="bg-emerald-400/10 text-emerald-400 border-emerald-400/20 text-xs">
          <CheckCircle className="w-3 h-3 mr-1" />
          {mode === "autonomous" ? "Auto-executed" : "Executed"}
        </Badge>
      );
    }
    if (decision.approved === false) {
      return (
        <Badge className="bg-red-400/10 text-red-400 border-red-400/20 text-xs">
          <XCircle className="w-3 h-3 mr-1" />
          Rejected
        </Badge>
      );
    }
    return (
      <Badge className="bg-amber-400/10 text-amber-400 border-amber-400/20 text-xs">
        <Clock className="w-3 h-3 mr-1" />
        Pending Approval
      </Badge>
    );
  };

  return (
    <Card className={cn(
      "transition-colors",
      decision.approved === null && !decision.executed && "border-amber-400/15 hover:border-amber-400/30"
    )}>
      <CardContent className={cn(compact ? "py-2.5" : "py-4")}>
        <div className="flex items-start gap-3">
          <div className={cn(
            "rounded-lg flex items-center justify-center flex-shrink-0",
            cat.bg,
            compact ? "w-8 h-8" : "w-10 h-10"
          )}>
            <Icon className={cn(cat.color, compact ? "w-4 h-4" : "w-5 h-5")} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={cn(cat.bg, cat.color, "border-0 text-xs capitalize")}>
                    {decision.category}
                  </Badge>
                  {statusBadge()}
                </div>
                <h3 className={cn(
                  "text-white font-medium mt-1.5",
                  compact ? "text-xs" : "text-sm"
                )}>
                  {decision.action}
                </h3>
              </div>
            </div>

            {!compact && (
              <p className="text-text-secondary text-xs mt-1.5 leading-relaxed">
                {decision.reasoning}
              </p>
            )}

            <div className={cn(
              "flex items-center gap-4 flex-wrap",
              compact ? "mt-1.5" : "mt-3"
            )}>
              {/* Confidence bar */}
              <div className="flex items-center gap-2">
                <span className="text-text-muted text-xs">Confidence</span>
                <div className="w-20 h-1.5 bg-bastet-bg rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", confidenceColor)}
                    style={{ width: `${decision.confidence}%` }}
                  />
                </div>
                <span className={cn("text-xs font-medium", confidenceTextColor)}>
                  {decision.confidence}%
                </span>
              </div>

              {/* Impact estimate */}
              {decision.impact_estimate && !compact && (
                <span className="text-text-muted text-xs">
                  Impact: {decision.impact_estimate}
                </span>
              )}
            </div>

            {/* Approve / Reject buttons for supervised pending decisions */}
            {decision.approved === null && !decision.executed && (
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={onApprove}
                  disabled={isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-emerald-400/10 text-emerald-400 hover:bg-emerald-400/20 transition-colors disabled:opacity-50"
                >
                  {isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <CheckCircle className="w-3 h-3" />
                  )}
                  Approve
                </button>
                <button
                  onClick={onReject}
                  disabled={isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-red-400/10 text-red-400 hover:bg-red-400/20 transition-colors disabled:opacity-50"
                >
                  {isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <XCircle className="w-3 h-3" />
                  )}
                  Reject
                </button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Snapshot Preview
// ---------------------------------------------------------------------------

function SnapshotPreview({ snapshot }: { snapshot: Record<string, unknown> }) {
  const s = snapshot as any;
  if (!s.occupancy) {
    return (
      <Card>
        <CardContent className="py-4">
          <p className="text-text-muted text-sm">No snapshot data available for this cycle.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <MiniStat
        icon={Building2}
        label="Occupancy"
        value={`${s.occupancy?.occupancy_percent || 0}%`}
        sub={`${s.occupancy?.occupied || 0} / ${s.occupancy?.total || 0} units`}
        color="text-cyan-400"
      />
      <MiniStat
        icon={DollarSign}
        label="Revenue Today"
        value={formatCurrency(s.revenue?.today || 0)}
        sub={`Week: ${formatCurrency(s.revenue?.this_week || 0)}`}
        color="text-emerald-400"
      />
      <MiniStat
        icon={CalendarCheck}
        label="Arrivals"
        value={String(s.arrivals?.count || 0)}
        sub={`${s.guest_alerts?.vip_arrivals?.length || 0} VIP`}
        color="text-violet-400"
      />
      <MiniStat
        icon={CalendarMinus}
        label="Departures"
        value={String(s.departures?.count || 0)}
        sub=""
        color="text-orange-400"
      />
      <MiniStat
        icon={Wrench}
        label="Maintenance"
        value={`${s.maintenance?.open || 0} open`}
        sub={`${s.maintenance?.urgent || 0} urgent`}
        color="text-red-400"
      />
      <MiniStat
        icon={Activity}
        label="Housekeeping"
        value={`${s.housekeeping?.pending || 0} pending`}
        sub={`${s.housekeeping?.in_progress || 0} in progress`}
        color="text-amber-400"
      />
      <MiniStat
        icon={Bolt}
        label="Energy"
        value={`${s.energy?.vacant_units || 0} vacant`}
        sub={`Est. waste: £${(s.energy?.estimated_daily_waste || 0).toFixed(0)}/day`}
        color="text-yellow-400"
      />
      <MiniStat
        icon={BarChart3}
        label="Rates"
        value={`${s.current_rates?.length || 0} types`}
        sub={s.current_rates?.[0] ? `From £${s.current_rates[0].rate}` : ""}
        color="text-pink-400"
      />
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="py-3">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={cn("w-3.5 h-3.5", color)} />
          <span className="text-text-muted text-xs">{label}</span>
        </div>
        <p className="text-white font-medium text-sm">{value}</p>
        {sub && <p className="text-text-muted text-xs mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}
