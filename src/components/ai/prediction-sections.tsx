"use client";

import { cn } from "@/lib/utils";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import type { RechartsValue, RechartsName } from "@/types/recharts";
import { darkTooltipStyle } from "@/lib/chart-styles";

// ---------------------------------------------------------------------------
// Types matching prediction-model.ts
// ---------------------------------------------------------------------------

export interface Prediction {
  date: string;
  predicted_occupancy_pct: number;
  predicted_occupied_units: number;
  predicted_revenue_gbp: number;
  confidence_low: number;
  confidence_high: number;
  factors: string[];
  day_of_week: string;
  is_confirmed_data: boolean;
}

export interface TrainedModel {
  trend_slope: number;
  trend_intercept: number;
  dow_coefficients: number[];
  avg_rate: number;
  avg_rate_sensitivity: number;
  momentum_weight: number;
  residual_std: number;
  training_samples: number;
  training_date: string;
  training_start_date: string;
  total_apartments: number;
  accuracy_mae: number;
  accuracy_mape: number;
  accuracy_rmse: number;
  accuracy_r_squared: number;
}

export interface ModelPerformance {
  mae: number;
  mape: number;
  rmse: number;
  r_squared: number;
  training_samples: number;
  prediction_horizon_days: number;
}

export interface ForecastResult {
  predictions: Prediction[];
  model: TrainedModel;
  performance: ModelPerformance;
  summary: {
    avg_occupancy_pct: number;
    total_revenue_gbp: number;
    revenue_low_gbp: number;
    revenue_high_gbp: number;
    peak_day: string;
    lowest_day: string;
  };
}

export interface BacktestResult extends ModelPerformance {
  backtest_predictions: { date: string; predicted: number; actual: number }[];
}

export interface ComparisonResult {
  ml_mae: number;
  ml_mape: number;
  rules_mae: number;
  rules_mape: number;
  improvement_pct: number;
  ml_r_squared: number;
  rules_r_squared: number;
  sample_size: number;
  summary: string;
}

// ---------------------------------------------------------------------------
// Day abbreviation helpers
// ---------------------------------------------------------------------------

export const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];


export function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

export function MetricRing({
  value,
  label,
  max = 100,
  suffix = "",
  good = "high",
}: {
  value: number;
  label: string;
  max?: number;
  suffix?: string;
  good?: "high" | "low";
}) {
  const pct = Math.min(100, (Math.abs(value) / max) * 100);
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  let color = "#22D3EE"; // cyan
  if (good === "high") {
    color = value >= max * 0.7 ? "#34D399" : value >= max * 0.4 ? "#FBBF24" : "#F87171";
  } else {
    color = value <= max * 0.3 ? "#34D399" : value <= max * 0.6 ? "#FBBF24" : "#F87171";
  }

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-24">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            className="text-brand-border"
          />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-mono font-bold text-text-primary">
            {typeof value === "number" ? (Number.isInteger(value) ? value : value.toFixed(1)) : value}
            {suffix}
          </span>
        </div>
      </div>
      <span className="text-[10px] text-text-muted mt-1 uppercase tracking-wider text-center">
        {label}
      </span>
    </div>
  );
}

export function ForecastChart({ predictions }: { predictions: Prediction[] }) {
  if (predictions.length === 0) return null;

  const todayStr = new Date().toISOString().split("T")[0];

  const chartData = predictions.map((p) => ({
    name: formatShortDate(p.date),
    occupancy: p.predicted_occupancy_pct,
    low: p.confidence_low,
    high: p.confidence_high,
    isToday: p.date === todayStr,
    day: p.day_of_week.slice(0, 3),
  }));

  return (
    <div>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="occGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22D3EE" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#22D3EE" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="bandGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22D3EE" stopOpacity={0.1} />
              <stop offset="100%" stopColor="#22D3EE" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1E2D44" />
          <XAxis
            dataKey="name"
            tick={{ fill: "#64748B", fontSize: 9 }}
            axisLine={false}
            tickLine={false}
            interval={2}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: "#64748B", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: RechartsValue) => `${v}%`}
          />
          <Tooltip
            contentStyle={darkTooltipStyle}
            formatter={(value: RechartsValue, name: RechartsName) => [
              `${value}%`,
              name === "occupancy"
                ? "Occupancy"
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
            fill="url(#bandGrad)"
          />
          <Area
            type="monotone"
            dataKey="occupancy"
            stroke="#22D3EE"
            strokeWidth={2.5}
            fill="url(#occGrad)"
            dot={false}
            activeDot={{ fill: "#22D3EE", stroke: "#0F1729", strokeWidth: 2, r: 5 }}
          />
          <Area
            type="monotone"
            dataKey="low"
            stroke="none"
            fill="none"
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mt-4 pt-3 border-t border-brand-border">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-0.5 bg-cyan-400 rounded" />
          <span className="text-[10px] text-text-muted">Predicted Occupancy</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-8 h-3 rounded bg-cyan-400/10" />
          <span className="text-[10px] text-text-muted">80% Confidence Band</span>
        </div>
      </div>
    </div>
  );
}

export function BacktestChart({
  predictions,
}: {
  predictions: { date: string; predicted: number; actual: number }[];
}) {
  if (predictions.length === 0) {
    return (
      <p className="text-sm text-text-muted text-center py-8">
        Not enough data for backtesting. The model needs at least 10 days of historical bookings.
      </p>
    );
  }

  const chartData = predictions.map((p) => ({
    name: formatShortDate(p.date),
    predicted: p.predicted,
    actual: p.actual,
  }));

  return (
    <div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1E2D44" />
          <XAxis
            dataKey="name"
            tick={{ fill: "#64748B", fontSize: 9 }}
            axisLine={false}
            tickLine={false}
            interval={Math.max(0, Math.floor(chartData.length / 6))}
          />
          <YAxis
            tick={{ fill: "#64748B", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: RechartsValue) => `${v}%`}
          />
          <Tooltip
            contentStyle={darkTooltipStyle}
            formatter={(value: RechartsValue, name: RechartsName) => [
              `${value}%`,
              name === "predicted" ? "Predicted" : "Actual",
            ]}
            labelStyle={{ color: "#94A3B8" }}
          />
          <Bar dataKey="predicted" fill="#22D3EE" fillOpacity={0.6} radius={[2, 2, 0, 0]} />
          <Bar dataKey="actual" fill="#34D399" fillOpacity={0.6} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-4 mt-3 pt-2 border-t border-brand-border">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-cyan-400/60" />
          <span className="text-[10px] text-text-muted">Predicted</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-emerald-400/60" />
          <span className="text-[10px] text-text-muted">Actual</span>
        </div>
      </div>
    </div>
  );
}

export function DOWChart({ coefficients }: { coefficients: number[] }) {
  const maxAbs = Math.max(...coefficients.map(Math.abs), 1);

  return (
    <div className="flex items-center gap-2 justify-between">
      {coefficients.map((c, i) => {
        const height = Math.abs(c) / maxAbs;
        const isPositive = c >= 0;
        return (
          <div key={i} className="flex flex-col items-center gap-1 flex-1">
            <span className={cn(
              "text-[9px] font-mono",
              isPositive ? "text-emerald-400" : "text-red-400"
            )}>
              {isPositive ? "+" : ""}{c.toFixed(1)}
            </span>
            <div className="w-full h-12 relative flex items-center justify-center">
              <div
                className={cn(
                  "w-[70%] rounded-sm transition-all",
                  isPositive ? "bg-emerald-400/40" : "bg-red-400/40"
                )}
                style={{
                  height: `${Math.max(8, height * 100)}%`,
                }}
              />
            </div>
            <span className="text-[9px] text-text-muted font-medium">{DOW_SHORT[i]}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------
