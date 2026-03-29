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
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from "recharts";

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
        <span className="text-lg font-mono font-bold text-text-primary">
          {score}
        </span>
        <span className="text-[10px] text-text-muted uppercase tracking-wider">
          Health
        </span>
      </div>
    </div>
  );
}

function getOccColor(pct: number): string {
  if (pct > 85) return "#34D399";
  if (pct > 60) return "#FBBF24";
  return "#F87171";
}

const darkTooltipStyle = {
  backgroundColor: "#0F1729",
  border: "1px solid #1E2D44",
  borderRadius: "8px",
  color: "#E2E8F0",
  fontSize: "12px",
};

function OccupancyChart({ forecast }: { forecast: OccupancyForecast[] }) {
  const chartData = forecast.map((f) => ({
    name: new Date(f.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric" }),
    occupancy: f.predicted_occupancy,
    confidence: f.confidence,
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
        <XAxis
          dataKey="name"
          tick={{ fill: "#64748B", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          interval={0}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: "#64748B", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: any) => `${v}%`}
        />
        <Tooltip
          contentStyle={darkTooltipStyle}
          formatter={(value: any) => [`${value}%`, "Occupancy"]}
          labelStyle={{ color: "#94A3B8" }}
        />
        <Bar dataKey="occupancy" radius={[4, 4, 0, 0]}>
          {chartData.map((entry, idx) => (
            <Cell key={idx} fill={getOccColor(entry.occupancy)} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function InsightSeverityDonut({ insights }: { insights: AIInsight[] }) {
  const counts: Record<string, number> = { critical: 0, warning: 0, opportunity: 0, info: 0 };
  insights.forEach((ins) => { counts[ins.severity] = (counts[ins.severity] || 0) + 1; });
  const COLORS: Record<string, string> = {
    critical: "#F87171",
    warning: "#FBBF24",
    opportunity: "#34D399",
    info: "#60A5FA",
  };
  const data = Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([key, value]) => ({ name: key, value, fill: COLORS[key] }));

  if (data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={45}
          outerRadius={70}
          paddingAngle={3}
          dataKey="value"
          stroke="none"
        >
          {data.map((entry, idx) => (
            <Cell key={idx} fill={entry.fill} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={darkTooltipStyle}
          formatter={(value: any, name: any) => [value, name]}
        />
      </PieChart>
    </ResponsiveContainer>
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
        <BrainCircuit className="w-8 h-8 animate-pulse text-bastet-gold" />
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
            <BrainCircuit className="w-6 h-6 text-bastet-gold" />
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
              <p className="text-lg font-mono font-bold text-text-primary mt-1">
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
              <p className="text-lg font-mono font-bold text-emerald-400 mt-1">
                {formatCurrency(data.stats.revenue_opportunity)}
              </p>
              <p className="text-xs text-text-muted mt-1">next 7 days</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <p className="text-xs text-text-muted">Energy Savings</p>
              <p className="text-lg font-mono font-bold text-text-primary mt-1">
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
              <p className="text-lg font-mono font-bold text-text-primary mt-1">
                {data.stats.predicted_occupancy_7d}%
              </p>
              <p className="text-xs text-text-muted mt-1">AI forecast</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Insight Severity Breakdown */}
      {data.insights.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-bastet-gold" />
              <h3 className="text-lg font-semibold text-text-primary">
                Insight Severity
              </h3>
            </div>
            <span className="text-xs text-text-muted">
              {data.insights.length} total
            </span>
          </CardHeader>
          <CardContent>
            <InsightSeverityDonut insights={data.insights} />
            <div className="flex flex-wrap justify-center gap-4 mt-2">
              {[
                { key: "critical", color: "bg-red-400", label: "Critical" },
                { key: "warning", color: "bg-amber-400", label: "Warning" },
                { key: "opportunity", color: "bg-emerald-400", label: "Opportunity" },
                { key: "info", color: "bg-blue-400", label: "Info" },
              ].map((s) => {
                const count = data.insights.filter((i) => i.severity === s.key).length;
                if (count === 0) return null;
                return (
                  <div key={s.key} className="flex items-center gap-1.5">
                    <div className={cn("w-2.5 h-2.5 rounded-full", s.color)} />
                    <span className="text-xs text-text-muted">
                      {s.label} ({count})
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

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
              const TypeIcon = typeIcons[insight.type] || BrainCircuit;

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
