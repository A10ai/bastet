"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  Brain,
  RefreshCw,
  Calendar,
  BarChart3,
  Target,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Minus,
} from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types matching prediction-model.ts
// ---------------------------------------------------------------------------

interface Prediction {
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

interface TrainedModel {
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

interface ModelPerformance {
  mae: number;
  mape: number;
  rmse: number;
  r_squared: number;
  training_samples: number;
  prediction_horizon_days: number;
}

interface ForecastResult {
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

interface BacktestResult extends ModelPerformance {
  backtest_predictions: { date: string; predicted: number; actual: number }[];
}

interface ComparisonResult {
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

const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetricRing({
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
            className="text-bastet-border"
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

function ForecastChart({ predictions }: { predictions: Prediction[] }) {
  if (predictions.length === 0) return null;

  const maxOcc = 100;
  const chartHeight = 200;
  const barWidth = 100 / predictions.length;

  // Find today marker
  const todayStr = new Date().toISOString().split("T")[0];
  const todayIdx = predictions.findIndex((p) => p.date === todayStr);

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[700px]">
        {/* Y-axis labels */}
        <div className="flex">
          <div className="w-10 flex flex-col justify-between text-right pr-2" style={{ height: chartHeight }}>
            <span className="text-[9px] font-mono text-text-muted">100%</span>
            <span className="text-[9px] font-mono text-text-muted">75%</span>
            <span className="text-[9px] font-mono text-text-muted">50%</span>
            <span className="text-[9px] font-mono text-text-muted">25%</span>
            <span className="text-[9px] font-mono text-text-muted">0%</span>
          </div>

          {/* Chart area */}
          <div className="flex-1 relative" style={{ height: chartHeight }}>
            {/* Grid lines */}
            {[0, 25, 50, 75, 100].map((v) => (
              <div
                key={v}
                className="absolute w-full border-t border-bastet-border/30"
                style={{ top: `${100 - v}%` }}
              />
            ))}

            {/* Confidence band + prediction bars */}
            <div className="absolute inset-0 flex items-end">
              {predictions.map((p, i) => {
                const predH = (p.predicted_occupancy_pct / maxOcc) * 100;
                const lowH = (p.confidence_low / maxOcc) * 100;
                const highH = (p.confidence_high / maxOcc) * 100;
                const isWeekend = p.day_of_week === "Saturday" || p.day_of_week === "Sunday";
                const isToday = p.date === todayStr;

                return (
                  <div
                    key={p.date}
                    className="relative flex flex-col items-center justify-end h-full"
                    style={{ width: `${barWidth}%` }}
                    title={`${p.date} (${p.day_of_week})\nOccupancy: ${p.predicted_occupancy_pct}%\nRange: ${p.confidence_low}% - ${p.confidence_high}%\nRevenue: ${formatCurrency(p.predicted_revenue_gbp)}`}
                  >
                    {/* Confidence band (background) */}
                    <div
                      className="absolute w-[80%] rounded-sm bg-cyan-400/10"
                      style={{
                        bottom: `${lowH}%`,
                        height: `${highH - lowH}%`,
                      }}
                    />

                    {/* Prediction bar */}
                    <div
                      className={cn(
                        "w-[60%] rounded-t-sm transition-all duration-300 relative z-10",
                        isToday
                          ? "bg-cyan-400"
                          : p.predicted_occupancy_pct > 85
                          ? "bg-emerald-400/80"
                          : p.predicted_occupancy_pct > 60
                          ? "bg-cyan-400/60"
                          : p.predicted_occupancy_pct > 40
                          ? "bg-amber-400/60"
                          : "bg-red-400/50",
                        isWeekend && "opacity-90"
                      )}
                      style={{ height: `${predH}%` }}
                    />

                    {/* Today marker */}
                    {isToday && (
                      <div className="absolute -top-5 left-1/2 -translate-x-1/2 z-20">
                        <span className="text-[8px] font-bold text-cyan-400 bg-bastet-card px-1 rounded whitespace-nowrap">
                          TODAY
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* X-axis labels */}
        <div className="flex ml-10 mt-1">
          {predictions.map((p, i) => {
            // Only show every 3rd label on small screens
            const show = i % 3 === 0 || p.date === todayStr;
            return (
              <div
                key={p.date}
                className="flex flex-col items-center"
                style={{ width: `${barWidth}%` }}
              >
                {show && (
                  <>
                    <span className="text-[8px] font-mono text-text-muted">
                      {formatShortDate(p.date)}
                    </span>
                    <span className={cn(
                      "text-[7px]",
                      (p.day_of_week === "Saturday" || p.day_of_week === "Sunday")
                        ? "text-cyan-400/70"
                        : "text-text-muted/50"
                    )}>
                      {p.day_of_week.slice(0, 3)}
                    </span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mt-4 pt-3 border-t border-bastet-border">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-cyan-400" />
          <span className="text-[10px] text-text-muted">Today</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-emerald-400/80" />
          <span className="text-[10px] text-text-muted">&gt;85% High</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-cyan-400/60" />
          <span className="text-[10px] text-text-muted">60-85% Normal</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-amber-400/60" />
          <span className="text-[10px] text-text-muted">40-60% Moderate</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-red-400/50" />
          <span className="text-[10px] text-text-muted">&lt;40% Low</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-8 h-3 rounded bg-cyan-400/10" />
          <span className="text-[10px] text-text-muted">80% Confidence Band</span>
        </div>
      </div>
    </div>
  );
}

function BacktestChart({
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

  const maxVal = Math.max(
    ...predictions.map((p) => Math.max(p.predicted, p.actual)),
    100
  );
  const barWidth = 100 / predictions.length;

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[400px]">
        <div className="flex items-end gap-0" style={{ height: 150 }}>
          {predictions.map((p) => {
            const predH = (p.predicted / maxVal) * 100;
            const actH = (p.actual / maxVal) * 100;
            return (
              <div
                key={p.date}
                className="flex items-end gap-[1px] justify-center h-full"
                style={{ width: `${barWidth}%` }}
                title={`${p.date}\nPredicted: ${p.predicted}%\nActual: ${p.actual}%`}
              >
                <div
                  className="w-[35%] rounded-t-sm bg-cyan-400/60"
                  style={{ height: `${predH}%` }}
                />
                <div
                  className="w-[35%] rounded-t-sm bg-emerald-400/60"
                  style={{ height: `${actH}%` }}
                />
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 mt-3 pt-2 border-t border-bastet-border">
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
    </div>
  );
}

function DOWChart({ coefficients }: { coefficients: number[] }) {
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

export default function PredictionsPage() {
  const [forecast, setForecast] = useState<ForecastResult | null>(null);
  const [backtest, setBacktest] = useState<BacktestResult | null>(null);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [retraining, setRetraining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [forecastRes, perfRes, compareRes] = await Promise.all([
        fetch("/api/v1/ai/predictions?type=forecast"),
        fetch("/api/v1/ai/predictions?type=performance"),
        fetch("/api/v1/ai/predictions?type=compare"),
      ]);

      const [forecastJson, perfJson, compareJson] = await Promise.all([
        forecastRes.json(),
        perfRes.json(),
        compareRes.json(),
      ]);

      if (forecastJson.data) setForecast(forecastJson.data);
      if (perfJson.data) setBacktest(perfJson.data);
      if (compareJson.data) setComparison(compareJson.data);
    } catch {
      setError("Failed to load prediction data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRetrain = async () => {
    setRetraining(true);
    try {
      const res = await fetch("/api/v1/ai/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "train" }),
      });
      const json = await res.json();
      if (json.data) {
        // Refresh all data
        await fetchData();
      }
    } catch {
      setError("Failed to retrain model");
    } finally {
      setRetraining(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <TrendingUp className="w-8 h-8 animate-pulse text-cyan-400" />
        <p className="text-sm text-text-secondary">
          Training prediction model on booking data...
        </p>
      </div>
    );
  }

  if (error && !forecast) {
    return (
      <div className="text-center py-24 space-y-3">
        <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
        <p className="text-text-secondary">{error}</p>
        <Button variant="secondary" size="sm" onClick={fetchData}>
          Retry
        </Button>
      </div>
    );
  }

  const model = forecast?.model;
  const predictions = forecast?.predictions || [];
  const summary = forecast?.summary;
  const perf = forecast?.performance;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-cyan-400" />
            <h1 className="text-xl md:text-2xl font-display font-bold text-text-primary">
              Occupancy Predictions
            </h1>
          </div>
          <p className="text-sm text-text-secondary mt-1">
            ML-trained forecasting model -- not rules, real statistical learning
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRetrain}
            disabled={retraining}
          >
            {retraining ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            )}
            {retraining ? "Retraining..." : "Retrain Model"}
          </Button>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-400/10 border border-cyan-400/20">
            <Brain className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-xs font-medium text-cyan-400">
              ML Model
            </span>
          </div>
        </div>
      </div>

      {/* A. Model Status Card */}
      {model && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-5">
              <MetricRing
                value={model.accuracy_r_squared}
                label="R-squared"
                max={1}
                suffix=""
                good="high"
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-5">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted">Training data</span>
                  <span className="text-sm font-mono font-bold text-text-primary">
                    {model.training_samples} days
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted">Last trained</span>
                  <span className="text-sm font-mono text-text-secondary">
                    {model.training_date}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted">Total apartments</span>
                  <span className="text-sm font-mono text-text-secondary">
                    {model.total_apartments}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted">Trend</span>
                  <span className={cn(
                    "text-sm font-mono",
                    model.trend_slope > 0 ? "text-emerald-400" : model.trend_slope < 0 ? "text-red-400" : "text-text-muted"
                  )}>
                    {model.trend_slope > 0 ? "+" : ""}{model.trend_slope.toFixed(4)}%/day
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-5">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted">MAE</span>
                  <span className="text-sm font-mono font-bold text-text-primary">
                    {model.accuracy_mae}%
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted">MAPE</span>
                  <span className="text-sm font-mono text-text-secondary">
                    {model.accuracy_mape}%
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted">RMSE</span>
                  <span className="text-sm font-mono text-text-secondary">
                    {model.accuracy_rmse}%
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted">Residual Std</span>
                  <span className="text-sm font-mono text-text-secondary">
                    {model.residual_std}%
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-5">
              <p className="text-[10px] text-text-muted uppercase tracking-wider mb-2">
                Day-of-Week Seasonality
              </p>
              <DOWChart coefficients={model.dow_coefficients} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* B. 30-Day Forecast Chart (Hero) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-cyan-400" />
            <h3 className="text-lg font-semibold text-text-primary">
              30-Day Occupancy Forecast
            </h3>
          </div>
          {perf && (
            <span className="text-xs text-text-muted">
              Trained on {perf.training_samples} samples | MAE: {perf.mae}%
            </span>
          )}
        </CardHeader>
        <CardContent>
          <ForecastChart predictions={predictions} />
        </CardContent>
      </Card>

      {/* F. Revenue Forecast + Summary Stats */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="py-5 text-center">
              <DollarSign className="w-5 h-5 text-cyan-400 mx-auto mb-2" />
              <p className="text-xs text-text-muted mb-1">30-Day Revenue Forecast</p>
              <p className="text-2xl font-mono font-bold text-text-primary">
                {formatCurrency(summary.total_revenue_gbp)}
              </p>
              <p className="text-xs text-text-muted mt-1">
                {formatCurrency(summary.revenue_low_gbp)} - {formatCurrency(summary.revenue_high_gbp)}
              </p>
              <p className="text-[10px] text-text-muted/60 mt-0.5">80% confidence range</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-5 text-center">
              <Target className="w-5 h-5 text-cyan-400 mx-auto mb-2" />
              <p className="text-xs text-text-muted mb-1">Avg Predicted Occupancy</p>
              <p className="text-2xl font-mono font-bold text-text-primary">
                {summary.avg_occupancy_pct}%
              </p>
              <p className="text-xs text-text-muted mt-1">
                {Math.round((summary.avg_occupancy_pct / 100) * (model?.total_apartments || 270))} of {model?.total_apartments || 270} units
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-5 text-center">
              <Calendar className="w-5 h-5 text-cyan-400 mx-auto mb-2" />
              <p className="text-xs text-text-muted mb-1">Peak / Lowest Days</p>
              <div className="flex justify-center gap-4 mt-1">
                <div>
                  <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400 inline mr-0.5" />
                  <span className="text-sm font-mono text-emerald-400">{formatShortDate(summary.peak_day)}</span>
                </div>
                <div>
                  <ArrowDownRight className="w-3.5 h-3.5 text-red-400 inline mr-0.5" />
                  <span className="text-sm font-mono text-red-400">{formatShortDate(summary.lowest_day)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* C. Daily Prediction Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-cyan-400" />
            <h3 className="text-lg font-semibold text-text-primary">
              Daily Predictions
            </h3>
          </div>
          <span className="text-xs text-text-muted">
            {predictions.length} days
          </span>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full" role="table" aria-label="Daily occupancy predictions">
              <thead>
                <tr className="border-b border-bastet-border">
                  <th className="text-left text-xs font-medium text-text-muted px-4 py-3">Date</th>
                  <th className="text-left text-xs font-medium text-text-muted px-4 py-3">Day</th>
                  <th className="text-right text-xs font-medium text-text-muted px-4 py-3">Occupancy</th>
                  <th className="text-right text-xs font-medium text-text-muted px-4 py-3">Units</th>
                  <th className="text-right text-xs font-medium text-text-muted px-4 py-3">Revenue</th>
                  <th className="text-right text-xs font-medium text-text-muted px-4 py-3">Confidence Range</th>
                  <th className="text-left text-xs font-medium text-text-muted px-4 py-3">Factors</th>
                </tr>
              </thead>
              <tbody>
                {predictions.map((p) => {
                  const isWeekend = p.day_of_week === "Saturday" || p.day_of_week === "Sunday";
                  const isToday = p.date === new Date().toISOString().split("T")[0];
                  return (
                    <tr
                      key={p.date}
                      className={cn(
                        "border-b border-bastet-border last:border-0 hover:bg-bastet-bg/50",
                        isToday && "bg-cyan-400/5",
                        isWeekend && "bg-bastet-bg/30"
                      )}
                    >
                      <td className="px-4 py-2.5 text-sm font-mono text-text-primary">
                        {formatShortDate(p.date)}
                        {isToday && (
                          <span className="ml-1.5 text-[9px] text-cyan-400 font-bold">TODAY</span>
                        )}
                      </td>
                      <td className={cn(
                        "px-4 py-2.5 text-sm",
                        isWeekend ? "text-cyan-400 font-medium" : "text-text-secondary"
                      )}>
                        {p.day_of_week.slice(0, 3)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={cn(
                          "text-sm font-mono font-bold",
                          p.predicted_occupancy_pct > 85 ? "text-emerald-400" :
                          p.predicted_occupancy_pct > 60 ? "text-text-primary" :
                          p.predicted_occupancy_pct > 40 ? "text-amber-400" :
                          "text-red-400"
                        )}>
                          {p.predicted_occupancy_pct}%
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-sm font-mono text-text-secondary text-right">
                        {p.predicted_occupied_units}
                      </td>
                      <td className="px-4 py-2.5 text-sm font-mono text-text-secondary text-right">
                        {formatCurrency(p.predicted_revenue_gbp)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="text-[11px] font-mono text-text-muted">
                          {p.confidence_low}% - {p.confidence_high}%
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {p.factors.slice(0, 2).map((f, fi) => (
                            <span
                              key={fi}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-bastet-bg text-text-muted"
                            >
                              {f}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* D. Model Performance Backtest + E. ML vs Rules */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* D. Backtest */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-cyan-400" />
              <h3 className="text-lg font-semibold text-text-primary">
                Model Backtest
              </h3>
            </div>
            <span className="text-xs text-text-muted">
              Predicted vs Actual
            </span>
          </CardHeader>
          <CardContent>
            {backtest ? (
              <>
                <BacktestChart predictions={backtest.backtest_predictions} />
                <div className="grid grid-cols-4 gap-3 mt-4 pt-3 border-t border-bastet-border">
                  <div className="text-center">
                    <p className="text-xs text-text-muted">MAE</p>
                    <p className="text-lg font-mono font-bold text-text-primary">{backtest.mae}%</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-text-muted">MAPE</p>
                    <p className="text-lg font-mono font-bold text-text-primary">{backtest.mape}%</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-text-muted">RMSE</p>
                    <p className="text-lg font-mono font-bold text-text-primary">{backtest.rmse}%</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-text-muted">R-squared</p>
                    <p className="text-lg font-mono font-bold text-text-primary">{backtest.r_squared}</p>
                  </div>
                </div>
                <p className="text-[10px] text-text-muted/60 mt-2 text-center">
                  Trained on {backtest.training_samples} days, tested on {backtest.prediction_horizon_days} days (80/20 split)
                </p>
              </>
            ) : (
              <p className="text-sm text-text-muted text-center py-8">Loading backtest data...</p>
            )}
          </CardContent>
        </Card>

        {/* E. ML vs Rules Comparison */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-cyan-400" />
              <h3 className="text-lg font-semibold text-text-primary">
                ML vs Rule-Based
              </h3>
            </div>
            <Badge className="bg-cyan-400/10 text-cyan-400 border-cyan-400/20">
              Proof
            </Badge>
          </CardHeader>
          <CardContent>
            {comparison ? (
              <div className="space-y-4">
                <p className="text-sm text-text-secondary leading-relaxed">
                  {comparison.summary}
                </p>

                {/* Side-by-side comparison */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Rules */}
                  <div className="p-4 rounded-lg bg-bastet-bg/50 border border-bastet-border">
                    <p className="text-[10px] text-text-muted uppercase tracking-wider mb-3">Rule-Based (Old)</p>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-xs text-text-muted">MAE</span>
                        <span className="text-sm font-mono text-text-secondary">{comparison.rules_mae}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs text-text-muted">MAPE</span>
                        <span className="text-sm font-mono text-text-secondary">{comparison.rules_mape}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs text-text-muted">R-squared</span>
                        <span className="text-sm font-mono text-text-secondary">{comparison.rules_r_squared}</span>
                      </div>
                    </div>
                  </div>

                  {/* ML */}
                  <div className="p-4 rounded-lg bg-cyan-400/5 border border-cyan-400/20">
                    <p className="text-[10px] text-cyan-400 uppercase tracking-wider mb-3">ML Model (New)</p>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-xs text-text-muted">MAE</span>
                        <span className="text-sm font-mono font-bold text-text-primary">{comparison.ml_mae}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs text-text-muted">MAPE</span>
                        <span className="text-sm font-mono font-bold text-text-primary">{comparison.ml_mape}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs text-text-muted">R-squared</span>
                        <span className="text-sm font-mono font-bold text-text-primary">{comparison.ml_r_squared}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Improvement banner */}
                <div className={cn(
                  "flex items-center justify-center gap-2 py-3 px-4 rounded-lg",
                  comparison.improvement_pct > 0
                    ? "bg-emerald-400/10 border border-emerald-400/20"
                    : "bg-bastet-bg border border-bastet-border"
                )}>
                  {comparison.improvement_pct > 0 ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                      <span className="text-sm font-medium text-emerald-400">
                        ML model is {comparison.improvement_pct}% more accurate
                      </span>
                    </>
                  ) : comparison.improvement_pct === 0 ? (
                    <>
                      <Minus className="w-4 h-4 text-text-muted" />
                      <span className="text-sm text-text-muted">
                        Models perform similarly -- more data needed
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      <span className="text-sm text-amber-400">
                        More historical data will improve ML accuracy
                      </span>
                    </>
                  )}
                </div>

                <p className="text-[10px] text-text-muted/60 text-center">
                  Compared on {comparison.sample_size} test samples (20% holdout)
                </p>
              </div>
            ) : (
              <p className="text-sm text-text-muted text-center py-8">Loading comparison data...</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Model Coefficients (Technical Detail) */}
      {model && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-cyan-400" />
              <h3 className="text-lg font-semibold text-text-primary">
                Learned Model Coefficients
              </h3>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <div className="p-3 rounded-lg bg-bastet-bg">
                <p className="text-[10px] text-text-muted uppercase tracking-wider">Trend Slope</p>
                <p className={cn(
                  "text-lg font-mono font-bold mt-1",
                  model.trend_slope > 0 ? "text-emerald-400" : model.trend_slope < 0 ? "text-red-400" : "text-text-muted"
                )}>
                  {model.trend_slope > 0 ? "+" : ""}{model.trend_slope}
                </p>
                <p className="text-[9px] text-text-muted/60">%/day</p>
              </div>
              <div className="p-3 rounded-lg bg-bastet-bg">
                <p className="text-[10px] text-text-muted uppercase tracking-wider">Intercept</p>
                <p className="text-lg font-mono font-bold text-text-primary mt-1">{model.trend_intercept}%</p>
                <p className="text-[9px] text-text-muted/60">baseline occupancy</p>
              </div>
              <div className="p-3 rounded-lg bg-bastet-bg">
                <p className="text-[10px] text-text-muted uppercase tracking-wider">Avg Rate</p>
                <p className="text-lg font-mono font-bold text-text-primary mt-1">{formatCurrency(model.avg_rate)}</p>
                <p className="text-[9px] text-text-muted/60">per night</p>
              </div>
              <div className="p-3 rounded-lg bg-bastet-bg">
                <p className="text-[10px] text-text-muted uppercase tracking-wider">Rate Sensitivity</p>
                <p className="text-lg font-mono font-bold text-text-primary mt-1">{model.avg_rate_sensitivity}</p>
                <p className="text-[9px] text-text-muted/60">occ% per GBP</p>
              </div>
              <div className="p-3 rounded-lg bg-bastet-bg">
                <p className="text-[10px] text-text-muted uppercase tracking-wider">Momentum Weight</p>
                <p className="text-lg font-mono font-bold text-text-primary mt-1">{model.momentum_weight}</p>
                <p className="text-[9px] text-text-muted/60">booking pace factor</p>
              </div>
              <div className="p-3 rounded-lg bg-bastet-bg">
                <p className="text-[10px] text-text-muted uppercase tracking-wider">Residual Std</p>
                <p className="text-lg font-mono font-bold text-text-primary mt-1">{model.residual_std}%</p>
                <p className="text-[9px] text-text-muted/60">prediction noise</p>
              </div>
            </div>
            <p className="text-[10px] text-text-muted/60 mt-3 text-center">
              All coefficients are computed from historical data. None are hardcoded.
              Model retrains on each request with the latest bookings.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
