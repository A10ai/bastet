"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity,
  Zap,
  Clock,
  Loader2,
  ChevronDown,
  ChevronRight,
  Server,
  ArrowRight,
  Building2,
  Sparkles,
  Wrench,
  TrendingUp,
  Leaf,
  Users,
  CalendarDays,
  RefreshCw,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HandlerResult {
  handler: string;
  target_system: string;
  action: string;
  description: string;
  success: boolean;
  timestamp: string;
}

interface SystemEvent {
  id: string;
  type: string;
  source_system: string;
  payload: Record<string, unknown>;
  processed: boolean;
  results: HandlerResult[];
  created_at: string;
}

interface Stats {
  events_today: number;
  actions_triggered: number;
  systems_connected: number;
  avg_response_ms: number;
}

// ---------------------------------------------------------------------------
// Config: event type colours + icons
// ---------------------------------------------------------------------------

const eventTypeConfig: Record<
  string,
  { label: string; color: string; bg: string; icon: React.ComponentType<{ className?: string }> }
> = {
  "booking.checked_out": {
    label: "Checkout",
    color: "text-amber-400",
    bg: "bg-amber-400/10 border-amber-400/20",
    icon: CalendarDays,
  },
  "booking.checked_in": {
    label: "Check-in",
    color: "text-emerald-400",
    bg: "bg-emerald-400/10 border-emerald-400/20",
    icon: CalendarDays,
  },
  "booking.confirmed": {
    label: "Confirmed",
    color: "text-blue-400",
    bg: "bg-blue-400/10 border-blue-400/20",
    icon: CalendarDays,
  },
  "booking.cancelled": {
    label: "Cancelled",
    color: "text-red-400",
    bg: "bg-red-400/10 border-red-400/20",
    icon: CalendarDays,
  },
  "apartment.status_changed": {
    label: "Apt Status",
    color: "text-cyan-400",
    bg: "bg-cyan-400/10 border-cyan-400/20",
    icon: Building2,
  },
  "housekeeping.completed": {
    label: "HK Complete",
    color: "text-bastet-gold",
    bg: "bg-bastet-gold/10 border-bastet-gold/20",
    icon: Sparkles,
  },
  "housekeeping.created": {
    label: "HK Created",
    color: "text-bastet-gold",
    bg: "bg-bastet-gold/10 border-bastet-gold/20",
    icon: Sparkles,
  },
  "maintenance.created": {
    label: "Maint Created",
    color: "text-orange-400",
    bg: "bg-orange-400/10 border-orange-400/20",
    icon: Wrench,
  },
  "maintenance.resolved": {
    label: "Maint Resolved",
    color: "text-emerald-400",
    bg: "bg-emerald-400/10 border-emerald-400/20",
    icon: Wrench,
  },
  "occupancy.threshold_crossed": {
    label: "Occupancy",
    color: "text-violet-400",
    bg: "bg-violet-400/10 border-violet-400/20",
    icon: TrendingUp,
  },
  "guest.vip_arriving": {
    label: "VIP Arrival",
    color: "text-yellow-400",
    bg: "bg-yellow-400/10 border-yellow-400/20",
    icon: Users,
  },
  "pricing.rate_changed": {
    label: "Rate Change",
    color: "text-emerald-400",
    bg: "bg-emerald-400/10 border-emerald-400/20",
    icon: TrendingUp,
  },
  "energy.waste_detected": {
    label: "Energy Waste",
    color: "text-teal-400",
    bg: "bg-teal-400/10 border-teal-400/20",
    icon: Leaf,
  },
};

const targetSystemIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  housekeeping: Sparkles,
  apartments: Building2,
  energy: Leaf,
  pricing: TrendingUp,
  analytics: Activity,
  operations: Server,
  guest_experience: Users,
  bookings: CalendarDays,
  maintenance: Wrench,
  event_bus: Zap,
};

function getEventConfig(type: string) {
  return (
    eventTypeConfig[type] || {
      label: type,
      color: "text-text-secondary",
      bg: "bg-bastet-card border-bastet-border",
      icon: Zap,
    }
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EventBusPage() {
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const [stats, setStats] = useState<Stats>({
    events_today: 0,
    actions_triggered: 0,
    systems_connected: 0,
    avg_response_ms: 0,
  });
  const [registeredTypes, setRegisteredTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [emitting, setEmitting] = useState(false);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>("");
  const [filterSource, setFilterSource] = useState<string>("");

  // Fetch events
  const fetchEvents = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterType) params.set("type", filterType);
      if (filterSource) params.set("source", filterSource);
      params.set("limit", "50");

      const res = await fetch(`/api/v1/ai/events?${params.toString()}`);
      const json = await res.json();

      if (json.data) setEvents(json.data);
      if (json.stats) setStats(json.stats);
      if (json.registered_types) setRegisteredTypes(json.registered_types);
    } catch {
      // fail silently
    } finally {
      setLoading(false);
    }
  }, [filterType, filterSource]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Auto-refresh every 15 seconds
  useEffect(() => {
    const interval = setInterval(fetchEvents, 15_000);
    return () => clearInterval(interval);
  }, [fetchEvents]);

  // Emit test event
  const handleEmitTest = async () => {
    setEmitting(true);
    try {
      // Pick a random test event
      const testEvents = [
        {
          type: "booking.checked_out",
          source_system: "test",
          payload: { booking_id: "test-" + Date.now(), apartment_id: null, guest_id: null },
        },
        {
          type: "maintenance.created",
          source_system: "test",
          payload: { title: "Test HVAC issue", category: "hvac", priority: "normal" },
        },
        {
          type: "occupancy.threshold_crossed",
          source_system: "test",
          payload: { occupancy_percent: 88, direction: "above", threshold: 85 },
        },
        {
          type: "energy.waste_detected",
          source_system: "test",
          payload: { vacant_units_with_hvac: 12, estimated_daily_cost: 48.6 },
        },
      ];

      const testEvent = testEvents[Math.floor(Math.random() * testEvents.length)];

      await fetch("/api/v1/ai/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testEvent),
      });

      await fetchEvents();
    } catch {
      // fail silently
    } finally {
      setEmitting(false);
    }
  };

  // Unique source systems from loaded events
  const sourceSystems = Array.from(new Set(events.map((e) => e.source_system)));

  // ---------------------------------------------------
  // Loading state
  // ---------------------------------------------------
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Activity className="w-8 h-8 animate-pulse text-bastet-gold" />
        <p className="text-sm text-text-secondary">Loading event bus...</p>
      </div>
    );
  }

  // ---------------------------------------------------
  // Render
  // ---------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-bastet-gold" />
            <h1 className="text-xl md:text-2xl font-display font-bold text-text-primary">
              Event Bus
            </h1>
          </div>
          <p className="text-sm text-text-secondary mt-1">
            Cross-system intelligence — real-time event processing
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={fetchEvents}>
            <RefreshCw className="w-4 h-4 mr-1.5" />
            Refresh
          </Button>
          <Button onClick={handleEmitTest} disabled={emitting} size="sm">
            {emitting ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Zap className="w-4 h-4 mr-1.5" />
            )}
            {emitting ? "Emitting..." : "Test Event"}
          </Button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wider">
                  Events Today
                </p>
                <p className="text-2xl font-display font-bold text-text-primary mt-1">
                  {stats.events_today}
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-cyan-400/10">
                <Activity className="w-5 h-5 text-cyan-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wider">
                  Actions Triggered
                </p>
                <p className="text-2xl font-display font-bold text-text-primary mt-1">
                  {stats.actions_triggered}
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-emerald-400/10">
                <Zap className="w-5 h-5 text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wider">
                  Systems Connected
                </p>
                <p className="text-2xl font-display font-bold text-text-primary mt-1">
                  {stats.systems_connected}
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-violet-400/10">
                <Server className="w-5 h-5 text-violet-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wider">
                  Avg Response
                </p>
                <p className="text-2xl font-display font-bold text-text-primary mt-1">
                  {stats.avg_response_ms}
                  <span className="text-sm text-text-muted font-normal ml-1">ms</span>
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-amber-400/10">
                <Clock className="w-5 h-5 text-amber-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts: Events by Type + Timeline */}
      {events.length > 0 && (() => {
        const DARK_TOOLTIP = { backgroundColor: '#111827', border: '1px solid #1F2937', borderRadius: '8px' };
        // Events by type bar chart
        const typeCounts: Record<string, number> = {};
        events.forEach((e) => { typeCounts[e.type] = (typeCounts[e.type] || 0) + 1; });
        const typeData = Object.entries(typeCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([type, count]) => ({
            name: getEventConfig(type).label,
            count,
          }));

        // Event timeline: group events by hour
        const hourBuckets: Record<string, number> = {};
        events.forEach((e) => {
          const d = new Date(e.created_at);
          const key = `${d.getHours().toString().padStart(2, "0")}:00`;
          hourBuckets[key] = (hourBuckets[key] || 0) + 1;
        });
        const timelineData = Object.entries(hourBuckets)
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([hour, count]) => ({ hour, events: count }));

        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <h3 className="text-sm font-semibold text-text-primary">Events by Type</h3>
              </CardHeader>
              <CardContent className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={typeData} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                    <XAxis dataKey="name" tick={{ fill: '#9CA3AF', fontSize: 10 }} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={40} />
                    <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={DARK_TOOLTIP} labelStyle={{ color: '#D1D5DB' }} formatter={(value: any) => [value, "Events"]} />
                    <Bar dataKey="count" fill="#22D3EE" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <h3 className="text-sm font-semibold text-text-primary">Event Timeline</h3>
              </CardHeader>
              <CardContent className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timelineData} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                    <defs>
                      <linearGradient id="eventGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22D3EE" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#22D3EE" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="hour" tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={DARK_TOOLTIP} labelStyle={{ color: '#D1D5DB' }} formatter={(value: any) => [value, "Events"]} />
                    <Area type="monotone" dataKey="events" stroke="#22D3EE" strokeWidth={2} fill="url(#eventGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* Filter Bar */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-text-muted">
              <Filter className="w-4 h-4" />
              <span className="text-xs font-medium uppercase tracking-wider">
                Filters
              </span>
            </div>

            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-bastet-bg border border-bastet-border rounded-lg text-xs text-text-secondary px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-bastet-gold/50"
              aria-label="Filter by event type"
            >
              <option value="">All event types</option>
              {registeredTypes.map((t) => (
                <option key={t} value={t}>
                  {getEventConfig(t).label} ({t})
                </option>
              ))}
            </select>

            <select
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value)}
              className="bg-bastet-bg border border-bastet-border rounded-lg text-xs text-text-secondary px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-bastet-gold/50"
              aria-label="Filter by source system"
            >
              <option value="">All sources</option>
              {sourceSystems.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            {(filterType || filterSource) && (
              <button
                onClick={() => {
                  setFilterType("");
                  setFilterSource("");
                }}
                className="text-xs text-bastet-gold hover:text-cyan-300 transition-colors"
              >
                Clear filters
              </button>
            )}

            <span className="ml-auto text-xs text-text-muted">
              {events.length} event{events.length !== 1 ? "s" : ""} loaded
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Event Feed */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-bastet-gold" />
            <h3 className="text-lg font-semibold text-text-primary">
              Live Event Feed
            </h3>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-[10px] text-emerald-400 font-medium">
              Auto-refresh 15s
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {events.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <Activity className="w-10 h-10 text-bastet-border mx-auto mb-3" />
              <p className="text-sm text-text-muted mb-1">
                No events recorded yet
              </p>
              <p className="text-xs text-text-muted">
                Events will appear here when system actions occur (check-in, checkout, maintenance, etc.)
              </p>
            </div>
          ) : (
            <div className="max-h-[640px] overflow-y-auto divide-y divide-bastet-border">
              {events.map((event) => {
                const config = getEventConfig(event.type);
                const EventIcon = config.icon;
                const isExpanded = expandedEvent === event.id;
                const resultCount = Array.isArray(event.results)
                  ? event.results.length
                  : 0;

                return (
                  <div
                    key={event.id}
                    className="hover:bg-bastet-bg/30 transition-colors"
                  >
                    {/* Event row */}
                    <button
                      onClick={() =>
                        setExpandedEvent(isExpanded ? null : event.id)
                      }
                      className="w-full px-6 py-4 flex items-start gap-4 text-left"
                      aria-expanded={isExpanded}
                      aria-label={`Event: ${event.type}`}
                    >
                      {/* Icon */}
                      <div
                        className={cn(
                          "p-2 rounded-lg border flex-shrink-0 mt-0.5",
                          config.bg
                        )}
                      >
                        <EventIcon className={cn("w-4 h-4", config.color)} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge
                            className={cn(
                              "text-[10px] font-semibold border",
                              config.bg,
                              config.color
                            )}
                          >
                            {config.label}
                          </Badge>
                          <span className="text-[10px] font-mono text-text-muted">
                            {event.type}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-text-secondary">
                          <span className="flex items-center gap-1">
                            <Server className="w-3 h-3 text-text-muted" />
                            {event.source_system}
                          </span>
                          <span className="flex items-center gap-1">
                            <Zap className="w-3 h-3 text-text-muted" />
                            {resultCount} action{resultCount !== 1 ? "s" : ""}
                          </span>
                          {event.payload &&
                            Object.keys(event.payload).length > 0 && (
                              <span className="text-text-muted">
                                {Object.keys(event.payload).length} field
                                {Object.keys(event.payload).length !== 1
                                  ? "s"
                                  : ""}
                              </span>
                            )}
                        </div>
                      </div>

                      {/* Timestamp + expand */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[10px] font-mono text-text-muted">
                          {relativeTime(event.created_at)}
                        </span>
                        {resultCount > 0 &&
                          (isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-text-muted" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-text-muted" />
                          ))}
                      </div>
                    </button>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="px-6 pb-4 ml-14">
                        {/* Payload */}
                        {event.payload &&
                          Object.keys(event.payload).length > 0 && (
                            <div className="mb-3 p-3 bg-bastet-bg rounded-lg border border-bastet-border">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2">
                                Payload
                              </p>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                {Object.entries(event.payload).map(
                                  ([key, value]) => (
                                    <div key={key} className="flex gap-2">
                                      <span className="text-xs font-mono text-text-muted">
                                        {key}:
                                      </span>
                                      <span className="text-xs font-mono text-text-secondary truncate">
                                        {value === null
                                          ? "null"
                                          : String(value)}
                                      </span>
                                    </div>
                                  )
                                )}
                              </div>
                            </div>
                          )}

                        {/* Handler results */}
                        {Array.isArray(event.results) &&
                          event.results.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                                Actions Taken
                              </p>
                              {event.results.map(
                                (result: HandlerResult, idx: number) => {
                                  const TargetIcon =
                                    targetSystemIcons[result.target_system] ||
                                    Zap;
                                  return (
                                    <div
                                      key={`${result.handler}-${idx}`}
                                      className="flex items-start gap-3 p-2.5 bg-bastet-bg/50 rounded-lg"
                                    >
                                      <TargetIcon
                                        className={cn(
                                          "w-3.5 h-3.5 mt-0.5 flex-shrink-0",
                                          result.success
                                            ? "text-emerald-400"
                                            : "text-red-400"
                                        )}
                                      />
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-0.5">
                                          <span className="text-[10px] font-mono text-text-muted">
                                            {result.target_system}
                                          </span>
                                          <ArrowRight className="w-2.5 h-2.5 text-bastet-border" />
                                          <span className="text-[10px] font-mono text-text-muted">
                                            {result.action}
                                          </span>
                                        </div>
                                        <p className="text-xs text-text-secondary leading-relaxed">
                                          {result.description}
                                        </p>
                                      </div>
                                      <span
                                        className={cn(
                                          "text-[9px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0",
                                          result.success
                                            ? "bg-emerald-400/10 text-emerald-400"
                                            : "bg-red-400/10 text-red-400"
                                        )}
                                      >
                                        {result.success ? "OK" : "FAIL"}
                                      </span>
                                    </div>
                                  );
                                }
                              )}
                            </div>
                          )}
                      </div>
                    )}
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
