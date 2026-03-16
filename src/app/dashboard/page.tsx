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

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

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
            <table className="w-full">
              <thead>
                <tr className="border-b border-bastet-border">
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">
                    Reference
                  </th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">
                    Guest
                  </th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">
                    Apt
                  </th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">
                    Nights
                  </th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">
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
                    <td className="px-6 py-3 text-sm font-mono text-bastet-gold">
                      <Link href={`/dashboard/bookings/${booking.id}`} className="hover:underline">
                        {booking.reference}
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-sm text-text-primary">
                      {booking.guest
                        ? `${booking.guest.first_name} ${booking.guest.last_name}`
                        : "—"}
                    </td>
                    <td className="px-6 py-3 text-sm text-text-secondary">
                      {booking.apartment?.number || "—"}
                    </td>
                    <td className="px-6 py-3 text-sm font-mono text-text-secondary">
                      {booking.nights}
                    </td>
                    <td className="px-6 py-3">
                      <Badge status={booking.status} variant="status" />
                    </td>
                  </tr>
                ))}
                {stats.recent_bookings.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-sm text-text-muted">
                      No recent bookings
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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
                <div className="w-48 h-2 bg-bastet-bg rounded-full overflow-hidden">
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
                <div className="w-48 h-2 bg-bastet-bg rounded-full overflow-hidden">
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
                <div className="w-48 h-2 bg-bastet-bg rounded-full overflow-hidden">
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
    </div>
  );
}
