"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatCard } from "@/components/dashboard/widgets/stat-card";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  Wallet,
  PlaneTakeoff,
  PlaneLanding,
  Wrench,
  Sparkles,
  Loader2,
  Brain,
  Zap,
  TrendingUp,
  AlertTriangle,
  Star,
  Users,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface DashboardStats {
  occupancy_percentage: number;
  occupancy_trend: number;
  revenue_today_gbp: number;
  arrivals_today: number;
  departures_today: number;
  open_maintenance: number;
  urgent_maintenance: number;
  housekeeping_clean: number;
  housekeeping_dirty: number;
  housekeeping_in_progress: number;
  total_apartments: number;
  recent_bookings: {
    id: string;
    reference: string;
    status: string;
    nights: number;
    guest?: { first_name: string; last_name: string } | null;
    apartment?: { number: string } | null;
  }[];
}

interface AIBrainStatus {
  last_cycle_time?: string;
  mode?: string;
  decisions_pending?: number;
}

interface EnergySavings {
  daily_savings_potential_gbp?: number;
  waste_kwh?: number;
}

interface RevenueOpportunity {
  adr_gbp?: number;
  revpar_gbp?: number;
  channel_optimization_savings_gbp?: number;
}

interface AIInsight {
  id: string;
  title: string;
  severity: string;
  impact: string;
}

interface GuestAlerts {
  vip_arrivals_today?: number;
  at_risk_guests?: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [brainStatus, setBrainStatus] = useState<AIBrainStatus | null>(null);
  const [energySavings, setEnergySavings] = useState<EnergySavings | null>(null);
  const [revenueOpp, setRevenueOpp] = useState<RevenueOpportunity | null>(null);
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [guestAlerts, setGuestAlerts] = useState<GuestAlerts | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch("/api/v1/dashboard/stats");
        const json = await res.json();
        setStats(json.data);
      } catch {
        // Silently handle
      } finally {
        setLoading(false);
      }
    };
    fetchStats();

    // Fetch AI cross-data in parallel — all fail gracefully
    const fetchAI = async () => {
      try {
        const res = await fetch("/api/v1/ai/brain");
        const json = await res.json();
        setBrainStatus(json.data || json);
      } catch { /* — */ }
    };
    const fetchEnergy = async () => {
      try {
        const res = await fetch("/api/v1/ai/energy");
        const json = await res.json();
        const d = json.data || json;
        setEnergySavings({
          daily_savings_potential_gbp: d.overview?.daily_savings_potential_gbp ?? d.daily_savings_potential_gbp,
          waste_kwh: d.overview?.waste_kwh ?? d.waste_kwh,
        });
      } catch { /* — */ }
    };
    const fetchRevenue = async () => {
      try {
        const res = await fetch("/api/v1/ai/revenue");
        const json = await res.json();
        const d = json.data || json;
        setRevenueOpp({
          adr_gbp: d.adr_gbp ?? d.adr,
          revpar_gbp: d.revpar_gbp ?? d.revpar,
          channel_optimization_savings_gbp: d.channel_optimization_savings_gbp ?? d.channel_savings,
        });
      } catch { /* — */ }
    };
    const fetchInsights = async () => {
      try {
        const res = await fetch("/api/v1/ai/insights");
        const json = await res.json();
        const list = json.data || json.insights || [];
        setInsights(Array.isArray(list) ? list.slice(0, 3) : []);
      } catch { /* — */ }
    };
    const fetchGuestAlerts = async () => {
      try {
        const res = await fetch("/api/v1/ai/guests");
        const json = await res.json();
        const d = json.data || json;
        setGuestAlerts({
          vip_arrivals_today: d.vip_arrivals_today ?? d.vip_arrivals ?? 0,
          at_risk_guests: d.at_risk_guests ?? d.at_risk ?? 0,
        });
      } catch { /* — */ }
    };

    fetchAI();
    fetchEnergy();
    fetchRevenue();
    fetchInsights();
    fetchGuestAlerts();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-bastet-gold" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-24">
        <p className="text-text-secondary">Failed to load dashboard data</p>
      </div>
    );
  }

  const totalRooms = stats.total_apartments || 200;

  const severityColor = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case "critical":
      case "high":
        return "bg-status-error/15 text-status-error";
      case "medium":
      case "warning":
        return "bg-status-warning/15 text-status-warning";
      default:
        return "bg-bastet-gold/15 text-bastet-gold";
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-text-primary">
          Dashboard
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          HospitAI — Bastet Hurghada
        </p>
      </div>

      {/* AI Intelligence Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* AI Brain Status */}
        <Card className="border-bastet-gold/20">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-bastet-gold/10 flex items-center justify-center">
                <Brain className="w-5 h-5 text-bastet-gold" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-text-muted">AI Brain Status</p>
                <p className="text-sm font-semibold text-text-primary capitalize">
                  {brainStatus?.mode || "—"}
                </p>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-text-muted">
                    Last cycle: {brainStatus?.last_cycle_time || "—"}
                  </span>
                  {(brainStatus?.decisions_pending ?? 0) > 0 && (
                    <span className="text-xs font-mono text-bastet-gold">
                      {brainStatus?.decisions_pending} pending
                    </span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Energy Savings */}
        <Card className="border-emerald-500/20">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <Zap className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-text-muted">Energy Savings</p>
                <p className="text-lg font-semibold font-mono text-emerald-400">
                  {energySavings?.daily_savings_potential_gbp != null
                    ? `${formatCurrency(energySavings.daily_savings_potential_gbp)}/day`
                    : "—"}
                </p>
                {(energySavings?.waste_kwh ?? 0) > 0 && (
                  <span className="text-xs text-red-400">
                    {energySavings!.waste_kwh} kWh wasted today
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Revenue Opportunity */}
        <Card className="border-cyan-500/20">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-bastet-gold" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-text-muted">Revenue Opportunity</p>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-text-secondary">
                    ADR: <span className="font-mono text-text-primary">{revenueOpp?.adr_gbp != null ? formatCurrency(revenueOpp.adr_gbp) : "—"}</span>
                  </span>
                  <span className="text-xs text-text-secondary">
                    RevPAR: <span className="font-mono text-text-primary">{revenueOpp?.revpar_gbp != null ? formatCurrency(revenueOpp.revpar_gbp) : "—"}</span>
                  </span>
                </div>
                {(revenueOpp?.channel_optimization_savings_gbp ?? 0) > 0 && (
                  <span className="text-xs text-emerald-400 mt-0.5 block">
                    Channel savings: {formatCurrency(revenueOpp!.channel_optimization_savings_gbp!)}
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          title="Occupancy"
          value={`${stats.occupancy_percentage}%`}
          trend={stats.occupancy_trend}
          subtitle="vs last week"
          icon={<Building2 className="w-5 h-5" />}
        />
        <StatCard
          title="Revenue Today"
          value={formatCurrency(stats.revenue_today_gbp)}
          subtitle="GBP"
          icon={<Wallet className="w-5 h-5" />}
        />
        <StatCard
          title="Arrivals Today"
          value={String(stats.arrivals_today)}
          subtitle="guests checking in"
          icon={<PlaneTakeoff className="w-5 h-5" />}
        />
        <StatCard
          title="Departures Today"
          value={String(stats.departures_today)}
          subtitle="guests checking out"
          icon={<PlaneLanding className="w-5 h-5" />}
        />
        <StatCard
          title="Maintenance"
          value={String(stats.open_maintenance)}
          subtitle={`${stats.urgent_maintenance} urgent`}
          icon={<Wrench className="w-5 h-5" />}
        />
        <StatCard
          title="Housekeeping"
          value={String(stats.housekeeping_dirty)}
          subtitle="rooms to clean"
          icon={<Sparkles className="w-5 h-5" />}
        />
      </div>

      {/* Recent Bookings + Housekeeping Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Bookings */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <h3 className="text-lg font-semibold text-text-primary">
              Recent Bookings
            </h3>
            <Link
              href="/dashboard/bookings"
              className="text-xs text-bastet-gold hover:underline"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-bastet-border">
                  <th className="text-left text-xs font-medium text-text-muted px-4 md:px-6 py-3">
                    Reference
                  </th>
                  <th className="text-left text-xs font-medium text-text-muted px-4 md:px-6 py-3">
                    Guest
                  </th>
                  <th className="text-left text-xs font-medium text-text-muted px-4 md:px-6 py-3">
                    Apt
                  </th>
                  <th className="text-left text-xs font-medium text-text-muted px-4 md:px-6 py-3">
                    Nights
                  </th>
                  <th className="text-left text-xs font-medium text-text-muted px-4 md:px-6 py-3">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {stats.recent_bookings.map((booking) => (
                  <tr
                    key={booking.id}
                    className="border-b border-bastet-border last:border-0 hover:bg-bastet-bg/50"
                  >
                    <td className="px-4 md:px-6 py-3 text-sm font-mono text-bastet-gold">
                      <Link href={`/dashboard/bookings/${booking.id}`} className="hover:underline">
                        {booking.reference}
                      </Link>
                    </td>
                    <td className="px-4 md:px-6 py-3 text-sm text-text-primary">
                      {booking.guest
                        ? `${booking.guest.first_name} ${booking.guest.last_name}`
                        : "—"}
                    </td>
                    <td className="px-4 md:px-6 py-3 text-sm text-text-secondary">
                      {booking.apartment?.number || "—"}
                    </td>
                    <td className="px-4 md:px-6 py-3 text-sm font-mono text-text-secondary">
                      {booking.nights}
                    </td>
                    <td className="px-4 md:px-6 py-3">
                      <Badge status={booking.status} variant="status" />
                    </td>
                  </tr>
                ))}
                {stats.recent_bookings.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 md:px-6 py-8 text-center text-sm text-text-muted">
                      No recent bookings
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          </CardContent>
        </Card>

        {/* Housekeeping Status */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-text-primary">
              Housekeeping Status
            </h3>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">Clean</span>
              <div className="flex items-center gap-2">
                <div className="w-24 md:w-48 h-2 bg-bastet-bg rounded-full overflow-hidden">
                  <div
                    className="h-full bg-status-success rounded-full"
                    style={{
                      width: `${(stats.housekeeping_clean / totalRooms) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-sm font-mono text-text-primary w-10 text-right">
                  {stats.housekeeping_clean}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">To Clean</span>
              <div className="flex items-center gap-2">
                <div className="w-24 md:w-48 h-2 bg-bastet-bg rounded-full overflow-hidden">
                  <div
                    className="h-full bg-status-warning rounded-full"
                    style={{
                      width: `${(stats.housekeeping_dirty / totalRooms) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-sm font-mono text-text-primary w-10 text-right">
                  {stats.housekeeping_dirty}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">In Progress</span>
              <div className="flex items-center gap-2">
                <div className="w-24 md:w-48 h-2 bg-bastet-bg rounded-full overflow-hidden">
                  <div
                    className="h-full bg-bastet-gold rounded-full"
                    style={{
                      width: `${(stats.housekeeping_in_progress / totalRooms) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-sm font-mono text-text-primary w-10 text-right">
                  {stats.housekeeping_in_progress}
                </span>
              </div>
            </div>

            <div className="pt-4 border-t border-bastet-border">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-mono font-bold text-status-success">
                    {stats.housekeeping_clean}
                  </p>
                  <p className="text-xs text-text-muted mt-1">Clean</p>
                </div>
                <div>
                  <p className="text-2xl font-mono font-bold text-status-warning">
                    {stats.housekeeping_dirty}
                  </p>
                  <p className="text-xs text-text-muted mt-1">To Clean</p>
                </div>
                <div>
                  <p className="text-2xl font-mono font-bold text-bastet-gold">
                    {stats.housekeeping_in_progress}
                  </p>
                  <p className="text-xs text-text-muted mt-1">In Progress</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Insights + Guest Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* AI Insights */}
        <div className="lg:col-span-2">
          <Card className="border-bastet-gold/10">
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-bastet-gold" />
                <h3 className="text-lg font-semibold text-text-primary">AI Insights</h3>
              </div>
              <Link
                href="/dashboard/ai"
                className="text-xs text-bastet-gold hover:underline"
              >
                Command Centre
              </Link>
            </CardHeader>
            <CardContent>
              {insights.length > 0 ? (
                <div className="space-y-3">
                  {insights.map((insight, idx) => (
                    <div
                      key={insight.id || idx}
                      className="flex items-start gap-3 p-3 rounded-lg bg-bastet-bg/50 border border-bastet-border"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-text-primary">
                            {insight.title}
                          </span>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium uppercase ${severityColor(insight.severity)}`}
                          >
                            {insight.severity}
                          </span>
                        </div>
                        {insight.impact && (
                          <p className="text-xs text-text-secondary mt-1">{insight.impact}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-muted py-4 text-center">
                  No active insights
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Guest Alerts */}
        <Card className="border-bastet-gold/10">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-bastet-gold" />
              <h3 className="text-lg font-semibold text-text-primary">Guest Alerts</h3>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-bastet-bg/50 border border-bastet-border">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-bastet-gold fill-bastet-gold" />
                <span className="text-sm text-text-secondary">VIP Arrivals Today</span>
              </div>
              <span className="text-lg font-mono font-bold text-bastet-gold">
                {guestAlerts?.vip_arrivals_today ?? "—"}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-bastet-bg/50 border border-bastet-border">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-status-warning" />
                <span className="text-sm text-text-secondary">At-Risk Guests</span>
              </div>
              <span className="text-lg font-mono font-bold text-status-warning">
                {guestAlerts?.at_risk_guests ?? "—"}
              </span>
            </div>
            <Link
              href="/dashboard/guests"
              className="block text-center text-xs text-bastet-gold hover:underline pt-2"
            >
              View all guests
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
