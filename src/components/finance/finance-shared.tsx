"use client";

import { ArrowUpRight, ArrowDownRight } from "lucide-react";

export const EXPENSE_CATEGORY_COLORS: Record<string, string> = {
  utilities: "#F59E0B",
  staff: "#3B82F6",
  maintenance: "#F97316",
  supplies: "#8B5CF6",
  marketing: "#EC4899",
  insurance: "#06B6D4",
  taxes: "#EF4444",
  software: "#10B981",
  professional_services: "#6366F1",
  travel: "#14B8A6",
  other: "#6B7280",
};

export const REVENUE_SOURCE_COLORS = ["#22D3EE", "#F59E0B", "#A78BFA", "#34D399", "#F87171"];

export const CHANNEL_COLORS: Record<string, string> = {
  Direct: "#22D3EE",
  "Booking.com": "#3B82F6",
  Airbnb: "#EF4444",
  Expedia: "#F59E0B",
  Phone: "#10B981",
  "Walk-in": "#A78BFA",
  Unknown: "#6B7280",
};

export const ROOM_TYPE_COLORS = ["#22D3EE", "#F59E0B", "#A78BFA", "#34D399", "#F87171", "#EC4899", "#8B5CF6"];

export const AR_COLORS = {
  current: "#10B981",
  days_30: "#F59E0B",
  days_60: "#F97316",
  days_90_plus: "#EF4444",
};

export const DEPT_COLORS = ["#22D3EE", "#3B82F6", "#F59E0B", "#10B981", "#A78BFA", "#EC4899", "#F97316", "#6B7280"];

export interface ChannelAnalysis {
  direct_pct: number;
  ota_pct: number;
  commission_cost_gbp: number;
}

export interface RevenueForecast {
  days: { date: string; projected_gbp: number }[];
  total_7day_gbp: number;
}

export function ChangeIndicator({ value }: { value: number | null | undefined }) {
  if (value == null) return null;
  const isPositive = value >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isPositive ? "text-status-success" : "text-status-error"}`}>
      {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}
