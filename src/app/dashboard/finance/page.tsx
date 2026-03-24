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
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { formatCurrency } from "@/lib/utils";
import type { FinancialSummary } from "@/types/api";

const darkTooltipStyle = {
  backgroundColor: '#111827',
  border: '1px solid #1F2937',
  borderRadius: '8px',
};

const DONUT_COLORS = ['#22D3EE', '#F87171', '#FBBF24', '#34D399', '#A78BFA'];

interface ChannelAnalysis {
  direct_pct: number;
  ota_pct: number;
  commission_cost_gbp: number;
}

interface RevenueForecast {
  days: { date: string; projected_gbp: number }[];
  total_7day_gbp: number;
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

    // Fetch channel analysis from revenue copilot
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

        // Revenue forecast
        if (d.forecast || d.revenue_forecast) {
          const fc = d.forecast || d.revenue_forecast;
          setForecast({
            days: fc.days || [],
            total_7day_gbp: fc.total_7day_gbp ?? fc.total ?? 0,
          });
        }
      } catch { /* — */ }
    };
    fetchChannel();

    // Fetch energy cost
    const fetchEnergy = async () => {
      try {
        const res = await fetch("/api/v1/ai/energy");
        const json = await res.json();
        const d = json.data || json;
        const overview = d.overview || d;
        setEnergyCost(overview.waste_cost_gbp ?? overview.daily_energy_cost_gbp ?? null);
      } catch { /* — */ }
    };
    fetchEnergy();
  }, []);

  // Build expense breakdown for donut chart from available data
  const expenseBreakdown = useMemo(() => {
    const total = summary?.expenses_gbp || 0;
    if (total <= 0) return [];

    const commission = channelAnalysis?.commission_cost_gbp || 0;
    const energy = (energyCost || 0) * 30; // monthly estimate
    const remaining = Math.max(0, total - commission - energy);

    const items: { name: string; value: number }[] = [];
    if (remaining > 0) items.push({ name: 'Operations', value: Math.round(remaining) });
    if (commission > 0) items.push({ name: 'OTA Commission', value: Math.round(commission) });
    if (energy > 0) items.push({ name: 'Energy', value: Math.round(energy) });

    return items;
  }, [summary, channelAnalysis, energyCost]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-bastet-gold" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-text-primary">Finance</h1>
        <p className="text-sm text-text-secondary mt-1">
          Financial overview and management
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-status-success/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-status-success" />
              </div>
              <div>
                <p className="text-xs text-text-muted">Revenue (Month)</p>
                <p className="text-lg font-semibold font-mono text-text-primary">
                  {formatCurrency(summary?.revenue_gbp || 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-status-error/10 flex items-center justify-center">
                <TrendingDown className="w-5 h-5 text-status-error" />
              </div>
              <div>
                <p className="text-xs text-text-muted">Expenses (Month)</p>
                <p className="text-lg font-semibold font-mono text-text-primary">
                  {formatCurrency(summary?.expenses_gbp || 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-bastet-gold/10 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-bastet-gold" />
              </div>
              <div>
                <p className="text-xs text-text-muted">Net Profit</p>
                <p className={`text-lg font-semibold font-mono ${
                  (summary?.net_profit_gbp || 0) >= 0 ? "text-status-success" : "text-status-error"
                }`}>
                  {formatCurrency(summary?.net_profit_gbp || 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-status-info/10 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-status-info" />
              </div>
              <div>
                <p className="text-xs text-text-muted">Occupancy</p>
                <p className="text-lg font-semibold font-mono text-text-primary">
                  {summary?.occupancy_rate || 0}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-text-muted">ADR</p>
            <p className="text-sm font-semibold font-mono text-text-primary">
              {formatCurrency(summary?.adr_gbp || 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-text-muted">RevPAA</p>
            <p className="text-sm font-semibold font-mono text-text-primary">
              {formatCurrency(summary?.revpaa_gbp || 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-text-muted">Total Invoices</p>
            <p className="text-sm font-semibold font-mono text-text-primary">
              {summary?.total_invoices || 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-text-muted">Outstanding</p>
            <p className="text-sm font-semibold font-mono text-status-warning">
              {summary?.outstanding_invoices || 0}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
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

        {/* Currency Rates */}
        <div>
          <CurrencyRatesCard />
        </div>
      </div>

      {/* Channel Analysis + Revenue Forecast */}
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
                {/* Visual bar */}
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

      {/* Expense Breakdown Donut */}
      {expenseBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <PieChartIcon className="w-5 h-5 text-text-muted" />
              <h3 className="text-lg font-semibold text-text-primary">Expense Breakdown</h3>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={expenseBreakdown}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={110}
                  paddingAngle={3}
                  dataKey="value"
                  nameKey="name"
                  stroke="none"
                >
                  {expenseBreakdown.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={darkTooltipStyle}
                  labelStyle={{ color: '#9CA3AF', fontSize: 12 }}
                  formatter={(value: any, name: any) => [formatCurrency(value), name]}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, color: '#6B7280' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Energy Cost Line */}
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

      {/* Navigation Cards */}
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
                  <p className="text-xs text-text-secondary">Manage invoices and payments</p>
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
