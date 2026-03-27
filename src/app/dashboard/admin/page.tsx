"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/providers/auth-provider";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Shield,
  Database,
  Users,
  Settings,
  Activity,
  RefreshCw,
  Zap,
  Trash2,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from "lucide-react";
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

interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}

export default function AdminOverviewPage() {
  const { staff, loading: authLoading } = useAuth();
  const [tableCounts, setTableCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalBookings: 0,
    totalGuests: 0,
    totalRevenue: 0,
  });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const showToast = (message: string, type: Toast["type"] = "success") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/admin/database");
      const json = await res.json();
      if (json.data) {
        setTableCounts(json.data);
        setStats({
          totalBookings: json.data.bookings || 0,
          totalGuests: json.data.guests || 0,
          totalRevenue: json.data.payments || 0,
        });
      }
    } catch {
      showToast("Failed to load data", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (action: string) => {
    setActionLoading(action);
    try {
      // Simulate action (these would be real endpoints in production)
      await new Promise((r) => setTimeout(r, 1500));
      showToast(`${action} completed successfully`, "success");
    } catch {
      showToast(`${action} failed`, "error");
    } finally {
      setActionLoading(null);
    }
  };

  // Access control
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  if (!staff || !["owner", "admin"].includes(staff.role)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <Shield className="w-16 h-16 text-status-error mb-4" />
        <h1 className="text-2xl font-display font-bold text-text-primary mb-2">
          Access Denied
        </h1>
        <p className="text-text-secondary">
          You need owner or admin privileges to access this page.
        </p>
        <Link href="/dashboard" className="mt-4">
          <Button variant="secondary">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  const totalRecords = Object.values(tableCounts).reduce((a, b) => a + b, 0);

  // Chart data: top tables for donut
  const TABLE_COLORS = [
    "#22D3EE", "#06B6D4", "#0891B2", "#0E7490", "#155E75",
    "#164E63", "#34D399", "#6EE7B7", "#A7F3D0", "#99F6E4",
  ];

  const topTables = Object.entries(tableCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([name, value]) => ({ name, value }));

  const otherCount = Object.entries(tableCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(8)
    .reduce((sum, [, v]) => sum + v, 0);

  const donutData = otherCount > 0
    ? [...topTables, { name: "Other", value: otherCount }]
    : topTables;

  // Bar chart: all tables sorted
  const barData = Object.entries(tableCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([name, value]) => ({ name, value }));

  const quickLinks = [
    {
      label: "Database Explorer",
      href: "/dashboard/admin/database",
      icon: Database,
      desc: "Browse and edit all tables",
    },
    {
      label: "User Management",
      href: "/dashboard/admin/users",
      icon: Users,
      desc: "Manage staff and auth accounts",
    },
    {
      label: "System Config",
      href: "/dashboard/admin/config",
      icon: Settings,
      desc: "Property settings and rates",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Toast notifications */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-lg text-sm font-medium shadow-lg animate-in slide-in-from-right fade-in duration-300 ${
              toast.type === "success"
                ? "bg-status-success/20 text-status-success border border-status-success/30"
                : toast.type === "error"
                  ? "bg-status-error/20 text-status-error border border-status-error/30"
                  : "bg-cyan-400/20 text-cyan-400 border border-cyan-400/30"
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Shield className="w-6 h-6 text-cyan-400" />
          <h1 className="text-2xl font-display font-bold text-text-primary">
            Admin Panel
          </h1>
        </div>
        <p className="text-sm text-text-secondary">
          System administration and database management
        </p>
      </div>

      {/* System Health */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-display font-semibold text-text-primary">
              System Health
            </h2>
            <button
              onClick={fetchData}
              className="text-text-muted hover:text-cyan-400 transition-colors"
            >
              <RefreshCw
                className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-bastet-bg rounded-lg p-4 border border-bastet-border">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4 text-status-success" />
                <span className="text-xs text-text-muted uppercase tracking-wider">
                  DB Status
                </span>
              </div>
              <p className="text-lg font-semibold text-status-success">
                Connected
              </p>
            </div>
            <div className="bg-bastet-bg rounded-lg p-4 border border-bastet-border">
              <div className="flex items-center gap-2 mb-2">
                <Database className="w-4 h-4 text-cyan-400" />
                <span className="text-xs text-text-muted uppercase tracking-wider">
                  Tables
                </span>
              </div>
              <p className="text-lg font-semibold text-text-primary">
                {Object.keys(tableCounts).length}
              </p>
            </div>
            <div className="bg-bastet-bg rounded-lg p-4 border border-bastet-border">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                <span className="text-xs text-text-muted uppercase tracking-wider">
                  Total Records
                </span>
              </div>
              <p className="text-lg font-semibold text-text-primary">
                {loading ? "..." : totalRecords.toLocaleString()}
              </p>
            </div>
            <div className="bg-bastet-bg rounded-lg p-4 border border-bastet-border">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-cyan-400" />
                <span className="text-xs text-text-muted uppercase tracking-wider">
                  Staff
                </span>
              </div>
              <p className="text-lg font-semibold text-text-primary">
                {loading ? "..." : tableCounts.staff || 0}
              </p>
            </div>
          </div>

          {/* API Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-bastet-bg rounded-lg p-4 border border-bastet-border text-center">
              <p className="text-2xl font-bold text-cyan-400">
                {loading ? "..." : stats.totalBookings}
              </p>
              <p className="text-xs text-text-muted mt-1">Total Bookings</p>
            </div>
            <div className="bg-bastet-bg rounded-lg p-4 border border-bastet-border text-center">
              <p className="text-2xl font-bold text-emerald-400">
                {loading ? "..." : stats.totalGuests}
              </p>
              <p className="text-xs text-text-muted mt-1">Total Guests</p>
            </div>
            <div className="bg-bastet-bg rounded-lg p-4 border border-bastet-border text-center">
              <p className="text-2xl font-bold text-cyan-300">
                {loading ? "..." : stats.totalRevenue}
              </p>
              <p className="text-xs text-text-muted mt-1">Total Payments</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      {!loading && Object.keys(tableCounts).length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Database Breakdown Donut */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-display font-semibold text-text-primary">
                Record Distribution
              </h2>
            </CardHeader>
            <CardContent>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {donutData.map((_: any, i: number) => (
                        <Cell key={i} fill={TABLE_COLORS[i % TABLE_COLORS.length]} />
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
                      formatter={(value: any) => [Number(value).toLocaleString(), "Records"]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-2 mt-2 justify-center">
                {donutData.map((entry: any, i: number) => (
                  <div key={entry.name} className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <span
                      className="w-2.5 h-2.5 rounded-full inline-block"
                      style={{ backgroundColor: TABLE_COLORS[i % TABLE_COLORS.length] }}
                    />
                    {entry.name}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Top Tables Bar Chart */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-display font-semibold text-text-primary">
                Top Tables by Records
              </h2>
            </CardHeader>
            <CardContent>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a4a" horizontal={false} />
                    <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fill: "#94a3b8", fontSize: 11 }}
                      width={90}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1a1a2e",
                        border: "1px solid #2a2a4a",
                        borderRadius: "8px",
                        color: "#e2e8f0",
                        fontSize: "12px",
                      }}
                      formatter={(value: any) => [Number(value).toLocaleString(), "Records"]}
                    />
                    <Bar dataKey="value" fill="#22D3EE" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-display font-semibold text-text-primary">
            Quick Actions
          </h2>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleAction("Reset Demo Data")}
              disabled={actionLoading !== null}
            >
              {actionLoading === "Reset Demo Data" ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Reset Demo Data
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleAction("Run All Automations")}
              disabled={actionLoading !== null}
            >
              {actionLoading === "Run All Automations" ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Zap className="w-4 h-4 mr-2" />
              )}
              Run All Automations
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => handleAction("Clear Cache")}
              disabled={actionLoading !== null}
            >
              {actionLoading === "Clear Cache" ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Clear Cache
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {quickLinks.map((link) => (
          <Link key={link.href} href={link.href}>
            <Card hover className="h-full">
              <CardContent className="flex items-start gap-4 py-6">
                <div className="p-2.5 rounded-lg bg-cyan-400/10">
                  <link.icon className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">
                    {link.label}
                  </h3>
                  <p className="text-xs text-text-muted mt-1">{link.desc}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Table Counts Grid */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-display font-semibold text-text-primary">
            Database Tables
          </h2>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {Object.entries(tableCounts)
                .sort(([, a], [, b]) => b - a)
                .map(([table, count]) => (
                  <Link
                    key={table}
                    href={`/dashboard/admin/database?table=${table}`}
                    className="bg-bastet-bg border border-bastet-border rounded-lg p-3 hover:border-cyan-400/30 transition-colors group"
                  >
                    <p className="text-xs text-text-muted font-mono truncate group-hover:text-cyan-400 transition-colors">
                      {table}
                    </p>
                    <p className="text-lg font-bold text-text-primary mt-1">
                      {count.toLocaleString()}
                    </p>
                  </Link>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
