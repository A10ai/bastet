"use client";

import { formatCurrency } from "@/lib/utils";

interface RevenueChartProps {
  data: { month: string; revenue: number; expenses: number }[];
}

export function RevenueChart({ data }: RevenueChartProps) {
  if (!data.length) {
    return (
      <div className="text-center py-8 text-sm text-text-secondary">
        No data available
      </div>
    );
  }

  const maxValue = Math.max(
    ...data.map((d) => Math.max(d.revenue, d.expenses)),
    1
  );

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-bastet-gold" />
          <span className="text-text-secondary">Revenue</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-status-error/60" />
          <span className="text-text-secondary">Expenses</span>
        </div>
      </div>

      {/* Chart */}
      <div className="flex items-end gap-2 h-48">
        {data.map((d, i) => {
          const revHeight = maxValue > 0 ? (d.revenue / maxValue) * 100 : 0;
          const expHeight = maxValue > 0 ? (d.expenses / maxValue) * 100 : 0;

          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex items-end gap-0.5 h-40">
                {/* Revenue bar */}
                <div className="flex-1 flex flex-col justify-end">
                  <div
                    className="w-full bg-bastet-gold rounded-t transition-all duration-300 min-h-[2px]"
                    style={{ height: `${revHeight}%` }}
                    title={`Revenue: ${formatCurrency(d.revenue)}`}
                  />
                </div>
                {/* Expense bar */}
                <div className="flex-1 flex flex-col justify-end">
                  <div
                    className="w-full bg-status-error/60 rounded-t transition-all duration-300 min-h-[2px]"
                    style={{ height: `${expHeight}%` }}
                    title={`Expenses: ${formatCurrency(d.expenses)}`}
                  />
                </div>
              </div>
              <span className="text-xs text-text-muted">{d.month}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
