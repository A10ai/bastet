"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import { toCSV, formatReportData } from "@/lib/export-utils";
import {
  FileBarChart,
  Download,
  Printer,
  Loader2,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Building2,
  Users,
  Wrench,
  Sparkles,
  DollarSign,
  BarChart3,
  PieChart as PieChartIcon,
  Zap,
  Brain,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, AreaChart, Area, CartesianGrid,
} from "recharts";

const RECHARTS_COLORS = ["#22D3EE", "#34D399", "#FBBF24", "#A78BFA", "#F97316", "#F472B6", "#818CF8", "#6EE7B7"];

const darkTooltipStyle = {
  contentStyle: { background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 8, fontSize: 12, color: "#e2e8f0" },
  itemStyle: { color: "#e2e8f0" },
};

// ─── Types ───────────────────────────────────────────────────────────

type ReportType = "executive" | "occupancy" | "revenue" | "guests" | "operations" | "financial" | "energy" | "ai_decisions";

const REPORT_LABELS: Record<ReportType, string> = {
  executive: "Executive Summary",
  occupancy: "Occupancy",
  revenue: "Revenue",
  guests: "Guests",
  operations: "Operations",
  financial: "Financial",
  energy: "Energy",
  ai_decisions: "AI Decisions",
};

// ─── Component ───────────────────────────────────────────────────────

export default function ReportsPage() {
  const [reportType, setReportType] = useState<ReportType>("executive");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/reports?type=${reportType}&from=${dateFrom}&to=${dateTo}`
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to fetch report");
      }
      const json = await res.json();
      setData(json.data);
    } catch (e: any) {
      setError(e.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [reportType, dateFrom, dateTo]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleExportCSV = () => {
    if (!data) return;
    const rows = formatReportData(reportType, data);
    if (rows.length === 0) return;
    toCSV(rows, `${reportType}-report-${dateFrom}-to-${dateTo}`);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body { background: white !important; color: #111 !important; }
          .no-print, nav, aside, header, [data-chat-button] { display: none !important; }
          .print-header { display: block !important; }
          .report-card { background: white !important; border: 1px solid #ddd !important; color: #111 !important; break-inside: avoid; }
          .report-card * { color: #111 !important; }
          .report-section { break-before: auto; break-inside: avoid; }
          .css-bar-fill { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          table { border-collapse: collapse; }
          th, td { border: 1px solid #ccc; padding: 6px 10px; }
          th { background: #f5f5f5 !important; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        }
      `}</style>

      {/* Print header (hidden on screen) */}
      <div className="print-header hidden">
        <h1 style={{ fontSize: 24, fontWeight: "bold", marginBottom: 4 }}>
          HospitAI — {REPORT_LABELS[reportType]} — {dateFrom} to {dateTo}
        </h1>
        <hr style={{ marginBottom: 16 }} />
      </div>

      <div className="space-y-6">
        {/* Page header */}
        <div className="no-print">
          <h1 className="text-2xl font-display font-bold text-text-primary">Reports</h1>
          <p className="text-sm text-text-secondary mt-1">
            Generate professional reports for investors, operations, and management
          </p>
        </div>

        {/* Report Builder Header */}
        <Card className="no-print">
          <CardContent className="py-4">
            <div className="flex flex-wrap items-end gap-4">
              {/* Date range */}
              <div>
                <label className="block text-xs text-text-muted mb-1">From</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="px-3 py-2 bg-bastet-bg border border-bastet-border rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-bastet-gold/50"
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">To</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="px-3 py-2 bg-bastet-bg border border-bastet-border rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-bastet-gold/50"
                />
              </div>

              {/* Report type tabs */}
              <div className="flex-1">
                <label className="block text-xs text-text-muted mb-1">Report Type</label>
                <div className="flex flex-wrap gap-1">
                  {(Object.keys(REPORT_LABELS) as ReportType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setReportType(t)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                        reportType === t
                          ? "bg-bastet-gold/20 text-cyan-400 border border-cyan-400/30"
                          : "bg-bastet-bg border border-bastet-border text-text-secondary hover:text-text-primary"
                      }`}
                    >
                      {REPORT_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button onClick={fetchReport} disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <FileBarChart className="w-4 h-4 mr-1" />}
                  Generate
                </Button>
                <Button variant="secondary" onClick={handleExportCSV} disabled={!data}>
                  <Download className="w-4 h-4 mr-1" />
                  CSV
                </Button>
                <Button variant="secondary" onClick={handlePrint} disabled={!data}>
                  <Printer className="w-4 h-4 mr-1" />
                  Print
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-bastet-gold" />
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <Card>
            <CardContent className="py-8 text-center">
              <AlertTriangle className="w-8 h-8 text-status-error mx-auto mb-2" />
              <p className="text-sm text-status-error">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Report content */}
        {!loading && !error && data && (
          <>
            {reportType === "executive" && <ExecutiveView data={data} />}
            {reportType === "occupancy" && <OccupancyView data={data} />}
            {reportType === "revenue" && <RevenueView data={data} />}
            {reportType === "guests" && <GuestView data={data} />}
            {reportType === "operations" && <OperationsView data={data} />}
            {reportType === "financial" && <FinancialView data={data} />}
            {reportType === "energy" && <EnergyReportView data={data} />}
            {reportType === "ai_decisions" && <AIDecisionsView data={data} />}
          </>
        )}
      </div>
    </>
  );
}

// ─── Executive Summary View ──────────────────────────────────────────

function ExecutiveView({ data }: { data: any }) {
  const metrics = [
    { label: "Occupancy", value: `${data.occupancy_pct}%`, icon: Building2, color: "text-cyan-400" },
    { label: "Revenue", value: formatCurrency(data.revenue), icon: DollarSign, color: "text-emerald-400" },
    { label: "ADR", value: formatCurrency(data.adr), icon: TrendingUp, color: "text-cyan-300" },
    { label: "RevPAR", value: formatCurrency(data.revpar), icon: BarChart3, color: "text-cyan-400" },
    { label: "Profit Margin", value: `${data.profit_margin}%`, icon: PieChartIcon, color: "text-emerald-400" },
    { label: "Guest Satisfaction", value: data.guest_satisfaction > 0 ? `${data.guest_satisfaction}/5` : "N/A", icon: Users, color: "text-cyan-300" },
  ];

  return (
    <div className="space-y-6">
      {/* Key metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {metrics.map((m) => (
          <Card key={m.label} className="report-card">
            <CardContent className="py-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-bastet-bg flex items-center justify-center">
                  <m.icon className={`w-5 h-5 ${m.color}`} />
                </div>
                <div>
                  <p className="text-xs text-text-muted">{m.label}</p>
                  <p className="text-lg font-semibold font-mono text-text-primary">{m.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Highlights & Concerns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="report-card report-section">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <h3 className="text-lg font-semibold text-text-primary">Highlights</h3>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {(data.highlights || []).map((h: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                  <TrendingUp className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <span>{h}</span>
                </li>
              ))}
              {(!data.highlights || data.highlights.length === 0) && (
                <li className="text-sm text-text-muted">No highlights for this period</li>
              )}
            </ul>
          </CardContent>
        </Card>

        <Card className="report-card report-section">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-status-warning" />
              <h3 className="text-lg font-semibold text-text-primary">Concerns</h3>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {(data.concerns || []).map((c: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                  <AlertTriangle className="w-4 h-4 text-status-warning mt-0.5 flex-shrink-0" />
                  <span>{c}</span>
                </li>
              ))}
              {(!data.concerns || data.concerns.length === 0) && (
                <li className="text-sm text-text-muted">No concerns flagged</li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Occupancy View ──────────────────────────────────────────────────

function OccupancyView({ data }: { data: any }) {
  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Average Occupancy" value={`${data.average_occupancy}%`} />
        <MetricCard label="Peak Day" value={data.peak_day ? `${data.peak_day.occupancy}%` : "N/A"} sub={data.peak_day?.date} />
        <MetricCard label="Low Day" value={data.low_day ? `${data.low_day.occupancy}%` : "N/A"} sub={data.low_day?.date} />
        <MetricCard
          label="vs Previous Period"
          value={`${data.change_pct > 0 ? "+" : ""}${data.change_pct}%`}
          positive={data.change_pct >= 0}
        />
      </div>

      {/* Daily occupancy chart */}
      <Card className="report-card report-section">
        <CardHeader>
          <h3 className="text-lg font-semibold text-text-primary">Daily Occupancy</h3>
        </CardHeader>
        <CardContent>
          {(data.daily || []).length > 0 && (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={(data.daily || []).map((d: any) => ({ date: (d.date || "").slice(5), occupancy: d.occupancy }))} margin={{ left: 0, right: 12, top: 4, bottom: 4 }}>
                <defs>
                  <linearGradient id="occGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22D3EE" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#22D3EE" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a4a" />
                <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip {...darkTooltipStyle} formatter={(value: any) => [`${value}%`, "Occupancy"]} />
                <Area type="monotone" dataKey="occupancy" stroke="#22D3EE" strokeWidth={2} fill="url(#occGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* By building */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="report-card report-section">
          <CardHeader>
            <h3 className="text-lg font-semibold text-text-primary">By Floor</h3>
          </CardHeader>
          <CardContent>
            <ReportTable
              headers={["Floor", "Occupancy", "Occupied Days", "Total Days"]}
              rows={(data.by_floor || data.by_building || []).map((b: any) => [
                b.floor_label || b.building_name,
                `${b.occupancy}%`,
                String(b.occupied),
                String(b.total),
              ])}
            />
          </CardContent>
        </Card>

        <Card className="report-card report-section">
          <CardHeader>
            <h3 className="text-lg font-semibold text-text-primary">By Apartment Type</h3>
          </CardHeader>
          <CardContent>
            <ReportTable
              headers={["Type", "Occupancy", "Occupied Days", "Total Days"]}
              rows={(data.by_apartment_type || []).map((t: any) => [
                t.type_name,
                `${t.occupancy}%`,
                String(t.occupied),
                String(t.total),
              ])}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Revenue View ────────────────────────────────────────────────────

function RevenueView({ data }: { data: any }) {
  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Total Revenue" value={formatCurrency(data.total_revenue)} />
        <MetricCard label="ADR" value={formatCurrency(data.adr)} />
        <MetricCard label="RevPAR" value={formatCurrency(data.revpar)} />
        <MetricCard
          label="vs Previous Period"
          value={`${data.change_pct > 0 ? "+" : ""}${data.change_pct}%`}
          positive={data.change_pct >= 0}
        />
      </div>

      {/* Channel breakdown */}
      <Card className="report-card report-section">
        <CardHeader>
          <h3 className="text-lg font-semibold text-text-primary">Revenue by Channel</h3>
        </CardHeader>
        <CardContent>
          <ReportTable
            headers={["Channel", "Revenue", "Commission", "Net Revenue", "Bookings"]}
            rows={(data.by_channel || []).map((c: any) => [
              c.channel,
              formatCurrency(c.revenue),
              formatCurrency(c.commission),
              formatCurrency(c.net_revenue),
              String(c.bookings),
            ])}
          />
        </CardContent>
      </Card>

      {/* Daily revenue chart */}
      <Card className="report-card report-section">
        <CardHeader>
          <h3 className="text-lg font-semibold text-text-primary">Daily Revenue</h3>
        </CardHeader>
        <CardContent>
          {(data.daily || []).length > 0 && (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={(data.daily || []).map((d: any) => ({ date: (d.date || "").slice(5), revenue: d.revenue }))} margin={{ left: 0, right: 12, top: 4, bottom: 4 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34D399" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#34D399" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a4a" />
                <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip {...darkTooltipStyle} formatter={(value: any) => [formatCurrency(value), "Revenue"]} />
                <Area type="monotone" dataKey="revenue" stroke="#34D399" strokeWidth={2} fill="url(#revGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Top bookings */}
      <Card className="report-card report-section">
        <CardHeader>
          <h3 className="text-lg font-semibold text-text-primary">Top Bookings by Value</h3>
        </CardHeader>
        <CardContent>
          <ReportTable
            headers={["Ref", "Guest", "Apartment", "Nights", "Amount"]}
            rows={(data.top_bookings || []).map((b: any) => [
              b.ref,
              b.guest_name,
              b.apartment,
              String(b.nights),
              formatCurrency(b.amount),
            ])}
          />
        </CardContent>
      </Card>

      {/* By apartment type */}
      <Card className="report-card report-section">
        <CardHeader>
          <h3 className="text-lg font-semibold text-text-primary">Revenue by Apartment Type</h3>
        </CardHeader>
        <CardContent>
          <ReportTable
            headers={["Type", "Revenue", "Bookings"]}
            rows={(data.by_apartment_type || []).map((t: any) => [
              t.type_name,
              formatCurrency(t.revenue),
              String(t.bookings),
            ])}
          />
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Guest View ──────────────────────────────────────────────────────

function GuestView({ data }: { data: any }) {
  const total = data.total_guests || 1;
  const newPct = Math.round(((data.new_guests || 0) / total) * 100);
  const retPct = 100 - newPct;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Total Guests" value={String(data.total_guests || 0)} />
        <MetricCard label="New Guests" value={String(data.new_guests || 0)} />
        <MetricCard label="Returning Guests" value={String(data.returning_guests || 0)} />
        <MetricCard label="Avg Spend / Guest" value={formatCurrency(data.average_spend || 0)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* New vs Returning - Recharts donut */}
        <Card className="report-card report-section">
          <CardHeader>
            <h3 className="text-lg font-semibold text-text-primary">New vs Returning</h3>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center gap-6 py-2">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie
                    data={[
                      { name: "New", value: data.new_guests || 0 },
                      { name: "Returning", value: data.returning_guests || 0 },
                    ]}
                    cx="50%" cy="50%" innerRadius={45} outerRadius={70}
                    paddingAngle={3} dataKey="value"
                  >
                    <Cell fill="#22D3EE" />
                    <Cell fill="#34D399" />
                  </Pie>
                  <Tooltip {...darkTooltipStyle} formatter={(value: any) => [value, "Guests"]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-cyan-400" />
                  <span className="text-sm text-text-secondary">New: {data.new_guests} ({newPct}%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-emerald-400" />
                  <span className="text-sm text-text-secondary">Returning: {data.returning_guests} ({retPct}%)</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Nationality breakdown */}
        <Card className="report-card report-section">
          <CardHeader>
            <h3 className="text-lg font-semibold text-text-primary">Guests by Nationality</h3>
          </CardHeader>
          <CardContent>
            {(data.by_nationality || []).length > 0 && (
              <ResponsiveContainer width="100%" height={Math.max((data.by_nationality || []).length * 28, 120)}>
                <BarChart data={(data.by_nationality || []).map((n: any) => ({ name: n.nationality, count: n.count }))} layout="vertical" margin={{ left: 0, right: 12, top: 4, bottom: 4 }}>
                  <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={90} tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip {...darkTooltipStyle} formatter={(value: any) => [value, "Guests"]} cursor={{ fill: "rgba(34,211,238,0.08)" }} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={16}>
                    {(data.by_nationality || []).map((_: any, i: number) => (
                      <Cell key={i} fill={RECHARTS_COLORS[i % RECHARTS_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Loyalty tier distribution */}
      <Card className="report-card report-section">
        <CardHeader>
          <h3 className="text-lg font-semibold text-text-primary">Loyalty Tier Distribution</h3>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 flex-wrap">
            {(data.by_loyalty_tier || []).map((t: any) => {
              const tierColors: Record<string, string> = {
                bronze: "bg-amber-700/20 text-amber-500 border-amber-700/30",
                silver: "bg-gray-400/20 text-gray-300 border-gray-400/30",
                gold: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
                platinum: "bg-cyan-400/20 text-cyan-300 border-cyan-400/30",
              };
              return (
                <div
                  key={t.tier}
                  className={`px-4 py-3 rounded-lg border ${tierColors[t.tier] || "bg-bastet-bg border-bastet-border text-text-secondary"}`}
                >
                  <p className="text-xs font-medium capitalize">{t.tier}</p>
                  <p className="text-xl font-semibold font-mono">{t.count}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* VIP guests */}
      {(data.vip_guests || []).length > 0 && (
        <Card className="report-card report-section">
          <CardHeader>
            <h3 className="text-lg font-semibold text-text-primary">VIP Guests</h3>
          </CardHeader>
          <CardContent>
            <ReportTable
              headers={["Name", "Email", "Tier", "Total Spend", "Stays"]}
              rows={(data.vip_guests || []).map((g: any) => [
                g.name,
                g.email,
                g.tier,
                formatCurrency(g.total_spend),
                String(g.stays),
              ])}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Operations View ─────────────────────────────────────────────────

function OperationsView({ data }: { data: any }) {
  const hk = data.housekeeping || {};
  const mx = data.maintenance || {};

  return (
    <div className="space-y-6">
      {/* Housekeeping section */}
      <Card className="report-card report-section">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-cyan-400" />
            <h3 className="text-lg font-semibold text-text-primary">Housekeeping</h3>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-lg font-semibold font-mono text-text-primary">{hk.total_tasks || 0}</p>
              <p className="text-xs text-text-muted">Total Tasks</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold font-mono text-status-success">{hk.completed || 0}</p>
              <p className="text-xs text-text-muted">Completed</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold font-mono text-cyan-400">{hk.avg_completion_minutes || 0}m</p>
              <p className="text-xs text-text-muted">Avg Completion</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* By status */}
            <div>
              <p className="text-sm font-medium text-text-secondary mb-2">By Status</p>
              <div className="space-y-1.5">
                {(hk.by_status || []).map((s: any) => (
                  <div key={s.status} className="flex items-center justify-between text-xs">
                    <Badge status={s.status} variant="status">{s.status}</Badge>
                    <span className="font-mono text-text-secondary">{s.count}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* By type */}
            <div>
              <p className="text-sm font-medium text-text-secondary mb-2">By Type</p>
              {(hk.by_type || []).length > 0 && (
                <ResponsiveContainer width="100%" height={Math.max((hk.by_type || []).length * 28, 100)}>
                  <BarChart data={(hk.by_type || []).map((t: any) => ({ name: t.type.replace(/_/g, " "), count: t.count }))} layout="vertical" margin={{ left: 0, right: 8, top: 0, bottom: 0 }}>
                    <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={90} tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip {...darkTooltipStyle} formatter={(value: any) => [value, "Tasks"]} cursor={{ fill: "rgba(34,211,238,0.08)" }} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={14} fill="#22D3EE" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Maintenance section */}
      <Card className="report-card report-section">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-status-warning" />
            <h3 className="text-lg font-semibold text-text-primary">Maintenance</h3>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-lg font-semibold font-mono text-text-primary">{mx.opened || 0}</p>
              <p className="text-xs text-text-muted">Opened</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold font-mono text-status-success">{mx.resolved || 0}</p>
              <p className="text-xs text-text-muted">Resolved</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold font-mono text-cyan-400">{mx.avg_resolution_hours || 0}h</p>
              <p className="text-xs text-text-muted">Avg Resolution</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold font-mono text-status-warning">{formatCurrency(mx.total_cost || 0)}</p>
              <p className="text-xs text-text-muted">Total Cost</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* By category */}
            <div>
              <p className="text-sm font-medium text-text-secondary mb-2">By Category</p>
              {(mx.by_category || []).length > 0 && (
                <ResponsiveContainer width="100%" height={Math.max((mx.by_category || []).length * 28, 100)}>
                  <BarChart data={(mx.by_category || []).map((c: any) => ({ name: c.category.replace(/_/g, " "), count: c.count }))} layout="vertical" margin={{ left: 0, right: 8, top: 0, bottom: 0 }}>
                    <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={90} tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip {...darkTooltipStyle} formatter={(value: any) => [value, "Tickets"]} cursor={{ fill: "rgba(251,191,36,0.08)" }} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={14} fill="#FBBF24" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            {/* By priority */}
            <div>
              <p className="text-sm font-medium text-text-secondary mb-2">By Priority</p>
              <div className="space-y-1.5">
                {(mx.by_priority || []).map((p: any) => (
                  <div key={p.priority} className="flex items-center justify-between text-xs">
                    <Badge status={p.priority} variant="status">{p.priority}</Badge>
                    <span className="font-mono text-text-secondary">{p.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Staff workload */}
      {(data.staff_workload || []).length > 0 && (
        <Card className="report-card report-section">
          <CardHeader>
            <h3 className="text-lg font-semibold text-text-primary">Staff Workload</h3>
          </CardHeader>
          <CardContent>
            <ReportTable
              headers={["Staff", "Role", "Assigned", "Completed"]}
              rows={(data.staff_workload || []).map((s: any) => [
                s.staff_name,
                s.role,
                String(s.tasks_assigned),
                String(s.tasks_completed),
              ])}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Financial View ──────────────────────────────────────────────────

function FinancialView({ data }: { data: any }) {
  return (
    <div className="space-y-6">
      {/* P&L Style */}
      <Card className="report-card report-section">
        <CardHeader>
          <h3 className="text-lg font-semibold text-text-primary">Profit & Loss</h3>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-bastet-border">
              <span className="text-sm font-medium text-text-primary">Total Revenue</span>
              <span className="text-sm font-mono font-semibold text-status-success">
                {formatCurrency(data.total_revenue)}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-bastet-border">
              <span className="text-sm font-medium text-text-primary">Total Expenses</span>
              <span className="text-sm font-mono font-semibold text-status-error">
                ({formatCurrency(data.total_expenses)})
              </span>
            </div>
            <div className="flex justify-between items-center py-3 border-b-2 border-bastet-border">
              <span className="text-base font-semibold text-text-primary">Gross Profit</span>
              <span className={`text-base font-mono font-bold ${data.gross_profit >= 0 ? "text-status-success" : "text-status-error"}`}>
                {formatCurrency(data.gross_profit)}
              </span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-text-secondary">Profit Margin</span>
              <span className={`text-sm font-mono font-semibold ${data.profit_margin >= 30 ? "text-status-success" : data.profit_margin >= 15 ? "text-status-warning" : "text-status-error"}`}>
                {data.profit_margin}%
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Revenue breakdown */}
        <Card className="report-card report-section">
          <CardHeader>
            <h3 className="text-lg font-semibold text-text-primary">Revenue Breakdown</h3>
          </CardHeader>
          <CardContent>
            {(data.revenue_breakdown || []).length > 0 && (
              <ResponsiveContainer width="100%" height={Math.max((data.revenue_breakdown || []).length * 32, 120)}>
                <BarChart data={(data.revenue_breakdown || []).map((r: any) => ({ name: r.source, amount: r.amount }))} layout="vertical" margin={{ left: 0, right: 12, top: 4, bottom: 4 }}>
                  <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip {...darkTooltipStyle} formatter={(value: any) => [formatCurrency(value), "Revenue"]} cursor={{ fill: "rgba(52,211,153,0.08)" }} />
                  <Bar dataKey="amount" radius={[0, 4, 4, 0]} barSize={16} fill="#34D399" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Expense breakdown */}
        <Card className="report-card report-section">
          <CardHeader>
            <h3 className="text-lg font-semibold text-text-primary">Expense Breakdown</h3>
          </CardHeader>
          <CardContent>
            {(data.expense_breakdown || []).length > 0 && (
              <ResponsiveContainer width="100%" height={Math.max((data.expense_breakdown || []).length * 32, 120)}>
                <BarChart data={(data.expense_breakdown || []).map((e: any) => ({ name: e.category.replace(/_/g, " "), amount: e.amount }))} layout="vertical" margin={{ left: 0, right: 12, top: 4, bottom: 4 }}>
                  <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip {...darkTooltipStyle} formatter={(value: any) => [formatCurrency(value), "Expense"]} cursor={{ fill: "rgba(239,68,68,0.08)" }} />
                  <Bar dataKey="amount" radius={[0, 4, 4, 0]} barSize={16} fill="#EF4444" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Outstanding invoices & Cash flow */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="report-card report-section">
          <CardHeader>
            <h3 className="text-lg font-semibold text-text-primary">Outstanding Invoices</h3>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div className="text-center">
                <p className="text-lg font-semibold font-mono text-status-warning">
                  {data.outstanding_invoices?.count || 0}
                </p>
                <p className="text-xs text-text-muted">Invoices</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold font-mono text-status-warning">
                  {formatCurrency(data.outstanding_invoices?.value || 0)}
                </p>
                <p className="text-xs text-text-muted">Total Value</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="report-card report-section">
          <CardHeader>
            <h3 className="text-lg font-semibold text-text-primary">Cash Flow</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Payments Received</span>
                <span className="font-mono text-status-success">
                  {formatCurrency(data.cash_flow?.payments_received || 0)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Expenses Paid</span>
                <span className="font-mono text-status-error">
                  ({formatCurrency(data.cash_flow?.expenses_paid || 0)})
                </span>
              </div>
              <div className="flex justify-between text-sm pt-2 border-t border-bastet-border">
                <span className="font-medium text-text-primary">Net Cash Flow</span>
                <span className={`font-mono font-semibold ${(data.cash_flow?.net || 0) >= 0 ? "text-status-success" : "text-status-error"}`}>
                  {formatCurrency(data.cash_flow?.net || 0)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Energy Report View ──────────────────────────────────────────────

function EnergyReportView({ data }: { data: any }) {
  const floors = data.by_floor || data.floors || [];
  const overview = data.overview || data;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Daily Consumption" value={`${overview.consumption_kwh || 0} kWh`} />
        <MetricCard label="Daily Waste" value={`${overview.waste_kwh || 0} kWh`} />
        <MetricCard label="Daily Savings" value={formatCurrency(overview.savings_potential_gbp || overview.daily_savings_potential_gbp || 0)} />
        <MetricCard label="CO2 Reduction" value={`${overview.co2_saved_kg || 0} kg`} />
      </div>

      {/* By floor */}
      <Card className="report-card report-section">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-cyan-400" />
            <h3 className="text-lg font-semibold text-text-primary">Energy by Floor</h3>
          </div>
        </CardHeader>
        <CardContent>
          <ReportTable
            headers={["Floor", "Consumption (kWh)", "Waste (kWh)", "Savings Potential", "Occupied Units", "Total Units"]}
            rows={floors.length > 0 ? floors.map((f: any) => [
              f.floor_label || f.building_name || `Floor ${f.floor}`,
              String(f.consumption_kwh || 0),
              String(f.waste_kwh || 0),
              formatCurrency(f.savings_potential_gbp || 0),
              String(f.occupied_units || 0),
              String(f.total_units || 0),
            ]) : []}
          />
        </CardContent>
      </Card>

      {/* Recommendations */}
      {(data.recommendations || []).length > 0 && (
        <Card className="report-card report-section">
          <CardHeader>
            <h3 className="text-lg font-semibold text-text-primary">AI Recommendations</h3>
          </CardHeader>
          <CardContent>
            <ReportTable
              headers={["Title", "Priority", "Affected Units", "Estimated Savings/day"]}
              rows={(data.recommendations || []).map((r: any) => [
                r.title,
                r.priority,
                String(r.affected_units || 0),
                formatCurrency(r.estimated_savings_gbp || 0),
              ])}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── AI Decisions Report View ───────────────────────────────────────

function AIDecisionsView({ data }: { data: any }) {
  const cycles = data.cycles || data.brain_cycles || [];
  const decisions = data.decisions || data.recent_decisions || [];
  const summary = data.summary || data;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Total Cycles" value={String(summary.total_cycles || cycles.length || 0)} />
        <MetricCard label="Decisions Made" value={String(summary.total_decisions || decisions.length || 0)} />
        <MetricCard label="Mode" value={summary.mode || "supervised"} />
        <MetricCard label="Avg Cycle Time" value={summary.avg_cycle_ms ? `${summary.avg_cycle_ms}ms` : "—"} />
      </div>

      {/* Brain Cycles */}
      {cycles.length > 0 && (
        <Card className="report-card report-section">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-cyan-400" />
              <h3 className="text-lg font-semibold text-text-primary">Brain Cycle History</h3>
            </div>
          </CardHeader>
          <CardContent>
            <ReportTable
              headers={["Cycle ID", "Timestamp", "Duration", "Decisions", "Status"]}
              rows={cycles.slice(0, 50).map((c: any) => [
                c.id || c.cycle_id || "—",
                c.timestamp || c.created_at || "—",
                c.duration_ms ? `${c.duration_ms}ms` : "—",
                String(c.decisions_count || c.decisions || 0),
                c.status || c.outcome || "completed",
              ])}
            />
          </CardContent>
        </Card>
      )}

      {/* Decisions */}
      {decisions.length > 0 && (
        <Card className="report-card report-section">
          <CardHeader>
            <h3 className="text-lg font-semibold text-text-primary">Recent Decisions</h3>
          </CardHeader>
          <CardContent>
            <ReportTable
              headers={["Decision", "Type", "Confidence", "Outcome", "Timestamp"]}
              rows={decisions.slice(0, 50).map((d: any) => [
                d.title || d.description || "—",
                d.type || d.category || "—",
                d.confidence ? `${(d.confidence * 100).toFixed(0)}%` : "—",
                d.outcome || d.status || "—",
                d.timestamp || d.created_at || "—",
              ])}
            />
          </CardContent>
        </Card>
      )}

      {/* Fallback if no data */}
      {cycles.length === 0 && decisions.length === 0 && (
        <Card className="report-card">
          <CardContent className="py-8 text-center">
            <Brain className="w-8 h-8 text-text-muted mx-auto mb-2" />
            <p className="text-sm text-text-muted">No AI decision data available for this period</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Shared Sub-components ───────────────────────────────────────────

function MetricCard({ label, value, sub, positive }: { label: string; value: string; sub?: string; positive?: boolean }) {
  return (
    <Card className="report-card">
      <CardContent className="py-4">
        <p className="text-xs text-text-muted">{label}</p>
        <p className={`text-lg font-semibold font-mono ${
          positive === true ? "text-status-success" : positive === false ? "text-status-error" : "text-text-primary"
        }`}>
          {value}
        </p>
        {sub && <p className="text-xs text-text-muted mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function ReportTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-text-muted py-4 text-center">No data available</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-bastet-border">
            {headers.map((h) => (
              <th key={h} className="text-left py-2 px-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className={`border-b border-bastet-border/50 ${i % 2 === 1 ? "bg-bastet-bg/30" : ""}`}
            >
              {row.map((cell, j) => (
                <td key={j} className="py-2 px-3 text-text-secondary">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
