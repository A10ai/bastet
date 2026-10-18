"use client";

import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Wallet, TrendingUp, TrendingDown, Building2, BarChart3, DollarSign, Percent, BedDouble, CalendarRange, FlaskConical, Target } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { ChangeIndicator } from "@/components/finance/finance-shared";
import type { FinanceData } from "@/hooks/use-finance-dashboard";

export function FinanceKpiRows({ summary }: Pick<FinanceData, "summary">) {
  return (
    <>
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
              <div className="w-10 h-10 rounded-lg bg-brand-accent/10 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-brand-accent" />
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
    </>
  );
}
