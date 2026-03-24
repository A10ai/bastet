"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

interface RevenueChartProps {
  data: { month: string; revenue: number; expenses: number }[];
}

const darkTooltipStyle = {
  backgroundColor: '#111827',
  border: '1px solid #1F2937',
  borderRadius: '8px',
};

export function RevenueChart({ data }: RevenueChartProps) {
  if (!data.length) {
    return (
      <div className="text-center py-8 text-sm text-text-secondary">
        No data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
        <XAxis
          dataKey="month"
          tick={{ fill: '#6B7280', fontSize: 11 }}
          axisLine={{ stroke: '#1F2937' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#6B7280', fontSize: 10, fontFamily: 'monospace' }}
          axisLine={{ stroke: '#1F2937' }}
          tickLine={false}
          tickFormatter={(value: any) => `£${(value / 1000).toFixed(0)}k`}
        />
        <Tooltip
          contentStyle={darkTooltipStyle}
          labelStyle={{ color: '#9CA3AF', fontSize: 12 }}
          formatter={(value: any, name: any) => [
            formatCurrency(value),
            name === 'revenue' ? 'Revenue' : 'Expenses',
          ]}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, color: '#6B7280' }}
        />
        <Bar
          dataKey="revenue"
          name="Revenue"
          fill="#22D3EE"
          radius={[4, 4, 0, 0]}
        />
        <Bar
          dataKey="expenses"
          name="Expenses"
          fill="#F87171"
          radius={[4, 4, 0, 0]}
          opacity={0.7}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
