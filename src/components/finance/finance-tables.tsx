"use client";

import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { DemoDataBanner } from "@/components/ui/demo-data-banner";
import { TrendingUp, BarChart3, AlertTriangle, Activity } from "lucide-react";
import { Cell, Tooltip, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, BarChart, Bar } from "recharts";
import { formatCurrency } from "@/lib/utils";
import type { RechartsValue, RechartsName } from "@/types/recharts";
import { darkTooltipStyle } from "@/lib/chart-styles";
import { DEPT_COLORS } from "@/components/finance/finance-shared";
import type { FinanceData } from "@/hooks/use-finance-dashboard";

export function FinanceLedgersAndTrends({ arBarData, deptData, cporData, cashFlowData }: Pick<FinanceData, "arBarData" | "deptData" | "cporData" | "cashFlowData">) {
  return (
    <>
      {/* ===== Accounts Receivable Aging ===== */}
      {arBarData.length > 0 && arBarData.some((d) => d.total > 0 || d.count > 0) && (
        <Card className="border-amber-500/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              <h3 className="text-lg font-semibold text-text-primary">Accounts Receivable Aging</h3>
            </div>
            <p className="text-xs text-text-muted mt-1">Outstanding invoice balances by age</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={arBarData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                  <XAxis
                    dataKey="bucket"
                    tick={{ fill: "#6B7280", fontSize: 11 }}
                    axisLine={{ stroke: "#374151" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#6B7280", fontSize: 11 }}
                    axisLine={{ stroke: "#374151" }}
                    tickLine={false}
                    tickFormatter={(value: number) => `£${(value / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={darkTooltipStyle}
                    labelStyle={{ color: "#9CA3AF", fontSize: 12 }}
                    formatter={(value: RechartsValue) => [formatCurrency(Number(value)), "Outstanding"]}
                  />
                  <Bar dataKey="total" radius={[6, 6, 0, 0]} maxBarSize={48}>
                    {arBarData.map((item, index) => (
                      <Cell key={`ar-${index}`} fill={item.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="space-y-3">
                {arBarData.map((item) => (
                  <div key={item.bucket} className="flex items-center justify-between p-3 rounded-lg bg-brand-bg/50 border border-brand-border/50">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.fill }} />
                      <span className="text-sm text-text-secondary">{item.bucket}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-mono font-semibold text-text-primary">{formatCurrency(item.total)}</p>
                      <p className="text-[10px] text-text-muted">{item.count} invoice{item.count !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2 border-t border-brand-border">
                  <span className="text-sm font-medium text-text-primary">Total Outstanding</span>
                  <span className="text-sm font-mono font-bold text-amber-400">
                    {formatCurrency(arBarData.reduce((s, d) => s + d.total, 0))}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== Department Costs: Budget vs Actual ===== */}
      {deptData.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-cyan-400" />
              <h3 className="text-lg font-semibold text-text-primary">Department Costs</h3>
            </div>
            <p className="text-xs text-text-muted mt-1">Budget vs actual spend by department</p>
            <DemoDataBanner kind="modelled" className="mt-3">
              No department budgets have been set. The &ldquo;budget&rdquo; bars are fixed
              percentages of actual spend, so the variance shown is not a real budget comparison.
            </DemoDataBanner>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ResponsiveContainer width="100%" height={Math.max(200, deptData.length * 44)}>
                <BarChart data={deptData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
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
                    dataKey="department"
                    tick={{ fill: "#9CA3AF", fontSize: 11 }}
                    axisLine={{ stroke: "#374151" }}
                    tickLine={false}
                    width={110}
                  />
                  <Tooltip
                    contentStyle={darkTooltipStyle}
                    labelStyle={{ color: "#9CA3AF", fontSize: 12 }}
                    formatter={(value: RechartsValue, name: RechartsName) => [
                      formatCurrency(Number(value)),
                      name === "budget_gbp" ? "Budget" : "Actual",
                    ]}
                  />
                  <Bar dataKey="budget_gbp" fill="#374151" radius={[0, 4, 4, 0]} maxBarSize={20} name="budget_gbp" />
                  <Bar dataKey="actual_gbp" fill="#22D3EE" radius={[0, 4, 4, 0]} maxBarSize={20} name="actual_gbp" />
                </BarChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                <div className="flex items-center gap-4 text-xs text-text-muted mb-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-2 rounded bg-[#374151]" />
                    <span>Budget</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-2 rounded bg-cyan-400" />
                    <span>Actual</span>
                  </div>
                </div>
                {deptData.map((dept, index) => (
                  <div key={dept.department} className="flex items-center justify-between text-xs py-1.5 border-b border-brand-border/30 last:border-0">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: DEPT_COLORS[index % DEPT_COLORS.length] }} />
                      <span className="text-text-secondary">{dept.department}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-text-primary">{formatCurrency(dept.actual_gbp)}</span>
                      <span className={`font-mono text-xs px-1.5 py-0.5 rounded ${
                        dept.variance_pct > 5 ? "bg-red-500/10 text-red-400" :
                        dept.variance_pct < -5 ? "bg-green-500/10 text-green-400" :
                        "bg-gray-500/10 text-text-muted"
                      }`}>
                        {dept.variance_pct > 0 ? "+" : ""}{dept.variance_pct.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== Cash Flow Trend ===== */}
      {cashFlowData.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-cyan-400" />
              <h3 className="text-lg font-semibold text-text-primary">Cash Flow Trend</h3>
            </div>
            <p className="text-xs text-text-muted mt-1">Net profit trend over the last 6 months</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={cashFlowData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="cashFlowPositive" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22D3EE" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22D3EE" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                <XAxis
                  dataKey="month"
                  tick={{ fill: "#6B7280", fontSize: 11 }}
                  axisLine={{ stroke: "#374151" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#6B7280", fontSize: 11 }}
                  axisLine={{ stroke: "#374151" }}
                  tickLine={false}
                  tickFormatter={(value: number) => `£${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={darkTooltipStyle}
                  labelStyle={{ color: "#9CA3AF", fontSize: 12 }}
                  formatter={(value: RechartsValue, name: RechartsName) => [
                    formatCurrency(Number(value)),
                    name === "net_profit" ? "Net Profit" : name,
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="net_profit"
                  stroke="#22D3EE"
                  strokeWidth={2}
                  fill="url(#cashFlowPositive)"
                  dot={{ fill: "#22D3EE", strokeWidth: 0, r: 4 }}
                  activeDot={{ r: 6, fill: "#22D3EE" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ===== CPOR Trend ===== */}
      {cporData.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-amber-400" />
              <h3 className="text-lg font-semibold text-text-primary">Cost per Occupied Room Trend</h3>
            </div>
            <p className="text-xs text-text-muted mt-1">CPOR over the last 6 months</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={cporData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="cporGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                <XAxis
                  dataKey="month"
                  tick={{ fill: "#6B7280", fontSize: 11 }}
                  axisLine={{ stroke: "#374151" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#6B7280", fontSize: 11 }}
                  axisLine={{ stroke: "#374151" }}
                  tickLine={false}
                  tickFormatter={(value: number) => `£${value.toFixed(0)}`}
                />
                <Tooltip
                  contentStyle={darkTooltipStyle}
                  labelStyle={{ color: "#9CA3AF", fontSize: 12 }}
                  formatter={(value: RechartsValue) => [formatCurrency(Number(value)), "CPOR"]}
                />
                <Area
                  type="monotone"
                  dataKey="cpor_gbp"
                  stroke="#F59E0B"
                  strokeWidth={2}
                  fill="url(#cporGradient)"
                  dot={{ fill: "#F59E0B", strokeWidth: 0, r: 4 }}
                  activeDot={{ r: 6, fill: "#F59E0B" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </>
  );
}
