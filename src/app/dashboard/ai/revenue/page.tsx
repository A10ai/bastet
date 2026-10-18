"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, DollarSign, BarChart3, Percent, Globe, SlidersHorizontal, Calendar } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { RevenueData } from "@/lib/revenue-engine";
import { getChannelColor, StatCard, ChannelMixDonut, EfficiencyBar, LOSBarChart, ForecastChart, AIInsight, WhatIfSimulator } from "@/components/ai/revenue-sections";

export default function RevenueCopilotPage() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/v1/ai/revenue");
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        setData(json.data);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load revenue data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
          <span className="text-text-secondary">Loading Revenue Copilot...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-2">
          <p className="text-red-400">{error || "No data available"}</p>
          <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const { overview, channel_mix, rate_performance, los_analysis, revenue_forecast } = data;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <BarChart3 className="w-7 h-7 text-emerald-400" />
          Revenue Copilot
        </h1>
        <p className="text-sm text-text-muted mt-1">
          AI-powered revenue management, channel optimization, and rate intelligence
        </p>
      </div>

      {/* A. Revenue Stats (5 cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 [&>*:last-child]:col-span-2 [&>*:last-child]:sm:col-span-1">
        <StatCard
          label="Total Revenue"
          value={formatCurrency(overview.total_revenue_gbp)}
          subValue={`${overview.total_bookings} bookings, ${overview.total_room_nights} nights`}
          trend={overview.month_over_month_change_pct}
          icon={DollarSign}
          color="emerald"
        />
        <StatCard
          label="ADR"
          value={formatCurrency(overview.avg_daily_rate)}
          subValue="Average Daily Rate"
          icon={TrendingUp}
          color="emerald"
        />
        <StatCard
          label="RevPAR"
          value={formatCurrency(overview.revpar)}
          subValue={`${overview.total_apartments} apartments`}
          icon={BarChart3}
          color="cyan"
        />
        <StatCard
          label="Net Revenue"
          value={formatCurrency(overview.net_revenue)}
          subValue={`After ${formatCurrency(overview.commission_cost_total)} commissions`}
          icon={Percent}
          color="emerald"
        />
        <StatCard
          label="Direct Bookings"
          value={`${overview.direct_booking_percentage}%`}
          subValue={overview.direct_booking_percentage >= 40 ? "On target (40%+)" : "Below 40% target"}
          icon={Globe}
          color={overview.direct_booking_percentage >= 40 ? "emerald" : "amber"}
        />
      </div>

      {/* B. Channel Mix Panel */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-primary">Channel Mix Analysis</h2>
            <span className="text-xs text-text-muted">
              {channel_mix.channels.length} channels
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <ChannelMixDonut channels={channel_mix.channels} />

          {/* Channel table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm" role="table" aria-label="Channel mix breakdown">
              <thead>
                <tr className="border-b border-brand-border">
                  <th className="text-left py-2 px-3 text-text-muted font-medium">Channel</th>
                  <th className="text-right py-2 px-3 text-text-muted font-medium">Bookings</th>
                  <th className="text-right py-2 px-3 text-text-muted font-medium">Revenue</th>
                  <th className="text-right py-2 px-3 text-text-muted font-medium">Comm. %</th>
                  <th className="text-right py-2 px-3 text-text-muted font-medium">Commission</th>
                  <th className="text-right py-2 px-3 text-text-muted font-medium">Net Revenue</th>
                  <th className="text-right py-2 px-3 text-text-muted font-medium">Avg Value</th>
                </tr>
              </thead>
              <tbody>
                {channel_mix.channels.map((ch) => (
                  <tr
                    key={ch.channel_code}
                    className="border-b border-brand-border/50 hover:bg-brand-bg/50 transition-colors"
                  >
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: getChannelColor(ch.channel_code) }}
                        />
                        <span className="text-text-primary">{ch.channel_name}</span>
                      </div>
                    </td>
                    <td className="text-right py-2.5 px-3 text-text-secondary">
                      {ch.booking_count}
                    </td>
                    <td className="text-right py-2.5 px-3 text-emerald-400 font-medium">
                      {formatCurrency(ch.revenue_gbp)}
                    </td>
                    <td className="text-right py-2.5 px-3 text-text-secondary">
                      {ch.commission_rate > 0 ? (
                        <span className="text-amber-400">{Math.round(ch.commission_rate * 100)}%</span>
                      ) : (
                        <span className="text-emerald-400">0%</span>
                      )}
                    </td>
                    <td className="text-right py-2.5 px-3">
                      {ch.commission_cost_gbp > 0 ? (
                        <span className="text-red-400">{formatCurrency(ch.commission_cost_gbp)}</span>
                      ) : (
                        <span className="text-text-muted">--</span>
                      )}
                    </td>
                    <td className="text-right py-2.5 px-3 text-emerald-400 font-medium">
                      {formatCurrency(ch.net_revenue_gbp)}
                    </td>
                    <td className="text-right py-2.5 px-3 text-text-secondary">
                      {formatCurrency(ch.avg_booking_value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* AI Recommendation */}
          <AIInsight
            title="Channel Optimization"
            summary={channel_mix.ai_recommendation.summary}
            actions={channel_mix.ai_recommendation.actions}
            savings={channel_mix.ai_recommendation.estimated_annual_savings_gbp}
          />
        </CardContent>
      </Card>

      {/* C. Rate Performance Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-primary">Rate Performance</h2>
            <span className="text-xs text-text-muted">By apartment type</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" role="table" aria-label="Rate performance by apartment type">
              <thead>
                <tr className="border-b border-brand-border">
                  <th className="text-left py-2 px-3 text-text-muted font-medium">Type</th>
                  <th className="text-right py-2 px-3 text-text-muted font-medium">Base Rate</th>
                  <th className="text-right py-2 px-3 text-text-muted font-medium">Avg Actual</th>
                  <th className="text-right py-2 px-3 text-text-muted font-medium">Occupancy</th>
                  <th className="text-center py-2 px-3 text-text-muted font-medium">Rate Efficiency</th>
                  <th className="text-right py-2 px-3 text-text-muted font-medium">RevPAU</th>
                  <th className="text-left py-2 px-3 text-text-muted font-medium">AI Insight</th>
                </tr>
              </thead>
              <tbody>
                {rate_performance.map((rp) => (
                  <tr
                    key={rp.apartment_type_id}
                    className="border-b border-brand-border/50 hover:bg-brand-bg/50 transition-colors"
                  >
                    <td className="py-2.5 px-3 text-text-primary font-medium">
                      {rp.apartment_type_name}
                    </td>
                    <td className="text-right py-2.5 px-3 text-text-secondary">
                      {formatCurrency(rp.base_rate_gbp)}
                    </td>
                    <td className="text-right py-2.5 px-3 text-emerald-400 font-medium">
                      {formatCurrency(rp.avg_actual_rate_gbp)}
                    </td>
                    <td className="text-right py-2.5 px-3">
                      <span
                        className={
                          rp.occupancy_pct >= 80
                            ? "text-emerald-400"
                            : rp.occupancy_pct >= 50
                            ? "text-cyan-400"
                            : "text-amber-400"
                        }
                      >
                        {rp.occupancy_pct}%
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <EfficiencyBar value={rp.rate_efficiency} />
                    </td>
                    <td className="text-right py-2.5 px-3 text-emerald-400 font-medium">
                      {formatCurrency(rp.revpau)}
                    </td>
                    <td className="py-2.5 px-3 text-text-muted text-xs max-w-[250px]">
                      {rp.ai_suggestion}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* D. What-If Simulator */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-semibold text-text-primary">What-If Rate Simulator</h2>
          </div>
          <p className="text-xs text-text-muted mt-1">
            Adjust rates and see projected impact on occupancy and revenue in real-time
          </p>
        </CardHeader>
        <CardContent>
          <WhatIfSimulator ratePerformance={rate_performance} />
        </CardContent>
      </Card>

      {/* E. Length of Stay Analysis */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-text-primary">Length of Stay Analysis</h2>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-medium text-text-secondary mb-4">
                Booking Distribution by LOS
              </h3>
              <LOSBarChart analysis={los_analysis} />
            </div>

            <div>
              <h3 className="text-sm font-medium text-text-secondary mb-4">
                Revenue per Bracket
              </h3>
              <div className="space-y-3">
                {los_analysis.brackets.map((br) => {
                  const maxRev = Math.max(
                    ...los_analysis.brackets.map((b) => b.total_revenue_gbp),
                    1
                  );
                  const pct = (br.total_revenue_gbp / maxRev) * 100;
                  return (
                    <div key={br.label} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-text-secondary">{br.label}</span>
                        <span className="text-emerald-400 font-medium">
                          {formatCurrency(br.total_revenue_gbp)}
                        </span>
                      </div>
                      <div className="h-2 bg-brand-bg rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
                          style={{ width: `${Math.max(2, pct)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-text-muted">
                        <span>{br.percentage_of_bookings}% of bookings</span>
                        <span>Avg {formatCurrency(br.avg_rate_per_night)}/night</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Discount tiers */}
              <div className="mt-4 pt-4 border-t border-brand-border">
                <h4 className="text-xs text-text-muted uppercase tracking-wider mb-2">
                  Current Discount Tiers
                </h4>
                <div className="flex flex-wrap gap-2">
                  {los_analysis.discount_tiers.map((tier) => (
                    <span
                      key={tier.min_nights}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-400 text-xs"
                    >
                      {tier.min_nights}+ nights: {Math.round(tier.discount * 100)}% off
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <AIInsight
            title="LOS Intelligence"
            summary={los_analysis.ai_recommendation.summary}
            actions={los_analysis.ai_recommendation.actions}
          />
        </CardContent>
      </Card>

      {/* F. 30-Day Revenue Forecast */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-emerald-400" />
              <h2 className="text-lg font-semibold text-text-primary">30-Day Revenue Forecast</h2>
            </div>
            <div className="flex flex-wrap items-center gap-3 md:gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-text-muted">Confirmed:</span>
                <span className="text-cyan-400 font-medium">
                  {formatCurrency(revenue_forecast.total_confirmed)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-text-muted">Projected:</span>
                <span className="text-emerald-400 font-medium">
                  {formatCurrency(revenue_forecast.total_projected_mid)}
                </span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ForecastChart forecast={revenue_forecast} />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-brand-bg rounded-lg p-3 text-center">
              <p className="text-xs text-text-muted">Conservative</p>
              <p className="text-lg font-bold text-text-secondary">
                {formatCurrency(revenue_forecast.total_projected_low)}
              </p>
            </div>
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3 text-center">
              <p className="text-xs text-emerald-400">Expected</p>
              <p className="text-lg font-bold text-emerald-400">
                {formatCurrency(revenue_forecast.total_projected_mid)}
              </p>
            </div>
            <div className="bg-brand-bg rounded-lg p-3 text-center">
              <p className="text-xs text-text-muted">Optimistic</p>
              <p className="text-lg font-bold text-text-secondary">
                {formatCurrency(revenue_forecast.total_projected_high)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
