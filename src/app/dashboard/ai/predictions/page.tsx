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
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { RechartsValue, RechartsName } from "@/types/recharts";
import { darkTooltipStyle } from "@/lib/chart-styles";
import type { ForecastResult, BacktestResult, ComparisonResult} from "@/components/ai/prediction-sections";
import { formatShortDate, MetricRing, ForecastChart, BacktestChart, DOWChart } from "@/components/ai/prediction-sections";

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

      {/* Insufficient data warning */}
      {model && (model.accuracy_r_squared < 0 || model.training_samples < 30) && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-400/10 border border-amber-400/20">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-400">
              Insufficient training data ({model.training_samples} samples)
            </p>
            <p className="text-xs text-text-secondary mt-1">
              Predictions will improve as more booking data accumulates. Minimum recommended: 90 days of data.
            </p>
          </div>
        </div>
      )}

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
              <p className="text-lg font-mono font-bold text-text-primary">
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
              <p className="text-lg font-mono font-bold text-text-primary">
                {summary.avg_occupancy_pct}%
              </p>
              <p className="text-xs text-text-muted mt-1">
                {Math.round((summary.avg_occupancy_pct / 100) * (model?.total_apartments || 0))} of {model?.total_apartments || 0} units
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

      {/* Revenue Prediction Chart */}
      {predictions.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-cyan-400" />
              <h3 className="text-lg font-semibold text-text-primary">
                Revenue Prediction
              </h3>
            </div>
            <span className="text-xs text-text-muted">Daily projected revenue</span>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart
                data={predictions.map((p) => ({
                  name: formatShortDate(p.date),
                  revenue: p.predicted_revenue_gbp,
                  occupancy: p.predicted_occupancy_pct,
                }))}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22D3EE" stopOpacity={0.25} />
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
                    name === "revenue" ? formatCurrency(Number(value)) : `${value}%`,
                    name === "revenue" ? "Revenue" : "Occupancy",
                  ]}
                  labelStyle={{ color: "#94A3B8" }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#22D3EE"
                  strokeWidth={2}
                  fill="url(#revGrad)"
                  dot={false}
                  activeDot={{ fill: "#22D3EE", stroke: "#0F1729", strokeWidth: 2, r: 5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
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
                <tr className="border-b border-brand-border">
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
                        "border-b border-brand-border last:border-0 hover:bg-brand-bg/50",
                        isToday && "bg-cyan-400/5",
                        isWeekend && "bg-brand-bg/30"
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
                              className="text-[10px] px-1.5 py-0.5 rounded bg-brand-bg text-text-muted"
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
                <div className="grid grid-cols-4 gap-3 mt-4 pt-3 border-t border-brand-border">
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
                  <div className="p-4 rounded-lg bg-brand-bg/50 border border-brand-border">
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
                    : "bg-brand-bg border border-brand-border"
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
              <div className="p-3 rounded-lg bg-brand-bg">
                <p className="text-[10px] text-text-muted uppercase tracking-wider">Trend Slope</p>
                <p className={cn(
                  "text-lg font-mono font-bold mt-1",
                  model.trend_slope > 0 ? "text-emerald-400" : model.trend_slope < 0 ? "text-red-400" : "text-text-muted"
                )}>
                  {model.trend_slope > 0 ? "+" : ""}{model.trend_slope}
                </p>
                <p className="text-[9px] text-text-muted/60">%/day</p>
              </div>
              <div className="p-3 rounded-lg bg-brand-bg">
                <p className="text-[10px] text-text-muted uppercase tracking-wider">Intercept</p>
                <p className="text-lg font-mono font-bold text-text-primary mt-1">{model.trend_intercept}%</p>
                <p className="text-[9px] text-text-muted/60">baseline occupancy</p>
              </div>
              <div className="p-3 rounded-lg bg-brand-bg">
                <p className="text-[10px] text-text-muted uppercase tracking-wider">Avg Rate</p>
                <p className="text-lg font-mono font-bold text-text-primary mt-1">{formatCurrency(model.avg_rate)}</p>
                <p className="text-[9px] text-text-muted/60">per night</p>
              </div>
              <div className="p-3 rounded-lg bg-brand-bg">
                <p className="text-[10px] text-text-muted uppercase tracking-wider">Rate Sensitivity</p>
                <p className="text-lg font-mono font-bold text-text-primary mt-1">{model.avg_rate_sensitivity}</p>
                <p className="text-[9px] text-text-muted/60">occ% per GBP</p>
              </div>
              <div className="p-3 rounded-lg bg-brand-bg">
                <p className="text-[10px] text-text-muted uppercase tracking-wider">Momentum Weight</p>
                <p className="text-lg font-mono font-bold text-text-primary mt-1">{model.momentum_weight}</p>
                <p className="text-[9px] text-text-muted/60">booking pace factor</p>
              </div>
              <div className="p-3 rounded-lg bg-brand-bg">
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
