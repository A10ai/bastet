"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  TrendingUp,
  AlertTriangle,
  ShieldAlert,
  Smile,
  ChevronDown,
  ChevronRight,
  Send,
  ArrowUpRight,
  Crown,
  Lightbulb,
  Users,
  Globe,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type {
  GuestScore,
  ChurnRiskGuest,
  UpsellOpportunity,
  SegmentAnalysis,
  GuestPrediction,
  GuestInsight,
  GuestIntelligenceData,
} from "@/lib/guest-intelligence";
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
import type { RechartsValue, RechartsName } from "@/types/recharts";

// ---------------------------------------------------------------------------
// Tier badge colors (matching guests page)
// ---------------------------------------------------------------------------

const TIER_COLORS: Record<string, string> = {
  bronze: "bg-orange-900/20 text-orange-400",
  silver: "bg-gray-400/20 text-gray-300",
  gold: "bg-bastet-gold-muted text-bastet-gold",
  platinum: "bg-purple-400/20 text-purple-300",
};

// ---------------------------------------------------------------------------
// Progress bar component
// ---------------------------------------------------------------------------

function ScoreBar({
  value,
  color,
  label,
}: {
  value: number;
  color: string;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-1.5 bg-bastet-bg rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <span className="text-xs font-mono text-text-secondary w-8 text-right">
        {label ?? value}
      </span>
    </div>
  );
}

function churnBarColor(risk: number): string {
  if (risk > 60) return "bg-red-500";
  if (risk > 30) return "bg-yellow-500";
  return "bg-emerald-500";
}

function severityColor(severity: string): string {
  if (severity === "critical") return "border-red-500/40 bg-red-500/5";
  if (severity === "warning") return "border-yellow-500/40 bg-yellow-500/5";
  return "border-cyan-500/40 bg-cyan-500/5";
}

function severityDot(severity: string): string {
  if (severity === "critical") return "bg-red-500";
  if (severity === "warning") return "bg-yellow-500";
  return "bg-cyan-400";
}

// ---------------------------------------------------------------------------
// Dark tooltip style
// ---------------------------------------------------------------------------

const darkTooltipStyle = {
  backgroundColor: "#0F1729",
  border: "1px solid #1E2D44",
  borderRadius: "8px",
  color: "#E2E8F0",
  fontSize: "12px",
};

const TIER_CHART_COLORS: Record<string, string> = {
  bronze: "#F97316",
  silver: "#94A3B8",
  gold: "#FBBF24",
  platinum: "#A78BFA",
};

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function GuestIntelligencePage() {
  const [data, setData] = useState<GuestIntelligenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [sortField, setSortField] = useState<keyof GuestScore>("ltv");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/v1/ai/guests");
        const json = await res.json();
        if (json.error) {
          setError(json.error);
        } else {
          setData(json.data);
        }
      } catch {
        setError("Failed to load guest intelligence data");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
        <span className="ml-3 text-text-secondary">
          Analysing guest data...
        </span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center">
        <AlertTriangle className="w-10 h-10 text-red-400 mb-3" />
        <p className="text-text-secondary">{error || "No data available"}</p>
      </div>
    );
  }

  const {
    scores,
    churn_risks,
    upsell_opportunities,
    segments,
    predictions,
    insights,
  } = data;

  // Compute top-level stats
  const totalLTV = scores.reduce((s, g) => s + g.ltv, 0);
  const atRiskCount = churn_risks.length;
  const upsellCount = upsell_opportunities.reduce(
    (s, o) => s + o.target_guests.length,
    0
  );
  const avgSatisfaction =
    scores.length > 0
      ? Math.round(
          scores.reduce((s, g) => s + g.satisfaction_score, 0) / scores.length
        )
      : 0;

  // Sort scores
  const sortedScores = [...scores].sort((a, b) => {
    const aVal = a[sortField] ?? 0;
    const bVal = b[sortField] ?? 0;
    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortAsc
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    }
    return sortAsc
      ? (aVal as number) - (bVal as number)
      : (bVal as number) - (aVal as number);
  });

  function handleSort(field: keyof GuestScore) {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  }

  const predictionMap: Record<string, GuestPrediction> = {};
  for (const p of predictions) {
    predictionMap[p.guest_id] = p;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold text-text-primary">
          Guest Intelligence
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          AI-powered analysis of {scores.length} guest profiles
        </p>
      </div>

      {/* A. Top Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Guest LTV"
          value={formatCurrency(totalLTV)}
          icon={<TrendingUp className="w-5 h-5 text-cyan-400" />}
          accent="cyan"
        />
        <StatCard
          label="At-Risk Guests"
          value={String(atRiskCount)}
          icon={<ShieldAlert className="w-5 h-5 text-red-400" />}
          accent="red"
        />
        <StatCard
          label="Upsell Opportunities"
          value={String(upsellCount)}
          icon={<ArrowUpRight className="w-5 h-5 text-emerald-400" />}
          accent="emerald"
        />
        <StatCard
          label="Avg Satisfaction"
          value={`${avgSatisfaction}/100`}
          icon={<Smile className="w-5 h-5 text-yellow-400" />}
          accent="yellow"
        />
      </div>

      {/* B. Guest Score Table */}
      <Card>
        <CardHeader className="pb-2">
          <h2 className="text-lg font-semibold text-text-primary">
            Guest Scores
          </h2>
          <p className="text-xs text-text-muted">
            Click any column header to sort. Click a row to expand predictions.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-bastet-border">
                  {([
                    ["first_name", "Name"],
                    ["loyalty_tier", "Tier"],
                    ["ltv", "LTV"],
                    ["churn_risk", "Churn Risk"],
                    ["upsell_score", "Upsell"],
                    ["satisfaction_score", "Satisfaction"],
                    ["last_stay_date", "Last Stay"],
                  ] as [keyof GuestScore, string][]).map(([field, label]) => (
                    <th
                      key={field}
                      onClick={() => handleSort(field)}
                      className="text-left text-xs font-medium text-text-muted px-4 py-3 cursor-pointer hover:text-text-primary transition-colors select-none"
                    >
                      <span className="flex items-center gap-1">
                        {label}
                        {sortField === field && (
                          <span className="text-cyan-400">
                            {sortAsc ? "\u2191" : "\u2193"}
                          </span>
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedScores.map((guest) => {
                  const isExpanded = expandedRow === guest.guest_id;
                  const prediction = predictionMap[guest.guest_id];
                  return (
                    <GuestScoreRow
                      key={guest.guest_id}
                      guest={guest}
                      isExpanded={isExpanded}
                      prediction={prediction}
                      onToggle={() =>
                        setExpandedRow(isExpanded ? null : guest.guest_id)
                      }
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
          {sortedScores.length === 0 && (
            <div className="flex flex-col items-center py-12 text-center">
              <Users className="w-8 h-8 text-text-muted mb-2" />
              <p className="text-sm text-text-secondary">
                No guest data available
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* C. Churn Risk Panel */}
      {churn_risks.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-red-400" />
              <h2 className="text-lg font-semibold text-text-primary">
                Churn Risk Alerts
              </h2>
            </div>
            <p className="text-xs text-text-muted">
              {churn_risks.length} guest{churn_risks.length !== 1 ? "s" : ""}{" "}
              with churn risk above 60
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {churn_risks.map((guest) => (
              <div
                key={guest.guest_id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-bastet-bg border border-bastet-border"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-text-primary truncate">
                      {guest.first_name} {guest.last_name}
                    </span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${TIER_COLORS[guest.loyalty_tier] || TIER_COLORS.bronze}`}
                    >
                      {guest.loyalty_tier}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-1">
                    <span className="text-xs text-text-muted">
                      {guest.days_since_last_stay} days since last stay
                    </span>
                    <span className="text-xs text-text-muted">
                      {formatCurrency(guest.total_spend_gbp)} lifetime
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-24">
                    <ScoreBar
                      value={guest.churn_risk}
                      color={churnBarColor(guest.churn_risk)}
                    />
                  </div>
                  <span className="text-xs text-text-muted w-28 text-right">
                    {guest.suggested_action}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="border border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 text-xs"
                  >
                    <Send className="w-3 h-3 mr-1" />
                    Win-back
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* D. Upsell Opportunities */}
      {upsell_opportunities.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2">
            <ArrowUpRight className="w-5 h-5 text-emerald-400" />
            Upsell Opportunities
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {upsell_opportunities.map((opp) => (
              <UpsellCard key={opp.type} opportunity={opp} />
            ))}
          </div>
        </div>
      )}

      {/* LTV Distribution */}
      <Card>
        <CardHeader className="pb-2">
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-cyan-400" />
            LTV Distribution
          </h2>
          <p className="text-xs text-text-muted">
            Guest lifetime value spread across tiers
          </p>
        </CardHeader>
        <CardContent>
          {(() => {
            const ltvBuckets = [
              { label: "0-500", min: 0, max: 500 },
              { label: "500-1k", min: 500, max: 1000 },
              { label: "1k-2k", min: 1000, max: 2000 },
              { label: "2k-5k", min: 2000, max: 5000 },
              { label: "5k+", min: 5000, max: Infinity },
            ];
            const bucketData = ltvBuckets.map((b) => ({
              name: b.label,
              count: scores.filter((g) => g.ltv >= b.min && g.ltv < b.max).length,
            }));
            return (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={bucketData} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
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
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={darkTooltipStyle}
                    formatter={(value: RechartsValue) => [value, "Guests"]}
                    labelStyle={{ color: "#94A3B8" }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} fill="#22D3EE" fillOpacity={0.8} />
                </BarChart>
              </ResponsiveContainer>
            );
          })()}
        </CardContent>
      </Card>

      {/* E. Segment Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Loyalty Tier Breakdown - Donut */}
        <Card>
          <CardHeader className="pb-2">
            <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
              <Crown className="w-5 h-5 text-cyan-400" />
              Loyalty Tier Breakdown
            </h2>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={segments.loyalty_tiers.map((tier) => ({
                    name: tier.tier,
                    value: tier.count,
                    fill: TIER_CHART_COLORS[tier.tier] || "#22D3EE",
                  }))}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="none"
                >
                  {segments.loyalty_tiers.map((tier, idx) => (
                    <Cell key={idx} fill={TIER_CHART_COLORS[tier.tier] || "#22D3EE"} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={darkTooltipStyle}
                  formatter={(value: RechartsValue, name: RechartsName) => [
                    `${value} guests`,
                    String(name ?? "").charAt(0).toUpperCase() + String(name ?? "").slice(1),
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap justify-center gap-4 mt-2">
              {segments.loyalty_tiers.map((tier) => (
                <div key={tier.tier} className="flex items-center gap-1.5">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: TIER_CHART_COLORS[tier.tier] || "#22D3EE" }}
                  />
                  <span className="text-xs text-text-muted capitalize">
                    {tier.tier} ({tier.count})
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2">
              {segments.loyalty_tiers.map((tier) => (
                <div key={tier.tier} className="flex gap-4 text-[11px] text-text-muted">
                  <span className="capitalize w-16 font-medium text-text-secondary">{tier.tier}</span>
                  <span>{formatCurrency(tier.total_revenue)} revenue</span>
                  <span>Avg spend: {formatCurrency(tier.avg_spend)}</span>
                  <span>Avg stays: {tier.avg_stays}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Nationalities - Bar Chart */}
        <Card>
          <CardHeader className="pb-2">
            <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
              <Globe className="w-5 h-5 text-cyan-400" />
              Guest Origin
            </h2>
          </CardHeader>
          <CardContent>
            {segments.top_nationalities.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={segments.top_nationalities.map((nat) => ({
                      name: nat.nationality,
                      guests: nat.count,
                      revenue: nat.total_revenue,
                    }))}
                    layout="vertical"
                    margin={{ top: 4, right: 10, left: 0, bottom: 0 }}
                  >
                    <XAxis
                      type="number"
                      tick={{ fill: "#64748B", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fill: "#94A3B8", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={80}
                    />
                    <Tooltip
                      contentStyle={darkTooltipStyle}
                      formatter={(value: RechartsValue, name: RechartsName) => [
                        name === "revenue" ? formatCurrency(Number(value)) : value,
                        name === "revenue" ? "Revenue" : "Guests",
                      ]}
                      labelStyle={{ color: "#94A3B8" }}
                    />
                    <Bar dataKey="guests" fill="#22D3EE" fillOpacity={0.8} radius={[0, 4, 4, 0]} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              </>
            ) : (
              <p className="text-sm text-text-muted text-center py-4">
                No nationality data available
              </p>
            )}

            {/* Avg LOS by tier */}
            <div className="pt-4 border-t border-bastet-border mt-4">
              <h3 className="text-sm font-medium text-text-secondary mb-2">
                Avg Length of Stay by Tier
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {segments.avg_length_of_stay_by_tier.map((t) => (
                  <div
                    key={t.tier}
                    className="flex items-center justify-between p-2 rounded-md bg-bastet-bg"
                  >
                    <span className="text-xs capitalize text-text-secondary">
                      {t.tier}
                    </span>
                    <span className="text-sm font-mono text-text-primary">
                      {t.avg_nights} nights
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* F. AI Insights Panel */}
      {insights.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-yellow-400" />
              AI Insights
            </h2>
            <p className="text-xs text-text-muted">
              Data-driven recommendations based on guest behaviour patterns
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {insights.map((insight) => (
              <div
                key={insight.id}
                className={`p-4 rounded-lg border ${severityColor(insight.severity)}`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${severityDot(insight.severity)}`}
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-text-primary">
                      {insight.title}
                    </h3>
                    <p className="text-xs text-text-secondary mt-0.5">
                      {insight.description}
                    </p>
                    <p className="text-xs text-cyan-400 mt-1.5">
                      {insight.recommendation}
                    </p>
                    {insight.metric && (
                      <span className="inline-block mt-1.5 text-[10px] font-mono text-text-muted bg-bastet-bg px-2 py-0.5 rounded">
                        {insight.metric}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent: string;
}) {
  const borderColor: Record<string, string> = {
    cyan: "border-cyan-500/20",
    red: "border-red-500/20",
    emerald: "border-emerald-500/20",
    yellow: "border-yellow-500/20",
  };

  return (
    <Card className={`border ${borderColor[accent] || "border-bastet-border"}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-text-muted">{label}</p>
            <p className="text-xl font-bold text-text-primary mt-1">{value}</p>
          </div>
          <div className="p-2 rounded-lg bg-bastet-bg">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function GuestScoreRow({
  guest,
  isExpanded,
  prediction,
  onToggle,
}: {
  guest: GuestScore;
  isExpanded: boolean;
  prediction?: GuestPrediction;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-bastet-border last:border-0 hover:bg-bastet-bg/50 transition-colors cursor-pointer"
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
            )}
            <span className="text-sm font-semibold text-text-primary">
              {guest.first_name} {guest.last_name}
            </span>
          </div>
        </td>
        <td className="px-4 py-3">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${TIER_COLORS[guest.loyalty_tier] || TIER_COLORS.bronze}`}
          >
            {guest.loyalty_tier}
          </span>
        </td>
        <td className="px-4 py-3 text-sm font-mono text-text-primary">
          {formatCurrency(guest.ltv)}
        </td>
        <td className="px-4 py-3 w-36">
          <ScoreBar
            value={guest.churn_risk}
            color={churnBarColor(guest.churn_risk)}
          />
        </td>
        <td className="px-4 py-3 w-36">
          <ScoreBar value={guest.upsell_score} color="bg-emerald-500" />
        </td>
        <td className="px-4 py-3 w-36">
          <ScoreBar value={guest.satisfaction_score} color="bg-cyan-400" />
        </td>
        <td className="px-4 py-3 text-sm text-text-secondary">
          {guest.last_stay_date
            ? new Date(guest.last_stay_date).toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })
            : "Never"}
        </td>
      </tr>
      {isExpanded && prediction && (
        <tr className="border-b border-bastet-border bg-bastet-bg/30">
          <td colSpan={7} className="px-4 py-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pl-6">
              <div>
                <span className="text-[10px] uppercase text-text-muted tracking-wider">
                  Next Booking Probability
                </span>
                <p className="text-sm font-semibold text-text-primary mt-0.5">
                  {Math.round(prediction.next_booking_probability * 100)}%
                </p>
              </div>
              <div>
                <span className="text-[10px] uppercase text-text-muted tracking-wider">
                  Predicted Stay Value
                </span>
                <p className="text-sm font-semibold text-text-primary mt-0.5">
                  {formatCurrency(prediction.predicted_next_stay_value)}
                </p>
              </div>
              <div>
                <span className="text-[10px] uppercase text-text-muted tracking-wider">
                  Recommended Room
                </span>
                <p className="text-sm font-semibold text-text-primary mt-0.5">
                  {prediction.recommended_room_type}
                </p>
              </div>
              <div>
                <span className="text-[10px] uppercase text-text-muted tracking-wider">
                  Best Outreach Timing
                </span>
                <p className="text-sm font-semibold text-cyan-400 mt-0.5">
                  {prediction.best_outreach_timing}
                </p>
              </div>
            </div>
          </td>
        </tr>
      )}
      {isExpanded && !prediction && (
        <tr className="border-b border-bastet-border bg-bastet-bg/30">
          <td colSpan={7} className="px-4 py-4">
            <div className="pl-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <span className="text-[10px] uppercase text-text-muted tracking-wider">
                    Total Spend
                  </span>
                  <p className="text-sm font-semibold text-text-primary mt-0.5">
                    {formatCurrency(guest.total_spend_gbp)}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-text-muted tracking-wider">
                    Avg Spend/Night
                  </span>
                  <p className="text-sm font-semibold text-text-primary mt-0.5">
                    {formatCurrency(guest.avg_spend_per_night)}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-text-muted tracking-wider">
                    Total Stays
                  </span>
                  <p className="text-sm font-semibold text-text-primary mt-0.5">
                    {guest.total_stays}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-text-muted tracking-wider">
                    Booking Frequency
                  </span>
                  <p className="text-sm font-semibold text-text-primary mt-0.5">
                    {guest.booking_frequency_days
                      ? `Every ${guest.booking_frequency_days} days`
                      : "N/A"}
                  </p>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function UpsellCard({ opportunity }: { opportunity: UpsellOpportunity }) {
  const typeIcons: Record<string, React.ReactNode> = {
    room_upgrade: <ArrowUpRight className="w-5 h-5 text-emerald-400" />,
    extend_stay: <TrendingUp className="w-5 h-5 text-cyan-400" />,
    vip_package: <Crown className="w-5 h-5 text-purple-400" />,
  };

  const typeBorders: Record<string, string> = {
    room_upgrade: "border-emerald-500/20",
    extend_stay: "border-cyan-500/20",
    vip_package: "border-purple-500/20",
  };

  return (
    <Card className={`border ${typeBorders[opportunity.type] || "border-bastet-border"}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          {typeIcons[opportunity.type]}
          <h3 className="text-sm font-semibold text-text-primary">
            {opportunity.label}
          </h3>
        </div>
        <p className="text-xs text-text-secondary">{opportunity.description}</p>
        <div className="flex items-center justify-between pt-2 border-t border-bastet-border">
          <span className="text-xs text-text-muted">
            {opportunity.target_guests.length} guest
            {opportunity.target_guests.length !== 1 ? "s" : ""}
          </span>
          <span className="text-sm font-mono font-semibold text-emerald-400">
            +{formatCurrency(opportunity.estimated_revenue_impact)}
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {opportunity.target_guests.slice(0, 5).map((g) => (
            <span
              key={g.guest_id}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] bg-bastet-bg text-text-secondary"
            >
              {g.first_name} {g.last_name}
            </span>
          ))}
          {opportunity.target_guests.length > 5 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] bg-bastet-bg text-text-muted">
              +{opportunity.target_guests.length - 5} more
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
