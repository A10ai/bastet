"use client";

import { useEffect, useState, useMemo } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import {
  Globe,
  Loader2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  ExternalLink,
  Wifi,
  WifiOff,
  Clock,
  Hash,
  Percent,
  TrendingUp,
  DollarSign,
  BarChart3,
  CalendarRange,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { cn, formatCurrency } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Dark tooltip style (matches finance page)
// ---------------------------------------------------------------------------

const darkTooltipStyle = {
  backgroundColor: "#111827",
  border: "1px solid #1F2937",
  borderRadius: "8px",
  color: "#F9FAFB",
};

// ---------------------------------------------------------------------------
// Channel colors
// ---------------------------------------------------------------------------

const CHANNEL_COLORS: Record<string, string> = {
  direct: "#22D3EE",
  "booking.com": "#003580",
  airbnb: "#FF5A5F",
  expedia: "#FBCE37",
  phone: "#10B981",
  "walk-in": "#8B5CF6",
};

const getChannelColor = (name: string) =>
  CHANNEL_COLORS[name.toLowerCase()] || "#6B7280";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OverviewData {
  total_bookings: number;
  total_revenue_gbp: number;
  commission_paid_gbp: number;
  direct_ratio_pct: number;
  revenue_by_channel: { channel: string; revenue_gbp: number }[];
}

interface ChannelConnection {
  id: string;
  name: string;
  slug: string;
  commission_pct: number;
  status: "connected" | "available";
  last_sync: string | null;
  listings_count: number;
  color: string;
}

interface PerformanceRow {
  channel: string;
  bookings: number;
  revenue_gbp: number;
  avg_value_gbp: number;
  avg_nights: number;
  commission_gbp: number;
  net_revenue_gbp: number;
}

interface RateRow {
  apartment_type: string;
  base_rate_gbp: number;
  available_units: number;
  total_units: number;
}

type SortField = keyof PerformanceRow;
type SortDir = "asc" | "desc";

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  icon: Icon,
  color = "text-text-primary",
  iconBg = "bg-cyan-500/10",
  iconColor = "text-cyan-400",
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  color?: string;
  iconBg?: string;
  iconColor?: string;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center gap-3">
          <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", iconBg)}>
            <Icon className={cn("w-5 h-5", iconColor)} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-text-muted">{label}</p>
            <p className={cn("text-lg font-semibold font-mono", color)}>
              {value}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Channel Connection Card
// ---------------------------------------------------------------------------

function ConnectionCard({ channel }: { channel: ChannelConnection }) {
  const isConnected = channel.status === "connected";
  const isDirect = channel.slug === "direct";

  const borderClass = isDirect
    ? "border-cyan-500/40"
    : isConnected
    ? "border-emerald-500/40"
    : "border-dashed border-border";

  return (
    <Card className={cn("relative overflow-hidden", borderClass)}>
      <CardContent className="py-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {/* Logo letter circle */}
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
              style={{ backgroundColor: channel.color }}
            >
              {channel.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary">{channel.name}</p>
              <p className="text-xs text-text-muted font-mono">{channel.commission_pct}% commission</p>
            </div>
          </div>

          {/* Status badge */}
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
              isConnected
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-gray-500/10 text-text-muted"
            )}
          >
            {isConnected ? (
              <Wifi className="w-3 h-3" />
            ) : (
              <WifiOff className="w-3 h-3" />
            )}
            {isConnected ? "Connected" : "Available"}
          </span>
        </div>

        {/* Details */}
        <div className="mt-4 flex items-center gap-4 text-xs text-text-muted">
          {channel.last_sync && (
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {channel.last_sync}
            </span>
          )}
          {isConnected && (
            <span className="inline-flex items-center gap-1">
              <Hash className="w-3 h-3" />
              {channel.listings_count} listings
            </span>
          )}
        </div>

        {/* Action button */}
        <div className="mt-4">
          {isConnected ? (
            <button className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-400 hover:text-cyan-300 transition-colors">
              <ExternalLink className="w-3.5 h-3.5" />
              Manage
            </button>
          ) : (
            <div className="group relative inline-block">
              <button
                disabled
                className="inline-flex items-center gap-1.5 text-xs font-medium text-text-muted cursor-not-allowed opacity-50"
              >
                <Wifi className="w-3.5 h-3.5" />
                Connect
              </button>
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-900 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                Coming Soon
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ChannelsPage() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [connections, setConnections] = useState<ChannelConnection[]>([]);
  const [performance, setPerformance] = useState<PerformanceRow[]>([]);
  const [rates, setRates] = useState<RateRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Sort state for performance table
  const [sortField, setSortField] = useState<SortField>("revenue_gbp");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const [ovRes, connRes, perfRes, rateRes] = await Promise.all([
          fetch("/api/v1/channels?type=overview"),
          fetch("/api/v1/channels?type=connections"),
          fetch("/api/v1/channels?type=performance"),
          fetch("/api/v1/channels?type=rates"),
        ]);
        const [ovJson, connJson, perfJson, rateJson] = await Promise.all([
          ovRes.json(),
          connRes.json(),
          perfRes.json(),
          rateRes.json(),
        ]);
        setOverview(ovJson.data || ovJson);
        setConnections(connJson.data || connJson.channels || []);
        setPerformance(perfJson.data || perfJson.channels || []);
        setRates(rateJson.data || rateJson.rates || []);
      } catch {
        /* silent — cards show empty state */
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  // Donut chart data from overview
  const donutData = useMemo(() => {
    if (!overview?.revenue_by_channel) return [];
    return overview.revenue_by_channel.map((c) => ({
      name: c.channel,
      value: c.revenue_gbp,
    }));
  }, [overview]);

  // Sorted performance rows
  const sortedPerformance = useMemo(() => {
    const rows = [...performance];
    rows.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      }
      return sortDir === "asc"
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
    return rows;
  }, [performance, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
    return sortDir === "asc" ? (
      <ArrowUp className="w-3 h-3 text-cyan-400" />
    ) : (
      <ArrowDown className="w-3 h-3 text-cyan-400" />
    );
  };

  // Loading
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ===== Header ===== */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
          <Globe className="w-5 h-5 text-cyan-400" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold text-text-primary">Channel Manager</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            OTA connections, rate distribution, and channel performance
          </p>
        </div>
      </div>

      {/* ===== Overview Cards ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Bookings"
          value={String(overview?.total_bookings ?? 0)}
          icon={CalendarRange}
          iconBg="bg-cyan-500/10"
          iconColor="text-cyan-400"
        />
        <StatCard
          label="Total Revenue"
          value={formatCurrency(overview?.total_revenue_gbp ?? 0)}
          icon={TrendingUp}
          iconBg="bg-cyan-500/10"
          iconColor="text-cyan-400"
        />
        <StatCard
          label="Commission Paid"
          value={formatCurrency(overview?.commission_paid_gbp ?? 0)}
          icon={DollarSign}
          color="text-red-400"
          iconBg="bg-red-500/10"
          iconColor="text-red-400"
        />
        <StatCard
          label="Direct Ratio"
          value={`${(overview?.direct_ratio_pct ?? 0).toFixed(1)}%`}
          icon={Percent}
          color={(overview?.direct_ratio_pct ?? 0) > 50 ? "text-emerald-400" : "text-text-primary"}
          iconBg={(overview?.direct_ratio_pct ?? 0) > 50 ? "bg-emerald-500/10" : "bg-cyan-500/10"}
          iconColor={(overview?.direct_ratio_pct ?? 0) > 50 ? "text-emerald-400" : "text-cyan-400"}
        />
      </div>

      {/* ===== Channel Connections ===== */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-4">Channel Connections</h2>
        {connections.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {connections.map((ch) => (
              <ConnectionCard key={ch.id || ch.slug} channel={ch} />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <WifiOff className="w-8 h-8 text-text-muted mx-auto mb-3" />
              <p className="text-sm text-text-muted">No channel connections loaded</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ===== Revenue by Channel (Donut) ===== */}
      {donutData.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-text-primary">Revenue by Channel</h2>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={120}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                  >
                    {donutData.map((entry, i) => (
                      <Cell
                        key={`cell-${i}`}
                        fill={getChannelColor(entry.name)}
                        stroke="transparent"
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={darkTooltipStyle}
                    formatter={(value: any) => [formatCurrency(Number(value)), "Revenue"]}
                  />
                  <Legend
                    formatter={(value: any) => (
                      <span className="text-xs text-text-secondary">{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== Channel Performance Table ===== */}
      {sortedPerformance.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-text-primary">Channel Performance</h2>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  {([
                    ["channel", "Channel"],
                    ["bookings", "Bookings"],
                    ["revenue_gbp", "Revenue"],
                    ["avg_value_gbp", "Avg Value"],
                    ["avg_nights", "Avg Nights"],
                    ["commission_gbp", "Commission"],
                    ["net_revenue_gbp", "Net Revenue"],
                  ] as [SortField, string][]).map(([field, label]) => (
                    <th
                      key={field}
                      className="py-3 px-3 text-xs text-text-muted font-medium cursor-pointer select-none hover:text-text-primary transition-colors"
                      onClick={() => handleSort(field)}
                    >
                      <span className="inline-flex items-center gap-1">
                        {label}
                        <SortIcon field={field} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedPerformance.map((row, i) => (
                  <tr
                    key={row.channel}
                    className={cn(
                      "border-b border-border/50 hover:bg-bastet-bg/50 transition-colors",
                      i % 2 === 0 ? "bg-transparent" : "bg-bastet-bg/20"
                    )}
                  >
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: getChannelColor(row.channel) }}
                        />
                        <span className="font-medium text-text-primary">{row.channel}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 font-mono text-text-secondary">{row.bookings}</td>
                    <td className="py-3 px-3 font-mono text-text-secondary">{formatCurrency(row.revenue_gbp)}</td>
                    <td className="py-3 px-3 font-mono text-text-secondary">{formatCurrency(row.avg_value_gbp)}</td>
                    <td className="py-3 px-3 font-mono text-text-secondary">{row.avg_nights.toFixed(1)}</td>
                    <td className="py-3 px-3 font-mono text-red-400">{formatCurrency(row.commission_gbp)}</td>
                    <td className="py-3 px-3 font-mono text-emerald-400">{formatCurrency(row.net_revenue_gbp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* ===== Rate Distribution ===== */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-primary">Rate Distribution</h2>
            <div className="group relative inline-block">
              <button
                disabled
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-cyan-500/10 text-text-muted cursor-not-allowed opacity-60"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Sync Rates
              </button>
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-900 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                Coming Soon
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {rates.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-3 px-3 text-xs text-text-muted font-medium">Apartment Type</th>
                  <th className="py-3 px-3 text-xs text-text-muted font-medium">Base Rate</th>
                  <th className="py-3 px-3 text-xs text-text-muted font-medium">Available</th>
                  <th className="py-3 px-3 text-xs text-text-muted font-medium">Total Units</th>
                  <th className="py-3 px-3 text-xs text-text-muted font-medium">Occupancy</th>
                </tr>
              </thead>
              <tbody>
                {rates.map((row, i) => {
                  const occupancyPct =
                    row.total_units > 0
                      ? (((row.total_units - row.available_units) / row.total_units) * 100).toFixed(0)
                      : "0";
                  return (
                    <tr
                      key={row.apartment_type}
                      className={cn(
                        "border-b border-border/50 hover:bg-bastet-bg/50 transition-colors",
                        i % 2 === 0 ? "bg-transparent" : "bg-bastet-bg/20"
                      )}
                    >
                      <td className="py-3 px-3 font-medium text-text-primary">{row.apartment_type}</td>
                      <td className="py-3 px-3 font-mono text-text-secondary">{formatCurrency(row.base_rate_gbp)}</td>
                      <td className="py-3 px-3 font-mono text-text-secondary">{row.available_units}</td>
                      <td className="py-3 px-3 font-mono text-text-secondary">{row.total_units}</td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-bastet-bg rounded-full overflow-hidden max-w-[80px]">
                            <div
                              className="h-full bg-cyan-400 rounded-full transition-all"
                              style={{ width: `${occupancyPct}%` }}
                            />
                          </div>
                          <span className="text-xs font-mono text-text-muted">{occupancyPct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="py-8 text-center">
              <BarChart3 className="w-8 h-8 text-text-muted mx-auto mb-3" />
              <p className="text-sm text-text-muted">No rate data available</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
