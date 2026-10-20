"use client";

import { useEffect, useState, useMemo } from "react";
import type { FinancialSummary } from "@/types/api";
import type { ChannelAnalysis, RevenueForecast } from "@/components/finance/finance-shared";
import { AR_COLORS } from "@/components/finance/finance-shared";

/** Data layer of the Financial Command Centre: summary, channel mix, forecast, energy cost and the chart series derived from them. */
export function useFinanceDashboard() {
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [channelAnalysis, setChannelAnalysis] = useState<ChannelAnalysis | null>(null);
  const [forecast, setForecast] = useState<RevenueForecast | null>(null);
  const [energyCost, setEnergyCost] = useState<number | null>(null);

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

    const fetchChannel = async () => {
      try {
        const res = await fetch("/api/v1/ai/revenue");
        const json = await res.json();
        const d = json.data || json;
        setChannelAnalysis({
          direct_pct: d.direct_pct ?? d.direct_percentage ?? 0,
          ota_pct: d.ota_pct ?? d.ota_percentage ?? 0,
          commission_cost_gbp: d.commission_cost_gbp ?? d.total_commission ?? 0,
        });

        if (d.forecast || d.revenue_forecast) {
          const fc = d.forecast || d.revenue_forecast;
          setForecast({
            days: fc.days || [],
            total_7day_gbp: fc.total_7day_gbp ?? fc.total ?? 0,
          });
        }
      } catch {
        /* -- */
      }
    };
    fetchChannel();

    const fetchEnergy = async () => {
      try {
        const res = await fetch("/api/v1/ai/energy");
        const json = await res.json();
        const d = json.data || json;
        const overview = d.overview || d;
        setEnergyCost(overview.waste_cost_gbp ?? overview.daily_energy_cost_gbp ?? null);
      } catch {
        /* -- */
      }
    };
    fetchEnergy();
  }, []);

  // Expense breakdown from API data
  const expenseDonutData = useMemo(() => {
    if (summary?.expense_breakdown && summary.expense_breakdown.length > 0) {
      return summary.expense_breakdown.map((item) => ({
        name: item.category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        value: item.total_gbp,
        key: item.category,
        percentage: item.percentage,
      }));
    }
    // Fallback to estimated breakdown
    const total = summary?.expenses_gbp || 0;
    if (total <= 0) return [];
    const commission = channelAnalysis?.commission_cost_gbp || 0;
    const energy = (energyCost || 0) * 30;
    const remaining = Math.max(0, total - commission - energy);
    const items: { name: string; value: number; key: string; percentage: number }[] = [];
    if (remaining > 0) items.push({ name: "Operations", value: Math.round(remaining), key: "other", percentage: Math.round((remaining / total) * 100) });
    if (commission > 0) items.push({ name: "OTA Commission", value: Math.round(commission), key: "marketing", percentage: Math.round((commission / total) * 100) });
    if (energy > 0) items.push({ name: "Energy", value: Math.round(energy), key: "utilities", percentage: Math.round((energy / total) * 100) });
    return items;
  }, [summary, channelAnalysis, energyCost]);

  // Revenue by source donut data (existing - by stream: room, extras, marketplace)
  const revenueSourceData = useMemo(() => {
    if (summary?.revenue_by_source && summary.revenue_by_source.length > 0) {
      return summary.revenue_by_source.map((item) => ({
        name: item.source.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        value: item.amount_gbp,
        percentage: item.percentage,
      }));
    }
    return [];
  }, [summary]);

  // Revenue by channel donut data (new - by booking channel)
  const channelDonutData = useMemo(() => {
    if (summary?.revenue_by_channel && summary.revenue_by_channel.length > 0) {
      return summary.revenue_by_channel.map((item) => ({
        name: item.source,
        value: item.revenue_gbp,
        bookings: item.bookings,
        percentage: item.percentage,
      }));
    }
    return [];
  }, [summary]);

  // Room type bar data
  const roomTypeBarData = useMemo(() => {
    if (summary?.revenue_by_room_type && summary.revenue_by_room_type.length > 0) {
      return summary.revenue_by_room_type.map((item) => ({
        type: item.type,
        revenue: item.revenue_gbp,
        bookings: item.bookings,
        avg_rate: item.avg_rate,
        avg_nights: item.avg_nights,
      }));
    }
    return [];
  }, [summary]);

  // Accounts receivable bar data
  const arBarData = useMemo(() => {
    if (!summary?.accounts_receivable) return [];
    const ar = summary.accounts_receivable;
    return [
      { bucket: "Current", count: ar.current.count, total: ar.current.total, fill: AR_COLORS.current },
      { bucket: "1-30 Days", count: ar.days_30.count, total: ar.days_30.total, fill: AR_COLORS.days_30 },
      { bucket: "31-60 Days", count: ar.days_60.count, total: ar.days_60.total, fill: AR_COLORS.days_60 },
      { bucket: "90+ Days", count: ar.days_90_plus.count, total: ar.days_90_plus.total, fill: AR_COLORS.days_90_plus },
    ];
  }, [summary]);

  // Department costs data
  const deptData = useMemo(() => {
    if (summary?.department_costs && summary.department_costs.length > 0) {
      return summary.department_costs;
    }
    return [];
  }, [summary]);

  // CPOR trend data
  const cporData = useMemo(() => {
    if (summary?.cpor_trend && summary.cpor_trend.length > 0) {
      return summary.cpor_trend;
    }
    return [];
  }, [summary]);

  // Cash flow trend data from monthly_data
  const cashFlowData = useMemo(() => {
    if (!summary?.monthly_data || summary.monthly_data.length === 0) return [];
    return summary.monthly_data.map((m) => ({
      month: m.month,
      net_profit: m.revenue - m.expenses,
      revenue: m.revenue,
      expenses: m.expenses,
    }));
  }, [summary]);

  return { loading, summary, channelAnalysis, forecast, energyCost, expenseDonutData, revenueSourceData, channelDonutData, roomTypeBarData, arBarData, deptData, cporData, cashFlowData };
}

export type FinanceData = ReturnType<typeof useFinanceDashboard>;
