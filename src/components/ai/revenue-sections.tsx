"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Lightbulb, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { ChannelMixResult, RatePerformanceItem, LOSAnalysis, RevenueForecast, WhatIfResult } from "@/lib/revenue-engine";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";
import type { RechartsValue, RechartsName } from "@/types/recharts";
import { darkTooltipStyle } from "@/lib/chart-styles";

// ---------------------------------------------------------------------------
// Channel colors
// ---------------------------------------------------------------------------

export const CHANNEL_COLORS: Record<string, string> = {
  direct: "#34D399",
  phone: "#22D3EE",
  "walk-in": "#60A5FA",
  "booking.com": "#F87171",
  airbnb: "#FB923C",
  expedia: "#FBBF24",
  unknown: "#64748B",
};

export function getChannelColor(code: string): string {
  return CHANNEL_COLORS[code.toLowerCase()] || CHANNEL_COLORS.unknown;
}

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

export function StatCard({
  label,
  value,
  subValue,
  trend,
  icon: Icon,
  color = "emerald",
}: {
  label: string;
  value: string;
  subValue?: string;
  trend?: number;
  icon: React.ComponentType<{ className?: string }>;
  color?: "emerald" | "cyan" | "amber";
}) {
  const colorMap = {
    emerald: "from-emerald-500/20 to-emerald-500/5 text-emerald-400 border-emerald-500/20",
    cyan: "from-cyan-500/20 to-cyan-500/5 text-cyan-400 border-cyan-500/20",
    amber: "from-amber-500/20 to-amber-500/5 text-amber-400 border-amber-500/20",
  };

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs text-text-muted uppercase tracking-wider">{label}</p>
            <p className="text-2xl font-bold text-text-primary">{value}</p>
            {subValue && <p className="text-xs text-text-muted">{subValue}</p>}
          </div>
          <div
            className={`p-2 rounded-lg bg-gradient-to-br ${colorMap[color]}`}
          >
            <Icon className="w-5 h-5" />
          </div>
        </div>
        {trend !== undefined && (
          <div className="mt-2 flex items-center gap-1">
            {trend > 0 ? (
              <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
            ) : trend < 0 ? (
              <ArrowDownRight className="w-3.5 h-3.5 text-red-400" />
            ) : (
              <Minus className="w-3.5 h-3.5 text-text-muted" />
            )}
            <span
              className={`text-xs font-medium ${
                trend > 0
                  ? "text-emerald-400"
                  : trend < 0
                  ? "text-red-400"
                  : "text-text-muted"
              }`}
            >
              {trend > 0 ? "+" : ""}
              {trend}% vs last month
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Dark tooltip style
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Channel Mix Donut
// ---------------------------------------------------------------------------

export function ChannelMixDonut({
  channels,
}: {
  channels: ChannelMixResult["channels"];
}) {
  const total = channels.reduce((s, c) => s + c.revenue_gbp, 0);
  if (total === 0) return null;

  const data = channels.map((ch) => ({
    name: ch.channel_name,
    value: ch.revenue_gbp,
    fill: getChannelColor(ch.channel_code),
  }));

  return (
    <div className="space-y-3">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={90}
            paddingAngle={2}
            dataKey="value"
            stroke="none"
          >
            {data.map((entry, idx) => (
              <Cell key={idx} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={darkTooltipStyle}
            formatter={(value: RechartsValue, name: RechartsName) => [formatCurrency(Number(value)), name]}
            labelStyle={{ color: "#94A3B8" }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
        {channels.map((ch) => (
          <div key={ch.channel_code} className="flex items-center gap-1.5">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: getChannelColor(ch.channel_code) }}
            />
            <span className="text-xs text-text-muted">{ch.channel_name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rate Efficiency Bar
// ---------------------------------------------------------------------------

export function EfficiencyBar({ value }: { value: number }) {
  const pct = Math.min(150, value * 100);
  const color =
    value >= 1.05
      ? "bg-emerald-400"
      : value >= 0.9
      ? "bg-cyan-400"
      : "bg-amber-400";

  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-2 bg-brand-bg rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${Math.min(100, (pct / 150) * 100)}%` }}
        />
      </div>
      <span className="text-xs text-text-secondary w-10 text-right">
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LOS Bar Chart (Recharts)
// ---------------------------------------------------------------------------

export function LOSBarChart({ analysis }: { analysis: LOSAnalysis }) {
  const data = analysis.brackets.map((bracket) => {
    const hasDiscount = analysis.discount_tiers.some(
      (t) => bracket.min_nights >= t.min_nights
    );
    return {
      name: bracket.label,
      bookings: bracket.booking_count,
      fill: hasDiscount ? "#34D399" : "#22D3EE",
    };
  });

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
          <XAxis
            dataKey="name"
            tick={{ fill: "#64748B", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#64748B", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={darkTooltipStyle}
            formatter={(value: RechartsValue) => [value, "Bookings"]}
            labelStyle={{ color: "#94A3B8" }}
          />
          <Bar dataKey="bookings" radius={[4, 4, 0, 0]}>
            {data.map((entry, idx) => (
              <Cell key={idx} fill={entry.fill} fillOpacity={0.7} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-3 text-xs text-text-muted">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-emerald-400/60 border border-emerald-400/30" />
          <span>Has discount tier</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-cyan-400/60 border border-cyan-400/30" />
          <span>No discount tier</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Forecast Area Chart (Recharts)
// ---------------------------------------------------------------------------

export function ForecastChart({ forecast }: { forecast: RevenueForecast }) {
  const days = forecast.days;
  if (days.length === 0) return null;

  const chartData = days.map((d) => ({
    name: d.date.slice(5),
    confirmed: d.confirmed_revenue,
    projected: d.projected_revenue_mid,
    low: d.projected_revenue_low,
    high: d.projected_revenue_high,
  }));

  return (
    <div>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="projectedGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34D399" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#34D399" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="confirmedGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22D3EE" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#22D3EE" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1E2D44" />
          <XAxis
            dataKey="name"
            tick={{ fill: "#64748B", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval={4}
          />
          <YAxis
            tick={{ fill: "#64748B", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: RechartsValue) =>
              Number(v) >= 1000 ? `\u00a3${(Number(v) / 1000).toFixed(1)}k` : `\u00a3${v}`
            }
          />
          <Tooltip
            contentStyle={darkTooltipStyle}
            formatter={(value: RechartsValue, name: RechartsName) => [
              formatCurrency(Number(value)),
              name === "projected"
                ? "Projected"
                : name === "confirmed"
                ? "Confirmed"
                : name === "high"
                ? "High"
                : "Low",
            ]}
            labelStyle={{ color: "#94A3B8" }}
          />
          <Area
            type="monotone"
            dataKey="high"
            stroke="none"
            fill="#34D399"
            fillOpacity={0.08}
          />
          <Area
            type="monotone"
            dataKey="projected"
            stroke="#34D399"
            strokeWidth={2.5}
            fill="url(#projectedGrad)"
            dot={false}
          />
          <Area
            type="monotone"
            dataKey="confirmed"
            stroke="#22D3EE"
            strokeWidth={2}
            strokeDasharray="6 4"
            fill="url(#confirmedGrad)"
            dot={false}
          />
          <Area
            type="monotone"
            dataKey="low"
            stroke="none"
            fill="none"
          />
        </AreaChart>
      </ResponsiveContainer>

      <div className="flex flex-wrap gap-4 mt-3 text-xs text-text-muted">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-0.5 bg-emerald-400 rounded" />
          <span>Projected (mid)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-0.5 bg-cyan-400 rounded" style={{ borderBottom: "2px dashed #22D3EE" }} />
          <span>Confirmed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-3 bg-emerald-400/10 rounded" />
          <span>Confidence range</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Insight Box
// ---------------------------------------------------------------------------

export function AIInsight({
  title,
  summary,
  actions,
  savings,
}: {
  title: string;
  summary: string;
  actions: string[];
  savings?: number;
}) {
  return (
    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Lightbulb className="w-4 h-4 text-emerald-400" />
        <span className="text-sm font-semibold text-emerald-400">{title}</span>
      </div>
      <p className="text-sm text-text-secondary">{summary}</p>
      {actions.length > 0 && (
        <ul className="space-y-1.5">
          {actions.map((a, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
              <span className="text-emerald-400 mt-0.5">--</span>
              <span>{a}</span>
            </li>
          ))}
        </ul>
      )}
      {savings !== undefined && savings > 0 && (
        <div className="pt-2 border-t border-emerald-500/10">
          <span className="text-sm font-medium text-emerald-400">
            Estimated annual savings: {formatCurrency(savings)}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// What-If Simulator
// ---------------------------------------------------------------------------

export function WhatIfSimulator({
  ratePerformance,
}: {
  ratePerformance: RatePerformanceItem[];
}) {
  const [selectedType, setSelectedType] = useState<string>(
    ratePerformance[0]?.apartment_type_id || ""
  );
  const [newRate, setNewRate] = useState<number>(0);
  const [elasticity, setElasticity] = useState<number>(-0.5);
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedPerf = useMemo(
    () => ratePerformance.find((r) => r.apartment_type_id === selectedType),
    [ratePerformance, selectedType]
  );

  useEffect(() => {
    if (selectedPerf) {
      setNewRate(selectedPerf.avg_actual_rate_gbp || selectedPerf.base_rate_gbp);
    }
  }, [selectedPerf]);

  const runSimulation = useCallback(async () => {
    if (!selectedPerf) return;
    setLoading(true);
    try {
      const res = await fetch("/api/v1/ai/revenue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_rate: selectedPerf.avg_actual_rate_gbp || selectedPerf.base_rate_gbp,
          new_rate: newRate,
          occupancy: selectedPerf.occupancy_pct,
          elasticity,
        }),
      });
      const json = await res.json();
      if (json.data) setResult(json.data);
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, [selectedPerf, newRate, elasticity]);

  // Auto-simulate on parameter change
  useEffect(() => {
    if (selectedPerf && newRate > 0) {
      const timer = setTimeout(runSimulation, 300);
      return () => clearTimeout(timer);
    }
  }, [newRate, elasticity, selectedType, runSimulation, selectedPerf]);

  if (ratePerformance.length === 0) {
    return (
      <p className="text-sm text-text-muted">No apartment type data available for simulation.</p>
    );
  }

  const currentRate = selectedPerf
    ? selectedPerf.avg_actual_rate_gbp || selectedPerf.base_rate_gbp
    : 0;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Apartment type selector */}
        <div className="space-y-1.5">
          <label className="text-xs text-text-muted uppercase tracking-wider">
            Apartment Type
          </label>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          >
            {ratePerformance.map((r) => (
              <option key={r.apartment_type_id} value={r.apartment_type_id}>
                {r.apartment_type_name}
              </option>
            ))}
          </select>
        </div>

        {/* New rate input */}
        <div className="space-y-1.5">
          <label className="text-xs text-text-muted uppercase tracking-wider">
            New Nightly Rate (current: {formatCurrency(currentRate)})
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={Math.round(currentRate * 0.5)}
              max={Math.round(currentRate * 2)}
              step={1}
              value={newRate}
              onChange={(e) => setNewRate(Number(e.target.value))}
              className="flex-1 accent-emerald-400"
            />
            <input
              type="number"
              value={newRate}
              onChange={(e) => setNewRate(Number(e.target.value))}
              className="w-20 bg-brand-bg border border-brand-border rounded-lg px-2 py-1.5 text-sm text-text-primary text-right focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
          </div>
        </div>

        {/* Elasticity slider */}
        <div className="space-y-1.5">
          <label className="text-xs text-text-muted uppercase tracking-wider">
            Price Elasticity ({elasticity})
          </label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">-0.8</span>
            <input
              type="range"
              min={-0.8}
              max={-0.3}
              step={0.05}
              value={elasticity}
              onChange={(e) => setElasticity(Number(e.target.value))}
              className="flex-1 accent-emerald-400"
            />
            <span className="text-xs text-text-muted">-0.3</span>
          </div>
          <p className="text-[10px] text-text-muted">
            Higher magnitude = more price-sensitive demand
          </p>
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-brand-bg rounded-lg p-4 space-y-1">
            <p className="text-xs text-text-muted">Rate Change</p>
            <p
              className={`text-xl font-bold ${
                result.rate_change_pct > 0
                  ? "text-emerald-400"
                  : result.rate_change_pct < 0
                  ? "text-red-400"
                  : "text-text-primary"
              }`}
            >
              {result.rate_change_pct > 0 ? "+" : ""}
              {result.rate_change_pct}%
            </p>
            <p className="text-xs text-text-muted">
              {formatCurrency(result.current_rate)} to {formatCurrency(result.new_rate)}
            </p>
          </div>

          <div className="bg-brand-bg rounded-lg p-4 space-y-1">
            <p className="text-xs text-text-muted">Projected Occupancy</p>
            <p
              className={`text-xl font-bold ${
                result.occupancy_change_pct > 0
                  ? "text-emerald-400"
                  : result.occupancy_change_pct < 0
                  ? "text-amber-400"
                  : "text-text-primary"
              }`}
            >
              {result.projected_occupancy}%
            </p>
            <p className="text-xs text-text-muted">
              {result.occupancy_change_pct > 0 ? "+" : ""}
              {result.occupancy_change_pct}% change
            </p>
          </div>

          <div className="bg-brand-bg rounded-lg p-4 space-y-1">
            <p className="text-xs text-text-muted">Revenue Impact</p>
            <p
              className={`text-xl font-bold ${
                result.revenue_change_pct > 0
                  ? "text-emerald-400"
                  : result.revenue_change_pct < 0
                  ? "text-red-400"
                  : "text-text-primary"
              }`}
            >
              {result.revenue_change_pct > 0 ? "+" : ""}
              {result.revenue_change_pct}%
            </p>
            <p className="text-xs text-text-muted">
              {result.revenue_change_gbp >= 0 ? "+" : ""}
              {formatCurrency(result.revenue_change_gbp)} per unit/night
            </p>
          </div>

          <div className="bg-brand-bg rounded-lg p-4 space-y-1">
            <p className="text-xs text-text-muted">Recommendation</p>
            <p
              className={`text-xl font-bold capitalize ${
                result.recommendation === "increase"
                  ? "text-emerald-400"
                  : result.recommendation === "decrease"
                  ? "text-amber-400"
                  : "text-cyan-400"
              }`}
            >
              {result.recommendation}
            </p>
            <p className="text-xs text-text-muted">
              Break-even: {result.break_even_occupancy}% occ.
            </p>
          </div>
        </div>
      )}

      {result && (
        <div className="bg-brand-bg rounded-lg p-4">
          <p className="text-sm text-text-secondary">{result.reasoning}</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Simulating...</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
