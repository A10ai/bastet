"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import {
  Handshake,
  Loader2,
  BedDouble,
  BarChart3,
  PoundSterling,
  TrendingUp,
} from "lucide-react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { cn, formatCurrency } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Contract {
  id: string;
  operator: string;
  market: string;
  status: string;
  rooms_allotted: number;
  rooms_used_avg: number;
  fill_rate: number;
  contracted_rate_gbp: number;
  rack_rate_gbp: number;
  discount_pct: number;
  payment_terms: string;
  season: string;
  start_date: string;
  end_date: string;
  release_days: number;
  min_nights: number;
  commission_pct: number;
  total_room_nights: number;
  used_room_nights: number;
  revenue_gbp: number;
}

interface Summary {
  total_operators: number;
  active_contracts: number;
  total_allotted_rooms: number;
  avg_fill_rate: number;
  total_contracted_revenue: number;
  avg_contracted_rate: number;
  avg_discount_vs_rack: number;
}

interface Performance {
  operator: string;
  market: string;
  fill_rate: number;
  revenue_gbp: number;
  rooms_allotted: number;
  used_room_nights: number;
  contracted_rate_gbp: number;
  discount_pct: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CYAN = "#22D3EE";

const darkTooltipStyle = {
  backgroundColor: "#111827",
  border: "1px solid #1F2937",
  borderRadius: "8px",
  color: "#F9FAFB",
};

const MARKET_COLORS: Record<string, string> = {
  "UK/Germany": "#22D3EE",
  UK: "#3B82F6",
  Germany: "#F59E0B",
  "Russia/CIS": "#EF4444",
  "Poland/Czech": "#8B5CF6",
  Global: "#10B981",
};

const getMarketColor = (market: string) => MARKET_COLORS[market] || "#6B7280";

const PAYMENT_LABELS: Record<string, string> = {
  prepaid: "Prepaid",
  credit_30: "Credit 30d",
  credit_14: "Credit 14d",
  on_departure: "On Departure",
  commission: "Commission",
};

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  unit,
  subtitle,
  color = "text-text-primary",
}: {
  label: string;
  value: string;
  unit?: string;
  subtitle?: string;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="py-5">
        <p className="text-xs text-text-muted uppercase tracking-wider">
          {label}
        </p>
        <div className="flex items-baseline gap-1.5 mt-2">
          <span className={cn("text-lg font-mono font-bold", color)}>
            {value}
          </span>
          {unit && (
            <span className="text-xs text-text-muted font-mono">{unit}</span>
          )}
        </div>
        {subtitle && (
          <p className="text-xs text-text-muted mt-1">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Fill Rate Bar (inline in table)
// ---------------------------------------------------------------------------

function FillRateBar({ rate }: { rate: number }) {
  const color =
    rate >= 80
      ? "bg-emerald-400"
      : rate >= 60
        ? "bg-amber-400"
        : rate > 0
          ? "bg-red-400"
          : "bg-slate-600";
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-2.5 bg-bastet-bg rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${Math.min(rate, 100)}%` }}
        />
      </div>
      <span className="text-xs font-mono w-9 text-right">{rate}%</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status Badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    pending: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    expired: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  };
  return (
    <span
      className={cn(
        "text-[10px] font-mono uppercase px-2 py-0.5 rounded border",
        styles[status] || styles.expired
      )}
    >
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function TourOperatorsPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [performance, setPerformance] = useState<Performance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [listRes, summaryRes, perfRes] = await Promise.all([
        fetch("/api/v1/tour-contracts?type=list"),
        fetch("/api/v1/tour-contracts?type=summary"),
        fetch("/api/v1/tour-contracts?type=performance"),
      ]);

      if (!listRes.ok || !summaryRes.ok || !perfRes.ok) {
        throw new Error("Failed to fetch tour contract data");
      }

      const [listJson, summaryJson, perfJson] = await Promise.all([
        listRes.json(),
        summaryRes.json(),
        perfRes.json(),
      ]);

      setContracts(listJson.data);
      setSummary(summaryJson.data);
      setPerformance(perfJson.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // -------------------------------------------------------------------------
  // Chart data
  // -------------------------------------------------------------------------

  const revenueChartData = performance.map((p) => ({
    name: p.operator,
    revenue: p.revenue_gbp,
  }));

  // Rooms by market: aggregate allotted rooms across operators
  const marketMap = new Map<string, number>();
  contracts.forEach((c) => {
    const current = marketMap.get(c.market) || 0;
    marketMap.set(c.market, current + c.rooms_allotted);
  });
  const marketPieData = Array.from(marketMap.entries())
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }));

  const fillRateChartData = performance
    .filter((p) => p.fill_rate > 0)
    .map((p) => ({
      name: p.operator,
      fill_rate: p.fill_rate,
    }));

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-red-400 text-sm">{error}</p>
        <button
          onClick={loadData}
          className="text-xs text-cyan-400 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-cyan-500/10">
          <Handshake className="w-6 h-6 text-cyan-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary">
            Tour Operator Contracts
          </h1>
          <p className="text-sm text-text-muted">
            Manage tour operator allotments, rates, and performance
          </p>
        </div>
      </div>

      {/* Stat Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Active Contracts"
            value={String(summary.active_contracts)}
            subtitle={`${summary.total_operators} total operators`}
            color="text-cyan-400"
          />
          <StatCard
            label="Total Allotted Rooms"
            value={String(summary.total_allotted_rooms)}
            unit="rooms/night"
            subtitle="Contracted capacity"
          />
          <StatCard
            label="Avg Fill Rate"
            value={`${summary.avg_fill_rate}%`}
            subtitle="Active contracts with allotments"
            color={
              summary.avg_fill_rate >= 75
                ? "text-emerald-400"
                : "text-amber-400"
            }
          />
          <StatCard
            label="Total Revenue"
            value={formatCurrency(summary.total_contracted_revenue)}
            subtitle={`Avg rate: ${formatCurrency(summary.avg_contracted_rate)}/night`}
            color="text-cyan-400"
          />
        </div>
      )}

      {/* Contracts Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-text-primary">
              Contract Overview
            </h2>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bastet-border">
                  <th className="text-left text-[10px] text-text-muted uppercase tracking-wider px-4 py-3">
                    Operator
                  </th>
                  <th className="text-left text-[10px] text-text-muted uppercase tracking-wider px-4 py-3">
                    Market
                  </th>
                  <th className="text-left text-[10px] text-text-muted uppercase tracking-wider px-4 py-3">
                    Season
                  </th>
                  <th className="text-right text-[10px] text-text-muted uppercase tracking-wider px-4 py-3">
                    Rooms
                  </th>
                  <th className="text-left text-[10px] text-text-muted uppercase tracking-wider px-4 py-3">
                    Fill Rate
                  </th>
                  <th className="text-right text-[10px] text-text-muted uppercase tracking-wider px-4 py-3">
                    Rate
                  </th>
                  <th className="text-right text-[10px] text-text-muted uppercase tracking-wider px-4 py-3">
                    Discount
                  </th>
                  <th className="text-left text-[10px] text-text-muted uppercase tracking-wider px-4 py-3">
                    Payment
                  </th>
                  <th className="text-left text-[10px] text-text-muted uppercase tracking-wider px-4 py-3">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-bastet-border/50 hover:bg-bastet-bg/50 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono font-semibold text-text-primary">
                      {c.operator}
                    </td>
                    <td className="px-4 py-3 text-text-secondary text-xs">
                      <span
                        className="inline-block w-2 h-2 rounded-full mr-1.5"
                        style={{ backgroundColor: getMarketColor(c.market) }}
                      />
                      {c.market}
                    </td>
                    <td className="px-4 py-3 text-text-muted text-xs">
                      {c.season}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-text-primary">
                      {c.rooms_allotted > 0 ? c.rooms_allotted : "-"}
                    </td>
                    <td className="px-4 py-3">
                      <FillRateBar rate={c.fill_rate} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-cyan-400">
                      {formatCurrency(c.contracted_rate_gbp)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-amber-400">
                      {c.discount_pct}%
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary">
                      {PAYMENT_LABELS[c.payment_terms] || c.payment_terms}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue by Operator */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <div className="flex items-center gap-2">
              <PoundSterling className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-semibold text-text-primary">
                Revenue by Operator
              </h2>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={revenueChartData}
                  layout="vertical"
                  margin={{ left: 10, right: 20, top: 5, bottom: 5 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#1F2937"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    tick={{ fill: "#9CA3AF", fontSize: 10 }}
                    tickFormatter={(v) =>
                      `${(Number(v) / 1000).toFixed(0)}k`
                    }
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={90}
                    tick={{ fill: "#9CA3AF", fontSize: 10 }}
                  />
                  <Tooltip
                    contentStyle={darkTooltipStyle}
                    formatter={(v) => [
                      formatCurrency(Number(v)),
                      "Revenue",
                    ]}
                  />
                  <Bar dataKey="revenue" fill={CYAN} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Rooms by Market */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <div className="flex items-center gap-2">
              <BedDouble className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-semibold text-text-primary">
                Rooms by Market
              </h2>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={marketPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, value }) =>
                      `${name}: ${value}`
                    }
                  >
                    {marketPieData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={getMarketColor(entry.name)}
                        stroke="transparent"
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={darkTooltipStyle}
                    formatter={(v) => [`${v} rooms`, "Allotted"]}
                  />
                  <Legend
                    iconType="circle"
                    wrapperStyle={{ fontSize: 11, color: "#9CA3AF" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Fill Rate Comparison */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-semibold text-text-primary">
                Fill Rate Comparison
              </h2>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={fillRateChartData}
                  margin={{ left: 0, right: 10, top: 5, bottom: 5 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#1F2937"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "#9CA3AF", fontSize: 10 }}
                    angle={-30}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis
                    tick={{ fill: "#9CA3AF", fontSize: 10 }}
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    contentStyle={darkTooltipStyle}
                    formatter={(v) => [`${v}%`, "Fill Rate"]}
                  />
                  <Bar dataKey="fill_rate" radius={[4, 4, 0, 0]}>
                    {fillRateChartData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={
                          entry.fill_rate >= 80
                            ? "#34D399"
                            : entry.fill_rate >= 60
                              ? "#FBBF24"
                              : "#F87171"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
