"use client";

import Link from "next/link";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { FileText, Receipt, TrendingUp, ArrowRight, Zap, Globe } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { FinanceData } from "@/hooks/use-finance-dashboard";

export function FinanceOutlook({ summary, channelAnalysis, forecast, energyCost }: Pick<FinanceData, "summary" | "channelAnalysis" | "forecast" | "energyCost">) {
  return (
    <>
      {/* ===== Channel Analysis + Revenue Forecast ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Channel Analysis */}
        <Card className="border-brand-accent/10">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-brand-accent" />
              <h3 className="text-lg font-semibold text-text-primary">Channel Analysis</h3>
            </div>
            <Link href="/dashboard/ai/revenue" className="text-xs text-brand-accent hover:underline">
              Revenue Copilot
            </Link>
          </CardHeader>
          <CardContent>
            {channelAnalysis ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">Direct Bookings</span>
                  <span className="text-sm font-mono font-semibold text-brand-accent">{channelAnalysis.direct_pct}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">OTA Bookings</span>
                  <span className="text-sm font-mono text-text-primary">{channelAnalysis.ota_pct}%</span>
                </div>
                <div className="w-full h-3 bg-brand-bg rounded-full overflow-hidden flex">
                  <div
                    className="h-full bg-brand-accent rounded-l-full"
                    style={{ width: `${channelAnalysis.direct_pct}%` }}
                    title={`Direct: ${channelAnalysis.direct_pct}%`}
                  />
                  <div
                    className="h-full bg-amber-500/50"
                    style={{ width: `${channelAnalysis.ota_pct}%` }}
                    title={`OTA: ${channelAnalysis.ota_pct}%`}
                  />
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-brand-border">
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
        <Card className="border-brand-accent/10">
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-brand-accent" />
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
                <div className="flex items-center justify-between pt-2 border-t border-brand-border">
                  <span className="text-sm font-medium text-text-primary">7-Day Total</span>
                  <span className="text-sm font-mono font-bold text-brand-accent">
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

      {/* ===== Energy Cost ===== */}
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

      {/* ===== Navigation Cards ===== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href="/dashboard/finance/invoices">
          <Card className="hover:border-brand-accent/50 transition-colors cursor-pointer">
            <CardContent className="py-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-brand-accent/10 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-brand-accent" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-primary">Invoices</p>
                  <p className="text-xs text-text-secondary">
                    {summary?.total_invoices || 0} total &middot; {summary?.outstanding_invoices || 0} outstanding
                  </p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-text-muted" />
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/finance/expenses">
          <Card className="hover:border-brand-accent/50 transition-colors cursor-pointer">
            <CardContent className="py-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-brand-accent/10 flex items-center justify-center">
                  <Receipt className="w-5 h-5 text-brand-accent" />
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
    </>
  );
}
