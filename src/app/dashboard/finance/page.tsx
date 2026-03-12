"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { RevenueChart } from "@/components/finance/revenue-chart";
import { CurrencyRatesCard } from "@/components/finance/currency-rates-card";
import {
  Wallet,
  FileText,
  Receipt,
  TrendingUp,
  TrendingDown,
  Building2,
  BarChart3,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { FinancialSummary } from "@/types/api";

export default function FinancePage() {
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSummary = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/v1/finance/summary");
        const json = await res.json();
        setSummary(json.data);
      } catch {
        setSummary(null);
      } finally {
        setLoading(false);
      }
    };
    fetchSummary();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-bastet-gold" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-text-primary">Finance</h1>
        <p className="text-sm text-text-secondary mt-1">
          Financial overview and management
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-status-success/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-status-success" />
              </div>
              <div>
                <p className="text-xs text-text-muted">Revenue (Month)</p>
                <p className="text-lg font-semibold font-mono text-text-primary">
                  {formatCurrency(summary?.revenue_gbp || 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-status-error/10 flex items-center justify-center">
                <TrendingDown className="w-5 h-5 text-status-error" />
              </div>
              <div>
                <p className="text-xs text-text-muted">Expenses (Month)</p>
                <p className="text-lg font-semibold font-mono text-text-primary">
                  {formatCurrency(summary?.expenses_gbp || 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-bastet-gold/10 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-bastet-gold" />
              </div>
              <div>
                <p className="text-xs text-text-muted">Net Profit</p>
                <p className={`text-lg font-semibold font-mono ${
                  (summary?.net_profit_gbp || 0) >= 0 ? "text-status-success" : "text-status-error"
                }`}>
                  {formatCurrency(summary?.net_profit_gbp || 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-status-info/10 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-status-info" />
              </div>
              <div>
                <p className="text-xs text-text-muted">Occupancy</p>
                <p className="text-lg font-semibold font-mono text-text-primary">
                  {summary?.occupancy_rate || 0}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-text-muted">ADR</p>
            <p className="text-sm font-semibold font-mono text-text-primary">
              {formatCurrency(summary?.adr_gbp || 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-text-muted">RevPAA</p>
            <p className="text-sm font-semibold font-mono text-text-primary">
              {formatCurrency(summary?.revpaa_gbp || 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-text-muted">Total Invoices</p>
            <p className="text-sm font-semibold font-mono text-text-primary">
              {summary?.total_invoices || 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-text-muted">Outstanding</p>
            <p className="text-sm font-semibold font-mono text-status-warning">
              {summary?.outstanding_invoices || 0}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-text-muted" />
                <h3 className="text-lg font-semibold text-text-primary">Revenue vs Expenses (6 Months)</h3>
              </div>
            </CardHeader>
            <CardContent>
              <RevenueChart data={summary?.monthly_data || []} />
            </CardContent>
          </Card>
        </div>

        {/* Currency Rates */}
        <div>
          <CurrencyRatesCard />
        </div>
      </div>

      {/* Navigation Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href="/dashboard/finance/invoices">
          <Card className="hover:border-bastet-gold/50 transition-colors cursor-pointer">
            <CardContent className="py-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-bastet-gold/10 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-bastet-gold" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-primary">Invoices</p>
                  <p className="text-xs text-text-secondary">Manage invoices and payments</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-text-muted" />
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/finance/expenses">
          <Card className="hover:border-bastet-gold/50 transition-colors cursor-pointer">
            <CardContent className="py-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-bastet-gold/10 flex items-center justify-center">
                  <Receipt className="w-5 h-5 text-bastet-gold" />
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
    </div>
  );
}
