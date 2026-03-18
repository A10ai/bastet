"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BrainCircuit,
  Zap,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Info,
  Sparkles,
  Wrench,
  Wallet,
  Users,
  Building2,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import type {
  AIInsight,
  PricingRecommendation,
  OccupancyForecast,
} from "@/lib/ai-engine";

interface AIData {
  insights: AIInsight[];
  pricing_recommendations: PricingRecommendation[];
  occupancy_forecast: OccupancyForecast[];
  health_score: number;
  stats: {
    total_insights: number;
    revenue_opportunity: number;
    energy_savings_potential: number;
    predicted_occupancy_7d: number;
    ai_actions_taken: number;
  };
}

const severityConfig = {
  critical: { icon: AlertTriangle, color: "text-red-400", bg: "bg-red-400/10", border: "border-red-400/20" },
  warning: { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-400/10", border: "border-amber-400/20" },
  opportunity: { icon: TrendingUp, color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/20" },
  info: { icon: Info, color: "text-blue-400", bg: "bg-blue-400/10", border: "border-blue-400/20" },
};

const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  pricing: Wallet,
  energy: Zap,
  maintenance: Wrench,
  occupancy: Building2,
  revenue: TrendingUp,
  guest: Users,
  housekeeping: Sparkles,
};

function HealthRing({ score }: { score: number }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color =
    score >= 80 ? "#34D399" : score >= 60 ? "#FBBF24" : "#F87171";

  return (
    <div className="relative w-32 h-32">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          className="text-bastet-border"
        />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-mono font-bold text-text-primary">
          {score}
        </span>
        <span className="text-[10px] text-text-muted uppercase tracking-wider">
          Health
        </span>
      </div>
    </div>
  );
}

function OccupancyChart({ forecast }: { forecast: OccupancyForecast[] }) {
  const max = Math.max(...forecast.map((f) => f.predicted_occupancy), 100);

  return (
    <div className="flex items-end gap-1 h-32">
      {forecast.map((f, i) => {
        const height = (f.predicted_occupancy / max) * 100;
        const isWeekend = [0, 6].includes(new Date(f.date).getDay());
        const day = new Date(f.date).toLocaleDateString("en-GB", { weekday: "short" });

        return (
          <div key={f.date} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-[9px] font-mono text-text-muted">
              {f.predicted_occupancy}%
            </span>
            <div
              className={cn(
                "w-full rounded-t transition-all duration-300",
                f.predicted_occupancy > 85
                  ? "bg-emerald-400/80"
                  : f.predicted_occupancy > 60
                  ? "bg-bastet-gold/60"
                  : "bg-red-400/50",
                isWeekend && "opacity-80"
              )}
              style={{ height: `${height}%` }}
              title={`${f.date}: ${f.predicted_occupancy}% (${f.confidence}% confidence)`}
            />
            {i < 7 && (
              <span className="text-[9px] text-text-muted">{day}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function AICommandCentre() {
  const [data, setData] = useState<AIData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAI = async () => {
      try {
        const res = await fetch("/api/v1/ai/insights");
        const json = await res.json();
        setData(json.data);
      } catch {
        // Handle silently
      } finally {
        setLoading(false);
      }
    };
    fetchAI();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <BrainCircuitclassName="w-8 h-8 animate-pulse text-bastet-gold" />
        <p className="text-sm text-text-secondary">
          AI is analysing property data...
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-24">
        <p className="text-text-secondary">Failed to load AI insights</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BrainCircuitclassName="w-6 h-6 text-bastet-gold" />
            <h1 className="text-xl md:text-2xl font-display font-bold text-text-primary">
              AI Command Centre
            </h1>
          </div>
          <p className="text-sm text-text-secondary mt-1">
            Real-time intelligence across all property systems
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-bastet-gold-muted border border-bastet-gold/20 self-start">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-medium text-bastet-gold">
            Live analysis
          </span>
        </div>
      </div>

      {/* Top stats + Health ring */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-1">
          <CardContent className="flex flex-col items-center justify-center py-6">
            <HealthRing score={data.health_score} />
            <p className="text-xs text-text-muted mt-2">Property Score</p>
          </CardContent>
        </Card>

        <div className="lg:col-span-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent>
              <p className="text-xs text-text-muted">Active Insights</p>
              <p className="text-2xl font-mono font-bold text-text-primary mt-1">
                {data.stats.total_insights}
              </p>
              <p className="text-xs text-text-muted mt-1">
                {data.stats.ai_actions_taken} need action
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <p className="text-xs text-text-muted">Revenue Opportunity</p>
              <p className="text-2xl font-mono font-bold text-emerald-400 mt-1">
                {formatCurrency(data.stats.revenue_opportunity)}
              </p>
              <p className="text-xs text-text-muted mt-1">next 7 days</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <p className="text-xs text-text-muted">Energy Savings</p>
              <p className="text-2xl font-mono font-bold text-text-primary mt-1">
                {data.stats.energy_savings_potential > 0
                  ? formatCurrency(data.stats.energy_savings_potential)
                  : "Optimal"}
              </p>
              <p className="text-xs text-text-muted mt-1">
                {data.stats.energy_savings_potential > 0
                  ? "monthly potential"
                  : "aligned with occupancy"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <p className="text-xs text-text-muted">7-Day Occupancy</p>
              <p className="text-2xl font-mono font-bold text-text-primary mt-1">
                {data.stats.predicted_occupancy_7d}%
              </p>
              <p className="text-xs text-text-muted mt-1">AI forecast</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Insights + Pricing side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AI Insights */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-bastet-gold" />
              <h3 className="text-lg font-semibold text-text-primary">
                AI Insights
              </h3>
            </div>
            <span className="text-xs text-text-muted">
              {data.insights.length} active
            </span>
          </CardHeader>
          <CardContent className="space-y-3 max-h-[480px] overflow-y-auto">
            {data.insights.map((insight) => {
              const config = severityConfig[insight.severity];
              const SeverityIcon = config.icon;
              const TypeIcon = typeIcons[insight.type] || Brain;

              return (
                <div
                  key={insight.id}
                  className={cn(
                    "p-4 rounded-lg border",
                    config.bg,
                    config.border
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <SeverityIcon className={cn("w-4 h-4", config.color)} />
                      <TypeIcon className="w-3.5 h-3.5 text-text-muted" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-sm font-semibold text-text-primary">
                          {insight.title}
                        </h4>
                        <span className="text-[10px] font-mono text-text-muted shrink-0">
                          {insight.confidence}% conf
                        </span>
                      </div>
                      <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                        {insight.description}
                      </p>
                      {insight.impact && (
                        <p className="text-xs text-emerald-400 mt-1.5 font-medium">
                          {insight.impact}
                        </p>
                      )}
                      {insight.action && (
                        <p className="text-xs text-bastet-gold mt-1 font-medium">
                          → {insight.action}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Pricing Recommendations */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-bastet-gold" />
              <h3 className="text-lg font-semibold text-text-primary">
                Dynamic Pricing
              </h3>
            </div>
            <span className="text-xs text-text-muted">Next 7 days</span>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-bastet-border">
                  <th className="text-left text-xs font-medium text-text-muted px-4 md:px-6 py-3">
                    Type
                  </th>
                  <th className="text-right text-xs font-medium text-text-muted px-4 md:px-6 py-3">
                    Current
                  </th>
                  <th className="text-right text-xs font-medium text-text-muted px-4 md:px-6 py-3">
                    AI Suggested
                  </th>
                  <th className="text-right text-xs font-medium text-text-muted px-4 md:px-6 py-3">
                    Change
                  </th>
                  <th className="text-right text-xs font-medium text-text-muted px-4 md:px-6 py-3">
                    Confidence
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.pricing_recommendations.map((rec) => (
                  <tr
                    key={rec.apartment_type}
                    className="border-b border-bastet-border last:border-0 hover:bg-bastet-bg/50"
                  >
                    <td className="px-4 md:px-6 py-3 text-sm text-text-primary font-medium">
                      {rec.apartment_type}
                    </td>
                    <td className="px-4 md:px-6 py-3 text-sm font-mono text-text-secondary text-right">
                      {formatCurrency(rec.current_rate)}
                    </td>
                    <td className="px-4 md:px-6 py-3 text-sm font-mono text-text-primary text-right font-bold">
                      {formatCurrency(rec.recommended_rate)}
                    </td>
                    <td className="px-4 md:px-6 py-3 text-right">
                      <span
                        className={cn(
                          "inline-flex items-center gap-0.5 text-xs font-mono font-bold",
                          rec.change_percent > 0
                            ? "text-emerald-400"
                            : rec.change_percent < 0
                            ? "text-red-400"
                            : "text-text-muted"
                        )}
                      >
                        {rec.change_percent > 0 ? (
                          <ArrowUpRight className="w-3 h-3" />
                        ) : rec.change_percent < 0 ? (
                          <ArrowDownRight className="w-3 h-3" />
                        ) : null}
                        {rec.change_percent > 0 ? "+" : ""}
                        {rec.change_percent}%
                      </span>
                    </td>
                    <td className="px-4 md:px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-12 h-1.5 bg-bastet-bg rounded-full overflow-hidden">
                          <div
                            className="h-full bg-bastet-gold rounded-full"
                            style={{ width: `${rec.confidence}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-mono text-text-muted">
                          {Math.round(rec.confidence)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            {data.pricing_recommendations.length > 0 && (
              <div className="px-4 md:px-6 py-3 border-t border-bastet-border">
                <p className="text-xs text-text-muted italic">
                  {data.pricing_recommendations[0].reason}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Occupancy Forecast */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-bastet-gold" />
            <h3 className="text-lg font-semibold text-text-primary">
              14-Day Occupancy Forecast
            </h3>
          </div>
          <span className="text-xs text-text-muted">AI prediction</span>
        </CardHeader>
        <CardContent>
          <OccupancyChart forecast={data.occupancy_forecast} />
          <div className="flex flex-wrap items-center gap-4 md:gap-6 mt-4 pt-4 border-t border-bastet-border">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-emerald-400/80" />
              <span className="text-xs text-text-muted">&gt;85% High</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-bastet-gold/60" />
              <span className="text-xs text-text-muted">60-85% Normal</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-red-400/50" />
              <span className="text-xs text-text-muted">&lt;60% Low</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
