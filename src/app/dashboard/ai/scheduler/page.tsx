"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Timer,
  Play,
  Pause,
  Loader2,
  Brain,
  Workflow,
  Sparkles,
  Clock,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SchedulerStatus {
  enabled: boolean;
  interval_minutes: number;
  last_run: string | null;
  total_cycles: number;
  is_running: boolean;
  brain_config: {
    mode: string;
    enabled: boolean;
  };
}

interface CycleResult {
  brain: { decisions?: number; mode?: string; summary?: string; skipped?: string; error?: string };
  automations: { ran?: number; total_actions?: number; error?: string };
  insights_count: number;
  duration_ms: number;
  timestamp: string;
}

export default function SchedulerPage() {
  const [status, setStatus] = useState<SchedulerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<CycleResult | null>(null);
  const [interval, setInterval] = useState(15);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/ai/scheduler");
      const json = await res.json();
      setStatus(json.data);
      setInterval(json.data?.interval_minutes || 15);
    } catch {
      /* — */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const doAction = async (action: string, extra?: Record<string, unknown>) => {
    setRunning(true);
    try {
      const res = await fetch("/api/v1/ai/scheduler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const json = await res.json();
      if (action === "run_now") {
        setLastResult(json.data);
      }
      await fetchStatus();
    } catch {
      /* — */
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-bastet-gold" />
      </div>
    );
  }

  const isActive = status?.enabled && status?.is_running;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Timer className="w-6 h-6 text-bastet-gold" />
            <h1 className="text-xl md:text-2xl font-display font-bold text-text-primary">
              AI Scheduler
            </h1>
          </div>
          <p className="text-sm text-text-secondary mt-1">
            Autonomous cycle — brain + automations + insights run automatically
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isActive ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-status-success/10 border border-status-success/20">
              <span className="w-2 h-2 rounded-full bg-status-success animate-pulse" />
              <span className="text-xs font-medium text-status-success">
                Running every {status?.interval_minutes}m
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-text-muted/10 border border-text-muted/20">
              <span className="w-2 h-2 rounded-full bg-text-muted" />
              <span className="text-xs font-medium text-text-muted">Stopped</span>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent>
            <p className="text-xs text-text-muted">Status</p>
            <p className={cn(
              "text-lg font-bold mt-1",
              isActive ? "text-status-success" : "text-text-muted"
            )}>
              {isActive ? "Active" : "Stopped"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs text-text-muted">Interval</p>
            <p className="text-lg font-bold text-text-primary mt-1">
              {status?.interval_minutes || 15} min
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs text-text-muted">Total Cycles</p>
            <p className="text-lg font-bold font-mono text-text-primary mt-1">
              {status?.total_cycles || 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs text-text-muted">Last Run</p>
            <p className="text-sm font-medium text-text-primary mt-1">
              {status?.last_run
                ? new Date(status.last_run).toLocaleTimeString()
                : "Never"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-text-primary">Controls</h3>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            {isActive ? (
              <Button
                variant="danger"
                onClick={() => doAction("stop")}
                disabled={running}
              >
                <Pause className="w-4 h-4 mr-2" />
                Stop Scheduler
              </Button>
            ) : (
              <Button onClick={() => doAction("start")} disabled={running}>
                <Play className="w-4 h-4 mr-2" />
                Start Scheduler
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => doAction("run_now")}
              disabled={running}
            >
              {running ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              {running ? "Running..." : "Run Now"}
            </Button>
          </div>

          {/* Interval selector */}
          <div className="flex items-center gap-3">
            <label className="text-sm text-text-secondary">Cycle every:</label>
            <select
              value={interval}
              onChange={(e) => {
                const mins = parseInt(e.target.value);
                setInterval(mins);
                doAction("set_interval", { interval_minutes: mins });
              }}
              className="bg-bastet-bg border border-bastet-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-bastet-gold/40"
            >
              <option value={5}>5 minutes</option>
              <option value={10}>10 minutes</option>
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={60}>60 minutes</option>
            </select>
          </div>

          {/* What runs each cycle */}
          <div className="pt-4 border-t border-bastet-border">
            <p className="text-xs text-text-muted uppercase tracking-wider mb-3">
              Each cycle runs:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-bastet-bg border border-bastet-border">
                <Brain className="w-4 h-4 text-bastet-gold" />
                <div>
                  <p className="text-sm font-medium text-text-primary">AI Brain</p>
                  <p className="text-xs text-text-muted">
                    {status?.brain_config?.enabled
                      ? `${status.brain_config.mode} mode`
                      : "Disabled"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-bastet-bg border border-bastet-border">
                <Workflow className="w-4 h-4 text-bastet-gold" />
                <div>
                  <p className="text-sm font-medium text-text-primary">5 Automations</p>
                  <p className="text-xs text-text-muted">Pricing, HK, Maint, VIP, Energy</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-bastet-bg border border-bastet-border">
                <Sparkles className="w-4 h-4 text-bastet-gold" />
                <div>
                  <p className="text-sm font-medium text-text-primary">Fresh Insights</p>
                  <p className="text-xs text-text-muted">AI Command Centre updated</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Last Cycle Result */}
      {lastResult && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <h3 className="text-lg font-semibold text-text-primary">
              Last Cycle Result
            </h3>
            <span className="text-xs font-mono text-text-muted">
              {lastResult.duration_ms}ms
            </span>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Brain */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-bastet-bg border border-bastet-border">
              <Brain className="w-5 h-5 text-bastet-gold mt-0.5" />
              <div>
                <p className="text-sm font-medium text-text-primary">AI Brain</p>
                {lastResult.brain.skipped ? (
                  <p className="text-xs text-text-muted">{lastResult.brain.skipped}</p>
                ) : lastResult.brain.error ? (
                  <p className="text-xs text-status-error">{lastResult.brain.error}</p>
                ) : (
                  <>
                    <p className="text-xs text-text-secondary">
                      {lastResult.brain.decisions} decisions ({lastResult.brain.mode} mode)
                    </p>
                    {lastResult.brain.summary && (
                      <p className="text-xs text-text-muted mt-1 italic">
                        {lastResult.brain.summary}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Automations */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-bastet-bg border border-bastet-border">
              <Workflow className="w-5 h-5 text-bastet-gold mt-0.5" />
              <div>
                <p className="text-sm font-medium text-text-primary">Automations</p>
                {lastResult.automations.error ? (
                  <p className="text-xs text-status-error">{lastResult.automations.error}</p>
                ) : (
                  <p className="text-xs text-text-secondary">
                    {lastResult.automations.ran} ran, {lastResult.automations.total_actions} actions taken
                  </p>
                )}
              </div>
            </div>

            {/* Insights */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-bastet-bg border border-bastet-border">
              <Sparkles className="w-5 h-5 text-bastet-gold mt-0.5" />
              <div>
                <p className="text-sm font-medium text-text-primary">Insights</p>
                <p className="text-xs text-text-secondary">
                  {lastResult.insights_count} insights generated
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <CheckCircle className="w-4 h-4 text-status-success" />
              <p className="text-xs text-status-success">
                Cycle completed at{" "}
                {new Date(lastResult.timestamp).toLocaleTimeString()}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info */}
      <Card>
        <CardContent>
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-text-muted mt-0.5" />
            <div>
              <p className="text-sm text-text-secondary">
                The scheduler runs AI Brain + 5 Automations + Insight Generation on a timer.
                When the scheduler is active, HospitAI thinks autonomously — observing property
                state and taking action without waiting for someone to click a button.
              </p>
              <p className="text-xs text-text-muted mt-2">
                Note: The scheduler resets when the server redeploys. For production, use
                Vercel Cron Jobs or an external scheduler service.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
