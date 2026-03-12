"use client";

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
} from "lucide-react";

// Mock data — will be replaced with real API calls
const MOCK_STATS = {
  occupancy: 72,
  occupancyTrend: 5.2,
  revenueToday: 4250,
  revenueWeek: 28400,
  arrivalsToday: 8,
  departuresToday: 5,
  openMaintenance: 3,
  urgentMaintenance: 1,
  housekeepingClean: 180,
  housekeepingDirty: 15,
  housekeepingInProgress: 5,
};

const RECENT_BOOKINGS = [
  { ref: "BAS-HRG-260001", guest: "James Wilson", apt: "A301", status: "checked_in", nights: 14 },
  { ref: "BAS-HRG-260002", guest: "Sarah Mueller", apt: "B205", status: "confirmed", nights: 7 },
  { ref: "BAS-HRG-260003", guest: "Ahmed Hassan", apt: "C102", status: "pending", nights: 3 },
  { ref: "BAS-HRG-260004", guest: "Elena Petrova", apt: "A505", status: "checked_in", nights: 28 },
  { ref: "BAS-HRG-260005", guest: "Tom Richards", apt: "B402", status: "confirmed", nights: 10 },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-text-primary">
          Dashboard
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Overview of Bastet Aparthotels — Hurghada
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          title="Occupancy"
          value={`${MOCK_STATS.occupancy}%`}
          trend={MOCK_STATS.occupancyTrend}
          subtitle="vs last week"
          icon={<Building2 className="w-5 h-5" />}
        />
        <StatCard
          title="Revenue Today"
          value={`£${MOCK_STATS.revenueToday.toLocaleString()}`}
          subtitle="GBP"
          icon={<Wallet className="w-5 h-5" />}
        />
        <StatCard
          title="Arrivals Today"
          value={String(MOCK_STATS.arrivalsToday)}
          subtitle="guests checking in"
          icon={<PlaneTakeoff className="w-5 h-5" />}
        />
        <StatCard
          title="Departures Today"
          value={String(MOCK_STATS.departuresToday)}
          subtitle="guests checking out"
          icon={<PlaneLanding className="w-5 h-5" />}
        />
        <StatCard
          title="Maintenance"
          value={String(MOCK_STATS.openMaintenance)}
          subtitle={`${MOCK_STATS.urgentMaintenance} urgent`}
          icon={<Wrench className="w-5 h-5" />}
        />
        <StatCard
          title="Housekeeping"
          value={String(MOCK_STATS.housekeepingDirty)}
          subtitle="rooms to clean"
          icon={<Sparkles className="w-5 h-5" />}
        />
      </div>

      {/* Recent Bookings + Housekeeping Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Bookings */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-text-primary">
              Recent Bookings
            </h3>
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
                {RECENT_BOOKINGS.map((booking) => (
                  <tr
                    key={booking.ref}
                    className="border-b border-bastet-border last:border-0 hover:bg-bastet-bg/50"
                  >
                    <td className="px-6 py-3 text-sm font-mono text-bastet-gold">
                      {booking.ref}
                    </td>
                    <td className="px-6 py-3 text-sm text-text-primary">
                      {booking.guest}
                    </td>
                    <td className="px-6 py-3 text-sm text-text-secondary">
                      {booking.apt}
                    </td>
                    <td className="px-6 py-3 text-sm font-mono text-text-secondary">
                      {booking.nights}
                    </td>
                    <td className="px-6 py-3">
                      <Badge status={booking.status} variant="status" />
                    </td>
                  </tr>
                ))}
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
                      width: `${(MOCK_STATS.housekeepingClean / 200) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-sm font-mono text-text-primary w-10 text-right">
                  {MOCK_STATS.housekeepingClean}
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
                      width: `${(MOCK_STATS.housekeepingDirty / 200) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-sm font-mono text-text-primary w-10 text-right">
                  {MOCK_STATS.housekeepingDirty}
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
                      width: `${(MOCK_STATS.housekeepingInProgress / 200) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-sm font-mono text-text-primary w-10 text-right">
                  {MOCK_STATS.housekeepingInProgress}
                </span>
              </div>
            </div>

            <div className="pt-4 border-t border-bastet-border">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-mono font-bold text-status-success">
                    {MOCK_STATS.housekeepingClean}
                  </p>
                  <p className="text-xs text-text-muted mt-1">Clean</p>
                </div>
                <div>
                  <p className="text-2xl font-mono font-bold text-status-warning">
                    {MOCK_STATS.housekeepingDirty}
                  </p>
                  <p className="text-xs text-text-muted mt-1">To Clean</p>
                </div>
                <div>
                  <p className="text-2xl font-mono font-bold text-bastet-gold">
                    {MOCK_STATS.housekeepingInProgress}
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
