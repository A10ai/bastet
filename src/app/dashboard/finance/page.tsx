"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { RevenueChart } from "@/components/finance/revenue-chart";
import { CurrencyRatesCard } from "@/components/finance/currency-rates-card";
import {
  Wallet,
  FileText,
  Receipt,
  TrendingUp,
  TrendingDown,
  Building2,
  BarChart3,
  Loader2,
  ArrowRight,
  Zap,
  Globe,
  PieChart as PieChartIcon,
  DollarSign,
  Percent,
  BedDouble,
  CalendarRange,
  FlaskConical,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  AlertTriangle,
  Target,
  Activity,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";
import { formatCurrency } from "@/lib/utils";
import type { FinancialSummary } from "@/types/api";
import type { RechartsValue, RechartsName } from "@/types/recharts";

const darkTooltipStyle = {
  backgroundColor: "#111827",
  border: "1px solid #1F2937",
  borderRadius: "8px",
  color: "#F9FAFB",
};

const EXPENSE_CATEGORY_COLORS: Record<string, string> = {
  utilities: "#F59E0B",
  staff: "#3B82F6",
  maintenance: "#F97316",
  supplies: "#8B5CF6",
  marketing: "#EC4899",
  insurance: "#06B6D4",
  taxes: "#EF4444",
  software: "#10B981",
  professional_services: "#6366F1",
  travel: "#14B8A6",
  other: "#6B7280",
};

const REVENUE_SOURCE_COLORS = ["#22D3EE", "#F59E0B", "#A78BFA", "#34D399", "#F87171"];

const CHANNEL_COLORS: Record<string, string> = {
  Direct: "#22D3EE",
  "Booking.com": "#3B82F6",
  Airbnb: "#EF4444",
  Expedia: "#F59E0B",
  Phone: "#10B981",
  "Walk-in": "#A78BFA",
  Unknown: "#6B7280",
};

const ROOM_TYPE_COLORS = ["#22D3EE", "#F59E0B", "#A78BFA", "#34D399", "#F87171", "#EC4899", "#8B5CF6"];

const AR_COLORS = {
  current: "#10B981",
  days_30: "#F59E0B",
  days_60: "#F97316",
  days_90_plus: "#EF4444",
};

const DEPT_COLORS = ["#22D3EE", "#3B82F6", "#F59E0B", "#10B981", "#A78BFA", "#EC4899", "#F97316", "#6B7280"];

interface ChannelAnalysis {
  direct_pct: number;
  ota_pct: number;
  commission_cost_gbp: number;
}

interface RevenueForecast {
  days: { date: string; projected_gbp: number }[];
  total_7day_gbp: number;
}

function ChangeIndicator({ value }: { value: number | null | undefined }) {
  if (value == null) return null;
  const isPositive = value >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isPositive ? "text-status-success" : "text-status-error"}`}>
      {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

export default function FinancePage() {
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [channelAnalysis, setChannelAnalysis] = useState<ChannelAnalysis | null>(null);
  const [forecast, setForecast] = useState<RevenueForecast | null>(null);
  const [energyCost, setEnergyCost] = useState<number | null>(null);

  useEffect(() => {
    const fetchSummary = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/v1/finance/summary");
        const json = await res.json();
        setSummary(json.data);
      } catch {
        setSummary(null);
      } finally {
        setLoading(false);
      }
    };
    fetchSummary();

    const fetchChannel = async () => {
      try {
        const res = await fetch("/api/v1/ai/revenue");
        const json = await res.json();
        const d = json.data || json;
        setChannelAnalysis({
          direct_pct: d.direct_pct ?? d.direct_percentage ?? 0,
          ota_pct: d.ota_pct ?? d.ota_percentage ?? 0,
          commission_cost_gbp: d.commission_cost_gbp ?? d.total_commission ?? 0,
        });

        if (d.forecast || d.revenue_forecast) {
          const fc = d.forecast || d.revenue_forecast;
          setForecast({
            days: fc.days || [],
            total_7day_gbp: fc.total_7day_gbp ?? fc.total ?? 0,
          });
        }
      } catch {
        /* -- */
      }
    };
    fetchChannel();

    const fetchEnergy = async () => {
      try {
        const res = await fetch("/api/v1/ai/energy");
        const json = await res.json();
        const d = json.data || json;
        const overview = d.overview || d;
        setEnergyCost(overview.waste_cost_gbp ?? overview.daily_energy_cost_gbp ?? null);
      } catch {
        /* -- */
      }
    };
    fetchEnergy();
  }, []);

  // Expense breakdown from API data
  const expenseDonutData = useMemo(() => {
    if (summary?.expense_breakdown && summary.expense_breakdown.length > 0) {
      return summary.expense_breakdown.map((item) => ({
        name: item.category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        value: item.total_gbp,
        key: item.category,
        percentage: item.percentage,
      }));
    }
    // Fallback to estimated breakdown
    const total = summary?.expenses_gbp || 0;
    if (total <= 0) return [];
    const commission = channelAnalysis?.commission_cost_gbp || 0;
    const energy = (energyCost || 0) * 30;
    const remaining = Math.max(0, total - commission - energy);
    const items: { name: string; value: number; key: string; percentage: number }[] = [];
    if (remaining > 0) items.push({ name: "Operations", value: Math.round(remaining), key: "other", percentage: Math.round((remaining / total) * 100) });
    if (commission > 0) items.push({ name: "OTA Commission", value: Math.round(commission), key: "marketing", percentage: Math.round((commission / total) * 100) });
    if (energy > 0) items.push({ name: "Energy", value: Math.round(energy), key: "utilities", percentage: Math.round((energy / total) * 100) });
    return items;
  }, [summary, channelAnalysis, energyCost]);

  // Revenue by source donut data (existing - by stream: room, extras, marketplace)
  const revenueSourceData = useMemo(() => {
    if (summary?.revenue_by_source && summary.revenue_by_source.length > 0) {
      return summary.revenue_by_source.map((item) => ({
        name: item.source.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        value: item.amount_gbp,
        percentage: item.percentage,
      }));
    }
    return [];
  }, [summary]);

  // Revenue by channel donut data (new - by booking channel)
  const channelDonutData = useMemo(() => {
    if (summary?.revenue_by_channel && summary.revenue_by_channel.length > 0) {
      return summary.revenue_by_channel.map((item) => ({
        name: item.source,
        value: item.revenue_gbp,
        bookings: item.bookings,
        percentage: item.percentage,
      }));
    }
    return [];
  }, [summary]);

  // Room type bar data
  const roomTypeBarData = useMemo(() => {
    if (summary?.revenue_by_room_type && summary.revenue_by_room_type.length > 0) {
      return summary.revenue_by_room_type.map((item) => ({
        type: item.type,
        revenue: item.revenue_gbp,
        bookings: item.bookings,
        avg_rate: item.avg_rate,
        avg_nights: item.avg_nights,
      }));
    }
    return [];
  }, [summary]);

  // Accounts receivable bar data
  const arBarData = useMemo(() => {
    if (!summary?.accounts_receivable) return [];
    const ar = summary.accounts_receivable;
    return [
      { bucket: "Current", count: ar.current.count, total: ar.current.total, fill: AR_COLORS.current },
      { bucket: "1-30 Days", count: ar.days_30.count, total: ar.days_30.total, fill: AR_COLORS.days_30 },
      { bucket: "31-60 Days", count: ar.days_60.count, total: ar.days_60.total, fill: AR_COLORS.days_60 },
      { bucket: "90+ Days", count: ar.days_90_plus.count, total: ar.days_90_plus.total, fill: AR_COLORS.days_90_plus },
    ];
  }, [summary]);

  // Department costs data
  const deptData = useMemo(() => {
    if (summary?.department_costs && summary.department_costs.length > 0) {
      return summary.department_costs;
    }
    return [];
  }, [summary]);

  // CPOR trend data
  const cporData = useMemo(() => {
    if (summary?.cpor_trend && summary.cpor_trend.length > 0) {
      return summary.cpor_trend;
    }
    return [];
  }, [summary]);

  // Cash flow trend data from monthly_data
  const cashFlowData = useMemo(() => {
    if (!summary?.monthly_data || summary.monthly_data.length === 0) return [];
    return summary.monthly_data.map((m) => ({
      month: m.month,
      net_profit: m.revenue - m.expenses,
      revenue: m.revenue,
      expenses: m.expenses,
    }));
  }, [summary]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-bastet-gold" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold text-text-primary">Financial Command Centre</h1>
        <p className="text-sm text-text-secondary mt-1">
          Comprehensive financial overview and performance metrics
        </p>
      </div>

      {/* ===== ROW 1: Primary KPIs ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Revenue */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-status-success/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-status-success" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-xs text-text-muted">Revenue (This Month)</p>
                  <ChangeIndicator value={summary?.revenue_vs_last_month_pct} />
                </div>
                <p className="text-lg font-semibold font-mono text-text-primary">
                  {formatCurrency(summary?.revenue_gbp || 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Expenses */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-status-error/10 flex items-center justify-center">
                <TrendingDown className="w-5 h-5 text-status-error" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-xs text-text-muted">Expenses (This Month)</p>
                  <ChangeIndicator value={summary?.expenses_vs_last_month_pct != null ? -summary.expenses_vs_last_month_pct : null} />
                </div>
                <p className="text-lg font-semibold font-mono text-text-primary">
                  {formatCurrency(summary?.expenses_gbp || 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Net Profit */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-bastet-gold/10 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-bastet-gold" />
              </div>
              <div>
                <p className="text-xs text-text-muted">Net Profit</p>
                <p className={`text-lg font-semibold font-mono ${(summary?.net_profit_gbp || 0) >= 0 ? "text-status-success" : "text-status-error"}`}>
                  {formatCurrency(summary?.net_profit_gbp || 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Profit Margin */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                <Percent className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <p className="text-xs text-text-muted">Profit Margin</p>
                <p className={`text-lg font-semibold font-mono ${(summary?.profit_margin_pct || 0) >= 0 ? "text-status-success" : "text-status-error"}`}>
                  {(summary?.profit_margin_pct || 0).toFixed(1)}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ===== ROW 2: Operational KPIs ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* ADR */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <p className="text-xs text-text-muted">ADR</p>
                <p className="text-lg font-semibold font-mono text-text-primary">
                  {formatCurrency(summary?.adr_gbp || 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* RevPAA */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <p className="text-xs text-text-muted">RevPAA</p>
                <p className="text-lg font-semibold font-mono text-text-primary">
                  {formatCurrency(summary?.revpaa_gbp || 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cost per Occupied Room */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <BedDouble className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-text-muted">Cost / Occupied Room</p>
                <p className="text-lg font-semibold font-mono text-text-primary">
                  {formatCurrency(summary?.cost_per_occupied_room || 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Occupancy Rate */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-status-info/10 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-status-info" />
              </div>
              <div>
                <p className="text-xs text-text-muted">Occupancy Rate</p>
                <p className="text-lg font-semibold font-mono text-text-primary">
                  {summary?.occupancy_rate || 0}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ===== GOP Card ===== */}
      {summary?.gop && (
        <Card className="border-cyan-500/20 bg-gradient-to-r from-cyan-500/5 to-transparent">
          <CardContent className="py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                  <Target className="w-7 h-7 text-cyan-400" />
                </div>
                <div>
                  <p className="text-sm text-text-muted mb-0.5">Gross Operating Profit</p>
                  <p className={`text-lg font-bold font-mono ${summary.gop.gop_gbp >= 0 ? "text-cyan-400" : "text-status-error"}`}>
                    {formatCurrency(summary.gop.gop_gbp)}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-text-muted mb-0.5">GOP Margin</p>
                <p className={`text-lg font-bold font-mono ${summary.gop.gop_margin_pct >= 0 ? "text-cyan-400" : "text-status-error"}`}>
                  {summary.gop.gop_margin_pct.toFixed(1)}%
                </p>
                <p className="text-[10px] text-text-muted mt-0.5">Excl. depreciation, interest, tax</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== YTD Summary Card ===== */}
      <Card className="border-cyan-500/20">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CalendarRange className="w-5 h-5 text-cyan-400" />
            <h3 className="text-lg font-semibold text-text-primary">Year-to-Date Summary</h3>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-xs text-text-muted mb-1">YTD Revenue</p>
              <p className="text-xl font-semibold font-mono text-status-success">
                {formatCurrency(summary?.ytd_revenue_gbp || 0)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-muted mb-1">YTD Expenses</p>
              <p className="text-xl font-semibold font-mono text-status-error">
                {formatCurrency(summary?.ytd_expenses_gbp || 0)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-muted mb-1">YTD Net Profit</p>
              <p className={`text-xl font-semibold font-mono ${(summary?.ytd_net_profit_gbp || 0) >= 0 ? "text-status-success" : "text-status-error"}`}>
                {formatCurrency(summary?.ytd_net_profit_gbp || 0)}
              </p>
            </div>
            {(summary?.r_and_d_total_gbp || 0) > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <FlaskConical className="w-3.5 h-3.5 text-cyan-400" />
                  <p className="text-xs text-text-muted">R&D Spending</p>
                </div>
                <p className="text-xl font-semibold font-mono text-cyan-400">
                  {formatCurrency(summary?.r_and_d_total_gbp || 0)}
                </p>
                <p className="text-[10px] text-text-muted mt-0.5">Innovate UK Eligible</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ===== Revenue vs Expenses Chart + Currency ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-text-muted" />
                <h3 className="text-lg font-semibold text-text-primary">Revenue vs Expenses (6 Months)</h3>
              </div>
            </CardHeader>
            <CardContent>
              <RevenueChart data={summary?.monthly_data || []} />
            </CardContent>
          </Card>
        </div>
        <div>
          <CurrencyRatesCard />
        </div>
      </div>

      {/* ===== Revenue by Room Type ===== */}
      {roomTypeBarData.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-cyan-400" />
              <h3 className="text-lg font-semibold text-text-primary">Revenue by Room Type</h3>
            </div>
            <p className="text-xs text-text-muted mt-1">Revenue breakdown by apartment type this month</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <ResponsiveContainer width="100%" height={Math.max(200, roomTypeBarData.length * 52)}>
                  <BarChart data={roomTypeBarData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fill: "#6B7280", fontSize: 11 }}
                      axisLine={{ stroke: "#374151" }}
                      tickLine={false}
                      tickFormatter={(value: number) => `£${(value / 1000).toFixed(0)}k`}
                    />
                    <YAxis
                      type="category"
                      dataKey="type"
                      tick={{ fill: "#9CA3AF", fontSize: 12 }}
                      axisLine={{ stroke: "#374151" }}
                      tickLine={false}
                      width={120}
                    />
                    <Tooltip
                      contentStyle={darkTooltipStyle}
                      labelStyle={{ color: "#9CA3AF", fontSize: 12 }}
                      formatter={(value: RechartsValue) => [formatCurrency(Number(value)), "Revenue"]}
                    />
                    <Bar dataKey="revenue" radius={[0, 6, 6, 0]} maxBarSize={32}>
                      {roomTypeBarData.map((_, index) => (
                        <Cell key={`rt-${index}`} fill={ROOM_TYPE_COLORS[index % ROOM_TYPE_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3">
                {roomTypeBarData.map((item, index) => (
                  <div key={item.type} className="p-3 rounded-lg bg-bastet-bg/50 border border-bastet-border/50">
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: ROOM_TYPE_COLORS[index % ROOM_TYPE_COLORS.length] }} />
                      <span className="text-sm font-medium text-text-primary">{item.type}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      <div>
                        <p className="text-text-muted">Bookings</p>
                        <p className="font-mono font-semibold text-text-primary">{item.bookings}</p>
                      </div>
                      <div>
                        <p className="text-text-muted">Avg Rate</p>
                        <p className="font-mono font-semibold text-text-primary">{formatCurrency(item.avg_rate)}</p>
                      </div>
                      <div>
                        <p className="text-text-muted">Avg Nights</p>
                        <p className="font-mono font-semibold text-text-primary">{item.avg_nights}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== Revenue by Channel (Source) + Expense Breakdown ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue by Channel Donut */}
        {channelDonutData.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-cyan-400" />
                <h3 className="text-lg font-semibold text-text-primary">Revenue by Channel</h3>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col lg:flex-row items-center gap-6">
                <div className="w-[220px] h-[220px] flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={channelDonutData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={90}
                        paddingAngle={2}
                        dataKey="value"
                        nameKey="name"
                        stroke="none"
                      >
                        {channelDonutData.map((item, index) => (
                          <Cell
                            key={`ch-${index}`}
                            fill={CHANNEL_COLORS[item.name] || CHANNEL_COLORS.Unknown}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={darkTooltipStyle}
                        labelStyle={{ color: "#9CA3AF", fontSize: 12 }}
                        formatter={(value: RechartsValue, name: RechartsName) => [formatCurrency(Number(value)), name]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-2">
                  {channelDonutData.map((item, index) => (
                    <div key={index} className="flex items-center gap-2 text-xs">
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: CHANNEL_COLORS[item.name] || CHANNEL_COLORS.Unknown }}
                      />
                      <span className="text-text-secondary flex-1">{item.name}</span>
                      <span className="font-mono text-text-primary">{formatCurrency(item.value)}</span>
                      <span className="font-mono text-text-muted">({item.percentage}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Expense Breakdown Donut */}
        {expenseDonutData.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <PieChartIcon className="w-5 h-5 text-text-muted" />
                <h3 className="text-lg font-semibold text-text-primary">Expense Breakdown</h3>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col lg:flex-row items-center gap-6">
                <div className="w-[220px] h-[220px] flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={expenseDonutData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={90}
                        paddingAngle={2}
                        dataKey="value"
                        nameKey="name"
                        stroke="none"
                      >
                        {expenseDonutData.map((item, index) => (
                          <Cell
                            key={`exp-${index}`}
                            fill={EXPENSE_CATEGORY_COLORS[item.key] || EXPENSE_CATEGORY_COLORS.other}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={darkTooltipStyle}
                        labelStyle={{ color: "#9CA3AF", fontSize: 12 }}
                        formatter={(value: RechartsValue, name: RechartsName) => [formatCurrency(Number(value)), name]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {/* Legend with amounts */}
                <div className="flex-1 space-y-1.5">
                  {expenseDonutData.map((item, index) => (
                    <div key={index} className="flex items-center gap-2 text-xs">
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: EXPENSE_CATEGORY_COLORS[item.key] || EXPENSE_CATEGORY_COLORS.other }}
                      />
                      <span className="text-text-secondary flex-1">{item.name}</span>
                      <span className="font-mono text-text-primary">{formatCurrency(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ===== Revenue by Source (stream) Donut - existing ===== */}
      {revenueSourceData.length > 0 && revenueSourceData.some((d) => d.value > 0) && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <PieChartIcon className="w-5 h-5 text-cyan-400" />
              <h3 className="text-lg font-semibold text-text-primary">Revenue by Stream</h3>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col lg:flex-row items-center gap-6">
              <div className="w-[220px] h-[220px] flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={revenueSourceData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                      nameKey="name"
                      stroke="none"
                    >
                      {revenueSourceData.map((_, index) => (
                        <Cell key={`rev-${index}`} fill={REVENUE_SOURCE_COLORS[index % REVENUE_SOURCE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={darkTooltipStyle}
                      labelStyle={{ color: "#9CA3AF", fontSize: 12 }}
                      formatter={(value: RechartsValue, name: RechartsName) => [formatCurrency(Number(value)), name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-1.5">
                {revenueSourceData.map((item, index) => (
                  <div key={index} className="flex items-center gap-2 text-xs">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: REVENUE_SOURCE_COLORS[index % REVENUE_SOURCE_COLORS.length] }}
                    />
                    <span className="text-text-secondary">{item.name}</span>
                    <span className="font-mono text-text-primary ml-auto">{formatCurrency(item.value)}</span>
                    <span className="font-mono text-text-muted">({item.percentage}%)</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== Accounts Receivable Aging ===== */}
      {arBarData.length > 0 && arBarData.some((d) => d.total > 0 || d.count > 0) && (
        <Card className="border-amber-500/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              <h3 className="text-lg font-semibold text-text-primary">Accounts Receivable Aging</h3>
            </div>
            <p className="text-xs text-text-muted mt-1">Outstanding invoice balances by age</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={arBarData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                  <XAxis
                    dataKey="bucket"
                    tick={{ fill: "#6B7280", fontSize: 11 }}
                    axisLine={{ stroke: "#374151" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#6B7280", fontSize: 11 }}
                    axisLine={{ stroke: "#374151" }}
                    tickLine={false}
                    tickFormatter={(value: number) => `£${(value / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={darkTooltipStyle}
                    labelStyle={{ color: "#9CA3AF", fontSize: 12 }}
                    formatter={(value: RechartsValue) => [formatCurrency(Number(value)), "Outstanding"]}
                  />
                  <Bar dataKey="total" radius={[6, 6, 0, 0]} maxBarSize={48}>
                    {arBarData.map((item, index) => (
                      <Cell key={`ar-${index}`} fill={item.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="space-y-3">
                {arBarData.map((item) => (
                  <div key={item.bucket} className="flex items-center justify-between p-3 rounded-lg bg-bastet-bg/50 border border-bastet-border/50">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.fill }} />
                      <span className="text-sm text-text-secondary">{item.bucket}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-mono font-semibold text-text-primary">{formatCurrency(item.total)}</p>
                      <p className="text-[10px] text-text-muted">{item.count} invoice{item.count !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2 border-t border-bastet-border">
                  <span className="text-sm font-medium text-text-primary">Total Outstanding</span>
                  <span className="text-sm font-mono font-bold text-amber-400">
                    {formatCurrency(arBarData.reduce((s, d) => s + d.total, 0))}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== Department Costs: Budget vs Actual ===== */}
      {deptData.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-cyan-400" />
              <h3 className="text-lg font-semibold text-text-primary">Department Costs</h3>
            </div>
            <p className="text-xs text-text-muted mt-1">Budget vs actual spend by department</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ResponsiveContainer width="100%" height={Math.max(200, deptData.length * 44)}>
                <BarChart data={deptData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: "#6B7280", fontSize: 11 }}
                    axisLine={{ stroke: "#374151" }}
                    tickLine={false}
                    tickFormatter={(value: number) => `£${(value / 1000).toFixed(0)}k`}
                  />
                  <YAxis
                    type="category"
                    dataKey="department"
                    tick={{ fill: "#9CA3AF", fontSize: 11 }}
                    axisLine={{ stroke: "#374151" }}
                    tickLine={false}
                    width={110}
                  />
                  <Tooltip
                    contentStyle={darkTooltipStyle}
                    labelStyle={{ color: "#9CA3AF", fontSize: 12 }}
                    formatter={(value: RechartsValue, name: RechartsName) => [
                      formatCurrency(Number(value)),
                      name === "budget_gbp" ? "Budget" : "Actual",
                    ]}
                  />
                  <Bar dataKey="budget_gbp" fill="#374151" radius={[0, 4, 4, 0]} maxBarSize={20} name="budget_gbp" />
                  <Bar dataKey="actual_gbp" fill="#22D3EE" radius={[0, 4, 4, 0]} maxBarSize={20} name="actual_gbp" />
                </BarChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                <div className="flex items-center gap-4 text-xs text-text-muted mb-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-2 rounded bg-[#374151]" />
                    <span>Budget</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-2 rounded bg-cyan-400" />
                    <span>Actual</span>
                  </div>
                </div>
                {deptData.map((dept, index) => (
                  <div key={dept.department} className="flex items-center justify-between text-xs py-1.5 border-b border-bastet-border/30 last:border-0">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: DEPT_COLORS[index % DEPT_COLORS.length] }} />
                      <span className="text-text-secondary">{dept.department}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-text-primary">{formatCurrency(dept.actual_gbp)}</span>
                      <span className={`font-mono text-xs px-1.5 py-0.5 rounded ${
                        dept.variance_pct > 5 ? "bg-red-500/10 text-red-400" :
                        dept.variance_pct < -5 ? "bg-green-500/10 text-green-400" :
                        "bg-gray-500/10 text-text-muted"
                      }`}>
                        {dept.variance_pct > 0 ? "+" : ""}{dept.variance_pct.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== Cash Flow Trend ===== */}
      {cashFlowData.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-cyan-400" />
              <h3 className="text-lg font-semibold text-text-primary">Cash Flow Trend</h3>
            </div>
            <p className="text-xs text-text-muted mt-1">Net profit trend over the last 6 months</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={cashFlowData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="cashFlowPositive" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22D3EE" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22D3EE" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                <XAxis
                  dataKey="month"
                  tick={{ fill: "#6B7280", fontSize: 11 }}
                  axisLine={{ stroke: "#374151" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#6B7280", fontSize: 11 }}
                  axisLine={{ stroke: "#374151" }}
                  tickLine={false}
                  tickFormatter={(value: number) => `£${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={darkTooltipStyle}
                  labelStyle={{ color: "#9CA3AF", fontSize: 12 }}
                  formatter={(value: RechartsValue, name: RechartsName) => [
                    formatCurrency(Number(value)),
                    name === "net_profit" ? "Net Profit" : name,
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="net_profit"
                  stroke="#22D3EE"
                  strokeWidth={2}
                  fill="url(#cashFlowPositive)"
                  dot={{ fill: "#22D3EE", strokeWidth: 0, r: 4 }}
                  activeDot={{ r: 6, fill: "#22D3EE" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ===== CPOR Trend ===== */}
      {cporData.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-amber-400" />
              <h3 className="text-lg font-semibold text-text-primary">Cost per Occupied Room Trend</h3>
            </div>
            <p className="text-xs text-text-muted mt-1">CPOR over the last 6 months</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={cporData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="cporGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                <XAxis
                  dataKey="month"
                  tick={{ fill: "#6B7280", fontSize: 11 }}
                  axisLine={{ stroke: "#374151" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#6B7280", fontSize: 11 }}
                  axisLine={{ stroke: "#374151" }}
                  tickLine={false}
                  tickFormatter={(value: number) => `£${value.toFixed(0)}`}
                />
                <Tooltip
                  contentStyle={darkTooltipStyle}
                  labelStyle={{ color: "#9CA3AF", fontSize: 12 }}
                  formatter={(value: RechartsValue) => [formatCurrency(Number(value)), "CPOR"]}
                />
                <Area
                  type="monotone"
                  dataKey="cpor_gbp"
                  stroke="#F59E0B"
                  strokeWidth={2}
                  fill="url(#cporGradient)"
                  dot={{ fill: "#F59E0B", strokeWidth: 0, r: 4 }}
                  activeDot={{ r: 6, fill: "#F59E0B" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ===== Channel Analysis + Revenue Forecast ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Channel Analysis */}
        <Card className="border-bastet-gold/10">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-bastet-gold" />
              <h3 className="text-lg font-semibold text-text-primary">Channel Analysis</h3>
            </div>
            <Link href="/dashboard/ai/revenue" className="text-xs text-bastet-gold hover:underline">
              Revenue Copilot
            </Link>
          </CardHeader>
          <CardContent>
            {channelAnalysis ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">Direct Bookings</span>
                  <span className="text-sm font-mono font-semibold text-bastet-gold">{channelAnalysis.direct_pct}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">OTA Bookings</span>
                  <span className="text-sm font-mono text-text-primary">{channelAnalysis.ota_pct}%</span>
                </div>
                <div className="w-full h-3 bg-bastet-bg rounded-full overflow-hidden flex">
                  <div
                    className="h-full bg-bastet-gold rounded-l-full"
                    style={{ width: `${channelAnalysis.direct_pct}%` }}
                    title={`Direct: ${channelAnalysis.direct_pct}%`}
                  />
                  <div
                    className="h-full bg-amber-500/50"
                    style={{ width: `${channelAnalysis.ota_pct}%` }}
                    title={`OTA: ${channelAnalysis.ota_pct}%`}
                  />
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-bastet-border">
                  <span className="text-sm text-text-secondary">Commission Cost</span>
                  <span className="text-sm font-mono text-status-error font-semibold">
                    {formatCurrency(channelAnalysis.commission_cost_gbp)}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-text-muted py-4 text-center">Channel data unavailable</p>
            )}
          </CardContent>
        </Card>

        {/* Revenue Forecast */}
        <Card className="border-bastet-gold/10">
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-bastet-gold" />
              <h3 className="text-lg font-semibold text-text-primary">7-Day Revenue Forecast</h3>
            </div>
          </CardHeader>
          <CardContent>
            {forecast && forecast.days.length > 0 ? (
              <div className="space-y-2">
                {forecast.days.slice(0, 7).map((day) => (
                  <div key={day.date} className="flex items-center justify-between text-sm">
                    <span className="text-text-secondary font-mono text-xs">{day.date}</span>
                    <span className="font-mono text-text-primary">{formatCurrency(day.projected_gbp)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2 border-t border-bastet-border">
                  <span className="text-sm font-medium text-text-primary">7-Day Total</span>
                  <span className="text-sm font-mono font-bold text-bastet-gold">
                    {formatCurrency(forecast.total_7day_gbp)}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-text-muted py-4 text-center">Forecast data unavailable</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ===== Energy Cost ===== */}
      {energyCost != null && energyCost > 0 && (
        <Card className="border-amber-500/10">
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <span className="text-sm text-text-secondary">Daily Energy Waste Cost</span>
              </div>
              <span className="text-sm font-mono font-semibold text-amber-400">
                {formatCurrency(energyCost)}/day
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== Navigation Cards ===== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href="/dashboard/finance/invoices">
          <Card className="hover:border-bastet-gold/50 transition-colors cursor-pointer">
            <CardContent className="py-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-bastet-gold/10 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-bastet-gold" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-primary">Invoices</p>
                  <p className="text-xs text-text-secondary">
                    {summary?.total_invoices || 0} total &middot; {summary?.outstanding_invoices || 0} outstanding
                  </p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-text-muted" />
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/finance/expenses">
          <Card className="hover:border-bastet-gold/50 transition-colors cursor-pointer">
            <CardContent className="py-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-bastet-gold/10 flex items-center justify-center">
                  <Receipt className="w-5 h-5 text-bastet-gold" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-primary">Expenses</p>
                  <p className="text-xs text-text-secondary">Track expenses and R&D costs</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-text-muted" />
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
