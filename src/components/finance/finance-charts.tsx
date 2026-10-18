"use client";

import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { RevenueChart } from "@/components/finance/revenue-chart";
import { CurrencyRatesCard } from "@/components/finance/currency-rates-card";
import { BarChart3, Globe, PieChart as PieChartIcon, Layers } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, XAxis, YAxis, CartesianGrid, BarChart, Bar } from "recharts";
import { formatCurrency } from "@/lib/utils";
import type { RechartsValue, RechartsName } from "@/types/recharts";
import { darkTooltipStyle } from "@/lib/chart-styles";
import { EXPENSE_CATEGORY_COLORS, REVENUE_SOURCE_COLORS, CHANNEL_COLORS, ROOM_TYPE_COLORS } from "@/components/finance/finance-shared";
import type { FinanceData } from "@/hooks/use-finance-dashboard";

export function FinanceRevenueCharts({ summary, expenseDonutData, revenueSourceData, channelDonutData, roomTypeBarData }: Pick<FinanceData, "summary" | "expenseDonutData" | "revenueSourceData" | "channelDonutData" | "roomTypeBarData">) {
  return (
    <>
      {/* ===== Revenue vs Expenses Chart + Currency ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
        <div>
          <CurrencyRatesCard />
        </div>
      </div>

      {/* ===== Revenue by Room Type ===== */}
      {roomTypeBarData.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-cyan-400" />
              <h3 className="text-lg font-semibold text-text-primary">Revenue by Room Type</h3>
            </div>
            <p className="text-xs text-text-muted mt-1">Revenue breakdown by apartment type this month</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <ResponsiveContainer width="100%" height={Math.max(200, roomTypeBarData.length * 52)}>
                  <BarChart data={roomTypeBarData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fill: "#6B7280", fontSize: 11 }}
                      axisLine={{ stroke: "#374151" }}
                      tickLine={false}
                      tickFormatter={(value: number) => `£${(value / 1000).toFixed(0)}k`}
                    />
                    <YAxis
                      type="category"
                      dataKey="type"
                      tick={{ fill: "#9CA3AF", fontSize: 12 }}
                      axisLine={{ stroke: "#374151" }}
                      tickLine={false}
                      width={120}
                    />
                    <Tooltip
                      contentStyle={darkTooltipStyle}
                      labelStyle={{ color: "#9CA3AF", fontSize: 12 }}
                      formatter={(value: RechartsValue) => [formatCurrency(Number(value)), "Revenue"]}
                    />
                    <Bar dataKey="revenue" radius={[0, 6, 6, 0]} maxBarSize={32}>
                      {roomTypeBarData.map((_, index) => (
                        <Cell key={`rt-${index}`} fill={ROOM_TYPE_COLORS[index % ROOM_TYPE_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3">
                {roomTypeBarData.map((item, index) => (
                  <div key={item.type} className="p-3 rounded-lg bg-brand-bg/50 border border-brand-border/50">
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: ROOM_TYPE_COLORS[index % ROOM_TYPE_COLORS.length] }} />
                      <span className="text-sm font-medium text-text-primary">{item.type}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      <div>
                        <p className="text-text-muted">Bookings</p>
                        <p className="font-mono font-semibold text-text-primary">{item.bookings}</p>
                      </div>
                      <div>
                        <p className="text-text-muted">Avg Rate</p>
                        <p className="font-mono font-semibold text-text-primary">{formatCurrency(item.avg_rate)}</p>
                      </div>
                      <div>
                        <p className="text-text-muted">Avg Nights</p>
                        <p className="font-mono font-semibold text-text-primary">{item.avg_nights}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== Revenue by Channel (Source) + Expense Breakdown ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue by Channel Donut */}
        {channelDonutData.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-cyan-400" />
                <h3 className="text-lg font-semibold text-text-primary">Revenue by Channel</h3>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col lg:flex-row items-center gap-6">
                <div className="w-[220px] h-[220px] flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={channelDonutData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={90}
                        paddingAngle={2}
                        dataKey="value"
                        nameKey="name"
                        stroke="none"
                      >
                        {channelDonutData.map((item, index) => (
                          <Cell
                            key={`ch-${index}`}
                            fill={CHANNEL_COLORS[item.name] || CHANNEL_COLORS.Unknown}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={darkTooltipStyle}
                        labelStyle={{ color: "#9CA3AF", fontSize: 12 }}
                        formatter={(value: RechartsValue, name: RechartsName) => [formatCurrency(Number(value)), name]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-2">
                  {channelDonutData.map((item, index) => (
                    <div key={index} className="flex items-center gap-2 text-xs">
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: CHANNEL_COLORS[item.name] || CHANNEL_COLORS.Unknown }}
                      />
                      <span className="text-text-secondary flex-1">{item.name}</span>
                      <span className="font-mono text-text-primary">{formatCurrency(item.value)}</span>
                      <span className="font-mono text-text-muted">({item.percentage}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Expense Breakdown Donut */}
        {expenseDonutData.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <PieChartIcon className="w-5 h-5 text-text-muted" />
                <h3 className="text-lg font-semibold text-text-primary">Expense Breakdown</h3>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col lg:flex-row items-center gap-6">
                <div className="w-[220px] h-[220px] flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={expenseDonutData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={90}
                        paddingAngle={2}
                        dataKey="value"
                        nameKey="name"
                        stroke="none"
                      >
                        {expenseDonutData.map((item, index) => (
                          <Cell
                            key={`exp-${index}`}
                            fill={EXPENSE_CATEGORY_COLORS[item.key] || EXPENSE_CATEGORY_COLORS.other}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={darkTooltipStyle}
                        labelStyle={{ color: "#9CA3AF", fontSize: 12 }}
                        formatter={(value: RechartsValue, name: RechartsName) => [formatCurrency(Number(value)), name]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {/* Legend with amounts */}
                <div className="flex-1 space-y-1.5">
                  {expenseDonutData.map((item, index) => (
                    <div key={index} className="flex items-center gap-2 text-xs">
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: EXPENSE_CATEGORY_COLORS[item.key] || EXPENSE_CATEGORY_COLORS.other }}
                      />
                      <span className="text-text-secondary flex-1">{item.name}</span>
                      <span className="font-mono text-text-primary">{formatCurrency(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ===== Revenue by Source (stream) Donut - existing ===== */}
      {revenueSourceData.length > 0 && revenueSourceData.some((d) => d.value > 0) && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <PieChartIcon className="w-5 h-5 text-cyan-400" />
              <h3 className="text-lg font-semibold text-text-primary">Revenue by Stream</h3>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col lg:flex-row items-center gap-6">
              <div className="w-[220px] h-[220px] flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={revenueSourceData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                      nameKey="name"
                      stroke="none"
                    >
                      {revenueSourceData.map((_, index) => (
                        <Cell key={`rev-${index}`} fill={REVENUE_SOURCE_COLORS[index % REVENUE_SOURCE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={darkTooltipStyle}
                      labelStyle={{ color: "#9CA3AF", fontSize: 12 }}
                      formatter={(value: RechartsValue, name: RechartsName) => [formatCurrency(Number(value)), name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-1.5">
                {revenueSourceData.map((item, index) => (
                  <div key={index} className="flex items-center gap-2 text-xs">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: REVENUE_SOURCE_COLORS[index % REVENUE_SOURCE_COLORS.length] }}
                    />
                    <span className="text-text-secondary">{item.name}</span>
                    <span className="font-mono text-text-primary ml-auto">{formatCurrency(item.value)}</span>
                    <span className="font-mono text-text-muted">({item.percentage}%)</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
