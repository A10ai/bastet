"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  Loader2,
  Brain,
  Workflow,
  Activity,
  CalendarDays,
  Users,
  Sparkles,
  Wrench,
  Wallet,
  Zap,
  Settings,
  Lock,
  Server,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";

interface AuditEntry {
  id: string;
  user_id: string;
  user_email: string;
  action: string;
  category: string;
  resource_type: string | null;
  resource_id: string | null;
  description: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface AuditStats {
  total_entries: number;
  today_entries: number;
  by_category: Record<string, number>;
  recent_ai_decisions: number;
}

const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  ai_decision: Brain,
  ai_brain: Brain,
  automation: Workflow,
  booking: CalendarDays,
  guest: Users,
  housekeeping: Sparkles,
  maintenance: Wrench,
  finance: Wallet,
  energy: Zap,
  settings: Settings,
  auth: Lock,
  system: Server,
};

const categoryColors: Record<string, string> = {
  ai_decision: "text-purple-400 bg-purple-400/10",
  ai_brain: "text-purple-400 bg-purple-400/10",
  automation: "text-cyan-400 bg-cyan-400/10",
  booking: "text-blue-400 bg-blue-400/10",
  guest: "text-green-400 bg-green-400/10",
  housekeeping: "text-amber-400 bg-amber-400/10",
  maintenance: "text-orange-400 bg-orange-400/10",
  finance: "text-emerald-400 bg-emerald-400/10",
  energy: "text-yellow-400 bg-yellow-400/10",
  settings: "text-gray-400 bg-gray-400/10",
  auth: "text-red-400 bg-red-400/10",
  system: "text-indigo-400 bg-indigo-400/10",
};

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [logRes, statsRes] = await Promise.all([
        fetch(`/api/v1/audit?limit=100${categoryFilter !== "all" ? `&category=${categoryFilter}` : ""}`),
        fetch("/api/v1/audit?type=stats"),
      ]);
      const logJson = await logRes.json();
      const statsJson = await statsRes.json();
      setEntries(logJson.data?.entries || []);
      setStats(statsJson.data || null);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [categoryFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-bastet-gold" />
      </div>
    );
  }

  const categories = Object.keys(categoryColors);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Shield className="w-6 h-6 text-bastet-gold" />
          <h1 className="text-xl md:text-2xl font-display font-bold text-text-primary">
            Audit Trail
          </h1>
        </div>
        <p className="text-sm text-text-secondary mt-1">
          Every AI decision, human action, and system event — logged and traceable
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent>
            <p className="text-xs text-text-muted">Total Entries</p>
            <p className="text-2xl font-mono font-bold text-text-primary mt-1">
              {stats?.total_entries || 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs text-text-muted">Today</p>
            <p className="text-2xl font-mono font-bold text-text-primary mt-1">
              {stats?.today_entries || 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs text-text-muted">AI Decisions</p>
            <p className="text-2xl font-mono font-bold text-bastet-gold mt-1">
              {stats?.recent_ai_decisions || 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs text-text-muted">Categories</p>
            <p className="text-2xl font-mono font-bold text-text-primary mt-1">
              {Object.keys(stats?.by_category || {}).length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setCategoryFilter("all")}
          className={cn(
            "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
            categoryFilter === "all"
              ? "bg-bastet-gold text-bastet-bg"
              : "bg-bastet-card border border-bastet-border text-text-secondary hover:text-text-primary"
          )}
        >
          All ({stats?.total_entries || 0})
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={cn(
              "px-2.5 py-1 rounded-full text-xs font-medium capitalize transition-colors",
              categoryFilter === cat
                ? "bg-bastet-gold text-bastet-bg"
                : "bg-bastet-card border border-bastet-border text-text-secondary hover:text-text-primary"
            )}
          >
            {cat.replace("_", " ")} ({stats?.by_category?.[cat] || 0})
          </button>
        ))}
      </div>

      {/* Audit Log */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-text-primary">
            Audit Log ({entries.length} entries)
          </h3>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-bastet-border max-h-[600px] overflow-y-auto">
            {entries.map((entry) => {
              const Icon = categoryIcons[entry.category] || Server;
              const colorClass = categoryColors[entry.category] || "text-gray-400 bg-gray-400/10";
              const isExpanded = expandedId === entry.id;

              return (
                <div
                  key={entry.id}
                  className="px-4 py-3 hover:bg-bastet-bg/50 cursor-pointer transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5", colorClass)}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="default" className="text-[10px]">
                          {entry.category.replace("_", " ")}
                        </Badge>
                        <span className="text-xs text-text-muted">{entry.action}</span>
                        <span className="text-xs text-text-muted ml-auto shrink-0">
                          {timeAgo(entry.created_at)}
                        </span>
                      </div>
                      <p className="text-sm text-text-primary mt-1 line-clamp-2">
                        {entry.description}
                      </p>
                      <p className="text-xs text-text-muted mt-0.5">
                        by {entry.user_email}
                      </p>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="mt-3 p-3 rounded-lg bg-bastet-bg border border-bastet-border text-xs space-y-2">
                          {entry.resource_type && (
                            <div>
                              <span className="text-text-muted">Resource: </span>
                              <span className="text-text-primary font-mono">
                                {entry.resource_type}/{entry.resource_id?.slice(0, 8)}
                              </span>
                            </div>
                          )}
                          {entry.new_data && (
                            <div>
                              <span className="text-text-muted">Data: </span>
                              <pre className="text-text-secondary mt-1 whitespace-pre-wrap font-mono text-[11px]">
                                {JSON.stringify(entry.new_data, null, 2)}
                              </pre>
                            </div>
                          )}
                          <div>
                            <span className="text-text-muted">Time: </span>
                            <span className="text-text-primary">
                              {new Date(entry.created_at).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {entries.length === 0 && (
              <div className="py-12 text-center text-text-muted text-sm">
                No audit entries yet. Run a Brain Cycle or trigger an event to see entries.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
