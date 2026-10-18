"use client";

import { Loader2 } from "lucide-react";
import { useFinanceDashboard } from "@/hooks/use-finance-dashboard";
import { FinanceKpiRows } from "@/components/finance/finance-kpis";
import { FinanceRevenueCharts } from "@/components/finance/finance-charts";
import { FinanceLedgersAndTrends } from "@/components/finance/finance-tables";
import { FinanceOutlook } from "@/components/finance/finance-outlook";
import { AccountingExportCard } from "@/components/finance/accounting-export-card";

export default function FinancePage() {
  const { loading, summary, channelAnalysis, forecast, energyCost, expenseDonutData, revenueSourceData, channelDonutData, roomTypeBarData, arBarData, deptData, cporData, cashFlowData } = useFinanceDashboard();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-brand-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold text-text-primary">Financial Command Centre</h1>
        <p className="text-sm text-text-secondary mt-1">
          Comprehensive financial overview and performance metrics
        </p>
      </div>

      <FinanceKpiRows summary={summary} />
      <FinanceRevenueCharts summary={summary} expenseDonutData={expenseDonutData} revenueSourceData={revenueSourceData} channelDonutData={channelDonutData} roomTypeBarData={roomTypeBarData} />
      <FinanceLedgersAndTrends arBarData={arBarData} deptData={deptData} cporData={cporData} cashFlowData={cashFlowData} />
      <FinanceOutlook summary={summary} channelAnalysis={channelAnalysis} forecast={forecast} energyCost={energyCost} />
      <AccountingExportCard />
    </div>
  );
}
