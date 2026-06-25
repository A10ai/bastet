"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, Eye, Filter, Loader2, Home, CheckCircle, Wrench } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { APARTMENT_STATUSES } from "@/lib/constants";
import type { Apartment } from "@/types";
import type { RechartsValue, RechartsName } from "@/types/recharts";

const floorLabel = (floor: number) => floor === 0 ? 'Ground' : `Floor ${floor}`;

const FLOOR_OPTIONS = [
  { value: 0, label: "Ground" },
  { value: 1, label: "Floor 1" },
  { value: 2, label: "Floor 2" },
  { value: 3, label: "Floor 3" },
  { value: 4, label: "Floor 4" },
];

interface ApartmentCrossData {
  [apartmentId: string]: {
    guest_name?: string;
    energy_status?: string;
    open_tasks?: number;
  };
}

export default function ApartmentsPage() {
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [floorFilter, setFloorFilter] = useState<string>("all");
  const [crossData, setCrossData] = useState<ApartmentCrossData>({});

  useEffect(() => {
    const fetchApartments = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/v1/apartments");
        const json = await res.json();
        const apts = json.data || [];
        setApartments(apts);

        // Fetch cross-data for apartments
        fetchCrossData(apts);
      } catch {
        setApartments([]);
      } finally {
        setLoading(false);
      }
    };
    fetchApartments();
  }, []);

  const fetchCrossData = async (apts: Apartment[]) => {
    const data: ApartmentCrossData = {};

    // Fetch current bookings (checked_in)
    try {
      const res = await fetch("/api/v1/bookings?status=checked_in&limit=500");
      const json = await res.json();
      const bookings = json.data || [];
      for (const b of bookings) {
        if (b.apartment_id && b.guest) {
          data[b.apartment_id] = {
            ...data[b.apartment_id],
            guest_name: `${b.guest.first_name} ${b.guest.last_name}`,
          };
        }
      }
    } catch { /* — */ }

    // Fetch housekeeping + maintenance task counts
    try {
      const [hkRes, mxRes] = await Promise.all([
        fetch("/api/v1/housekeeping").catch(() => null),
        fetch("/api/v1/maintenance").catch(() => null),
      ]);

      const taskCount: Record<string, number> = {};

      if (hkRes) {
        const hkJson = await hkRes.json();
        const tasks = hkJson.data || [];
        for (const t of tasks) {
          if (t.apartment_id && ["pending", "assigned", "in_progress"].includes(t.status)) {
            taskCount[t.apartment_id] = (taskCount[t.apartment_id] || 0) + 1;
          }
        }
      }

      if (mxRes) {
        const mxJson = await mxRes.json();
        const requests = mxJson.data || [];
        for (const r of requests) {
          if (r.apartment_id && ["open", "assigned", "in_progress"].includes(r.status)) {
            taskCount[r.apartment_id] = (taskCount[r.apartment_id] || 0) + 1;
          }
        }
      }

      for (const [aptId, count] of Object.entries(taskCount)) {
        data[aptId] = { ...data[aptId], open_tasks: count };
      }
    } catch { /* — */ }

    // Derive energy status per apartment
    for (const apt of apts) {
      const isOccupied = !!data[apt.id]?.guest_name;
      let energyStatus = "standby";
      if (isOccupied) {
        energyStatus = "active";
      } else {
        // Vacant — standby mode
        energyStatus = "standby";
      }
      data[apt.id] = { ...data[apt.id], energy_status: energyStatus };
    }

    setCrossData(data);
  };

  const filtered = apartments.filter((a) => {
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (floorFilter !== "all" && a.floor !== Number(floorFilter)) return false;
    return true;
  });

  const statusCounts = APARTMENT_STATUSES.reduce(
    (acc, s) => {
      acc[s] = apartments.filter((a) => a.status === s).length;
      return acc;
    },
    {} as Record<string, number>
  );

  // Chart: status breakdown donut
  const STATUS_COLORS: Record<string, string> = {
    available: "#22D3EE",
    occupied: "#34D399",
    maintenance: "#FBBF24",
    cleaning: "#A78BFA",
    blocked: "#F87171",
    out_of_service: "#6B7280",
  };

  const statusChartData = APARTMENT_STATUSES.map((s) => ({
    name: s.replace("_", " "),
    value: statusCounts[s] || 0,
    key: s,
  })).filter((d) => d.value > 0);

  // Chart: apartments by floor
  const floorCounts: Record<string, number> = {};
  for (const apt of apartments) {
    const label = floorLabel(apt.floor);
    floorCounts[label] = (floorCounts[label] || 0) + 1;
  }
  const floorChartData = Object.entries(floorCounts)
    .sort(([a], [b]) => {
      const fa = a === "Ground" ? 0 : parseInt(a.replace("Floor ", ""));
      const fb = b === "Ground" ? 0 : parseInt(b.replace("Floor ", ""));
      return fa - fb;
    })
    .map(([name, value]) => ({ name, value }));

  // Stat card helpers
  const totalCount = apartments.length;
  const occupiedCount = statusCounts["occupied"] || 0;
  const availableCount = statusCounts["available"] || 0;
  const maintenanceCount = (statusCounts["maintenance"] || 0) + (statusCounts["out_of_service"] || 0);

  const energyBadge = (status?: string) => {
    switch (status) {
      case "active":
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-bastet-gold/15 text-bastet-gold">Active</span>;
      case "waste":
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-status-error/15 text-status-error">Waste</span>;
      case "standby":
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-400/15 text-gray-400">Standby</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-text-primary">
            Apartments
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            {apartments.length} apartments
          </p>
        </div>
        <Button>
          <Building2 className="w-4 h-4 mr-2" />
          Add Apartment
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Floor Filter */}
        <div className="flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5 text-text-muted" />
          <select
            value={floorFilter}
            onChange={(e) => setFloorFilter(e.target.value)}
            className="bg-bastet-card border border-bastet-border rounded-lg text-xs text-text-primary px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-bastet-gold/50"
            aria-label="Filter by floor"
          >
            <option value="all">All Floors</option>
            {FLOOR_OPTIONS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        {/* Status Filter Pills */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setStatusFilter("all")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              statusFilter === "all"
                ? "bg-bastet-gold text-bastet-bg"
                : "bg-bastet-card border border-bastet-border text-text-secondary hover:text-text-primary"
            }`}
          >
            All ({apartments.length})
          </button>
          {APARTMENT_STATUSES.map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
                statusFilter === status
                  ? "bg-bastet-gold text-bastet-bg"
                  : "bg-bastet-card border border-bastet-border text-text-secondary hover:text-text-primary"
              }`}
            >
              {status.replace("_", " ")} ({statusCounts[status] || 0})
            </button>
          ))}
        </div>
      </div>

      {/* Stat Cards */}
      {!loading && apartments.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-cyan-400/10">
                  <Home className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-text-primary">{totalCount}</p>
                  <p className="text-xs text-text-muted">Total Units</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-400/10">
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-emerald-400">{occupiedCount}</p>
                  <p className="text-xs text-text-muted">Occupied</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-cyan-400/10">
                  <Building2 className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-cyan-400">{availableCount}</p>
                  <p className="text-xs text-text-muted">Available</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-400/10">
                  <Wrench className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-amber-400">{maintenanceCount}</p>
                  <p className="text-xs text-text-muted">Maintenance</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts */}
      {!loading && apartments.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Status Donut */}
          <Card>
            <CardContent className="pt-5 pb-4">
              <h3 className="text-sm font-semibold text-text-primary mb-3">Status Breakdown</h3>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {statusChartData.map((entry: Record<string, any>) => (
                        <Cell key={entry.key} fill={STATUS_COLORS[entry.key] || "#6B7280"} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1a1a2e",
                        border: "1px solid #2a2a4a",
                        borderRadius: "8px",
                        color: "#e2e8f0",
                        fontSize: "12px",
                      }}
                      formatter={(value: RechartsValue, name: RechartsName) => [value, String(name).charAt(0).toUpperCase() + String(name).slice(1)]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-3 justify-center">
                {statusChartData.map((entry: Record<string, any>) => (
                  <div key={entry.key} className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <span
                      className="w-2.5 h-2.5 rounded-full inline-block"
                      style={{ backgroundColor: STATUS_COLORS[entry.key] || "#6B7280" }}
                    />
                    <span className="capitalize">{entry.name}</span>
                    <span className="text-text-muted">({entry.value})</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Floor Bar Chart */}
          <Card>
            <CardContent className="pt-5 pb-4">
              <h3 className="text-sm font-semibold text-text-primary mb-3">Units by Floor</h3>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={floorChartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a4a" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1a1a2e",
                        border: "1px solid #2a2a4a",
                        borderRadius: "8px",
                        color: "#e2e8f0",
                        fontSize: "12px",
                      }}
                      formatter={(value: RechartsValue) => [value, "Units"]}
                    />
                    <Bar dataKey="value" fill="#22D3EE" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Apartments Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-bastet-gold" />
            </div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-bastet-border">
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Number</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Floor</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Type</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">View</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Bedrooms</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3 hidden md:table-cell">Booking</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3 hidden md:table-cell">Energy</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3 hidden md:table-cell">Tasks</th>
                  <th className="text-right text-xs font-medium text-text-muted px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((apt) => {
                  const cd = crossData[apt.id];
                  return (
                    <tr
                      key={apt.id}
                      className="border-b border-bastet-border last:border-0 hover:bg-bastet-bg/50 transition-colors"
                    >
                      <td className="px-6 py-3">
                        <span className="text-sm font-mono font-semibold text-bastet-gold">
                          {apt.number}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm text-text-primary">
                        {floorLabel(apt.floor)}
                      </td>
                      <td className="px-6 py-3 text-sm text-text-primary">
                        {apt.apartment_type?.name || "—"}
                      </td>
                      <td className="px-6 py-3 text-sm text-text-secondary capitalize">
                        {apt.view_type.replace("_", " ")}
                      </td>
                      <td className="px-6 py-3 text-sm font-mono text-text-secondary">
                        {apt.apartment_type?.bedrooms ?? "—"}
                      </td>
                      <td className="px-6 py-3">
                        <Badge status={apt.status} variant="status" />
                      </td>
                      <td className="px-6 py-3 hidden md:table-cell">
                        <span className={`text-sm ${cd?.guest_name ? "text-text-primary font-medium" : "text-text-muted"}`}>
                          {cd?.guest_name || "Available"}
                        </span>
                      </td>
                      <td className="px-6 py-3 hidden md:table-cell">
                        {energyBadge(cd?.energy_status)}
                      </td>
                      <td className="px-6 py-3 hidden md:table-cell">
                        {(cd?.open_tasks ?? 0) > 0 ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-mono font-bold bg-status-warning/15 text-status-warning">
                            {cd!.open_tasks}
                          </span>
                        ) : (
                          <span className="text-xs text-text-muted">0</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <Link
                          href={`/dashboard/apartments/${apt.id}`}
                          className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-bastet-gold transition-colors"
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
              <p className="text-sm text-text-secondary">
                No apartments match the current filter
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
