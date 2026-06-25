"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  UtensilsCrossed,
  Utensils,
  Wine,
  GlassWater,
  TrendingUp,
  TrendingDown,
  Loader2,
  ChevronDown,
  ChevronRight,
  ConciergeBell,
  Coffee,
  DollarSign,
  BarChart3,
  Users,
  Percent,
} from "lucide-react";
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
import { cn, formatCurrency } from "@/lib/utils";
import type { RechartsValue, RechartsName } from "@/types/recharts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const darkTooltipStyle = {
  backgroundColor: "#111827",
  border: "1px solid #1F2937",
  borderRadius: "8px",
  color: "#F9FAFB",
};

const OUTLET_COLORS: Record<string, string> = {
  restaurant: "#22D3EE",
  rooftop: "#A78BFA",
  pool_bar: "#34D399",
  room_service: "#F59E0B",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OverviewData {
  total_revenue_today: number;
  revenue_vs_yesterday_pct: number;
  total_covers_today: number;
  food_cost_pct: number;
  revpar_occupied: number;
}

interface OutletData {
  id: string;
  name: string;
  location: string;
  status: "open" | "closed";
  covers_today: number;
  revenue_today: number;
  avg_spend: number;
}

interface DailyTrendPoint {
  date: string;
  restaurant: number;
  rooftop: number;
  pool_bar: number;
  room_service: number;
}

interface BreakfastStats {
  included_guests: number;
  paid_guests: number;
  paid_revenue: number;
}

interface RoomServiceStats {
  orders_today: number;
  revenue_today: number;
  avg_order_value: number;
}

interface MonthlyPL {
  monthly_revenue: number;
  food_cost: number;
  food_cost_pct: number;
  beverage_cost: number;
  beverage_cost_pct: number;
  fnb_gop: number;
}

interface MenuCategory {
  outlet: string;
  category: string;
  item_count: number;
  avg_price: number;
}

interface FnBData {
  overview: OverviewData;
  outlets: OutletData[];
  daily_trend: DailyTrendPoint[];
  breakfast: BreakfastStats;
  room_service: RoomServiceStats;
  monthly_pl: MonthlyPL;
  menu_categories: MenuCategory[];
}

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  subtitle,
  color = "text-text-primary",
  icon: Icon,
}: {
  label: string;
  value: string;
  subtitle?: React.ReactNode;
  color?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardContent className="py-5">
        <div className="flex items-center justify-between">
          <p className="text-xs text-text-muted uppercase tracking-wider">
            {label}
          </p>
          {Icon && <Icon className="w-4 h-4 text-text-muted" />}
        </div>
        <div className="flex items-baseline gap-1.5 mt-2">
          <span className={cn("text-lg font-mono font-bold", color)}>
            {value}
          </span>
        </div>
        {subtitle && (
          <div className="text-xs text-text-muted mt-1">{subtitle}</div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Change Indicator
// ---------------------------------------------------------------------------

function ChangeIndicator({ value }: { value: number | null | undefined }) {
  if (value == null) return null;
  const isPositive = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        isPositive ? "text-status-success" : "text-status-error"
      }`}
    >
      {isPositive ? (
        <TrendingUp className="w-3 h-3" />
      ) : (
        <TrendingDown className="w-3 h-3" />
      )}
      {isPositive ? "+" : ""}
      {value.toFixed(1)}%
    </span>
  );
}

// ---------------------------------------------------------------------------
// Food Cost Color
// ---------------------------------------------------------------------------

function foodCostColor(pct: number): string {
  if (pct < 30) return "text-emerald-400";
  if (pct <= 35) return "text-amber-400";
  return "text-red-400";
}

// ---------------------------------------------------------------------------
// Outlet Icon
// ---------------------------------------------------------------------------

function outletIcon(id: string) {
  switch (id) {
    case "restaurant":
      return Utensils;
    case "rooftop":
      return Wine;
    case "pool_bar":
      return GlassWater;
    default:
      return ConciergeBell;
  }
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function FnBDashboard() {
  const [data, setData] = useState<FnBData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuExpanded, setMenuExpanded] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [overviewRes, menuRes, trendRes, perfRes] = await Promise.all([
        fetch("/api/v1/fnb?type=overview"),
        fetch("/api/v1/fnb?type=menu"),
        fetch("/api/v1/fnb?type=daily_trend"),
        fetch("/api/v1/fnb?type=performance"),
      ]);

      const [overviewJson, menuJson, trendJson, perfJson] = await Promise.all([
        overviewRes.json(),
        menuRes.json(),
        trendRes.json(),
        perfRes.json(),
      ]);

      const overview = overviewJson.data || overviewJson;
      const menu = menuJson.data || menuJson;
      const trend = trendJson.data || trendJson;
      const perf = perfJson.data || perfJson;

      setData({
        overview: overview.overview || overview,
        outlets: overview.outlets || [],
        daily_trend: trend.daily_trend || trend.trend || [],
        breakfast: perf.breakfast || {},
        room_service: perf.room_service || {},
        monthly_pl: perf.monthly_pl || {},
        menu_categories: menu.categories || menu.menu_categories || [],
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // -------------------------------------------------------------------------
  // Loading / Error
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-text-muted">
          {error || "No F&B data available"}
        </p>
      </div>
    );
  }

  const { overview, outlets, daily_trend, breakfast, room_service, monthly_pl, menu_categories } = data;

  // Group menu categories by outlet
  const menuByOutlet = menu_categories.reduce<Record<string, MenuCategory[]>>(
    (acc, cat) => {
      if (!acc[cat.outlet]) acc[cat.outlet] = [];
      acc[cat.outlet].push(cat);
      return acc;
    },
    {}
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* ----------------------------------------------------------------- */}
      {/* Header                                                            */}
      {/* ----------------------------------------------------------------- */}
      <div>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyan-500/10">
            <UtensilsCrossed className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">
              Food &amp; Beverage
            </h1>
            <p className="text-sm text-text-muted">
              Restaurant, bars, and room service management
            </p>
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Overview Cards                                                    */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Revenue Today"
          value={formatCurrency(overview.total_revenue_today)}
          subtitle={
            <ChangeIndicator value={overview.revenue_vs_yesterday_pct} />
          }
          color="text-cyan-400"
          icon={DollarSign}
        />
        <StatCard
          label="Total Covers Today"
          value={overview.total_covers_today?.toLocaleString() ?? "0"}
          icon={Users}
        />
        <StatCard
          label="Food Cost %"
          value={`${overview.food_cost_pct?.toFixed(1) ?? "0"}%`}
          color={foodCostColor(overview.food_cost_pct ?? 0)}
          icon={Percent}
        />
        <StatCard
          label="RevPOR"
          value={formatCurrency(overview.revpar_occupied ?? 0)}
          subtitle="Revenue per Occupied Room"
          icon={BarChart3}
        />
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Outlet Cards                                                      */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(outlets.length > 0 ? outlets : defaultOutlets).map((outlet) => {
          const Icon = outletIcon(outlet.id);
          const isOpen = outlet.status === "open";
          return (
            <Card key={outlet.id}>
              <CardContent className="py-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="p-1.5 rounded-md"
                      style={{
                        backgroundColor: `${OUTLET_COLORS[outlet.id] ?? "#22D3EE"}20`,
                      }}
                    >
                      <Icon
                        className="w-4 h-4"
                        style={{
                          color: OUTLET_COLORS[outlet.id] ?? "#22D3EE",
                        }}
                      />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-text-primary">
                        {outlet.name}
                      </p>
                      <p className="text-[11px] text-text-muted">
                        {outlet.location}
                      </p>
                    </div>
                  </div>
                  <Badge
                    className={cn(
                      "text-[10px]",
                      isOpen
                        ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                        : "bg-red-500/20 text-red-400 border-red-500/30"
                    )}
                  >
                    {isOpen ? "Open" : "Closed"}
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-[10px] text-text-muted uppercase">
                      Covers
                    </p>
                    <p className="text-sm font-mono font-bold text-text-primary mt-0.5">
                      {outlet.covers_today?.toLocaleString() ?? "0"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-text-muted uppercase">
                      Revenue
                    </p>
                    <p className="text-sm font-mono font-bold text-text-primary mt-0.5">
                      {formatCurrency(outlet.revenue_today ?? 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-text-muted uppercase">
                      Avg Spend
                    </p>
                    <p className="text-sm font-mono font-bold text-text-primary mt-0.5">
                      {formatCurrency(outlet.avg_spend ?? 0)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Revenue by Outlet — 7-Day Trend                                   */}
      {/* ----------------------------------------------------------------- */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-text-primary">
              Revenue by Outlet — 7-Day Trend
            </h2>
          </div>
        </CardHeader>
        <CardContent>
          {daily_trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={daily_trend}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#1F2937"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "#9CA3AF" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#9CA3AF" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: RechartsValue) => `£${v}`}
                />
                <Tooltip
                  contentStyle={darkTooltipStyle}
                  formatter={(value: RechartsValue, name: RechartsName) => [
                    `£${Number(value).toLocaleString()}`,
                    String(name).replace("_", " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
                  ]}
                />
                <Legend
                  formatter={(value: RechartsValue) =>
                    String(value).replace("_", " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
                  }
                />
                <Bar
                  dataKey="restaurant"
                  fill={OUTLET_COLORS.restaurant}
                  radius={[4, 4, 0, 0]}
                  stackId="revenue"
                />
                <Bar
                  dataKey="rooftop"
                  fill={OUTLET_COLORS.rooftop}
                  radius={[0, 0, 0, 0]}
                  stackId="revenue"
                />
                <Bar
                  dataKey="pool_bar"
                  fill={OUTLET_COLORS.pool_bar}
                  radius={[0, 0, 0, 0]}
                  stackId="revenue"
                />
                <Bar
                  dataKey="room_service"
                  fill={OUTLET_COLORS.room_service}
                  radius={[4, 4, 0, 0]}
                  stackId="revenue"
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-text-muted py-12 text-center">
              No trend data available
            </p>
          )}
        </CardContent>
      </Card>

      {/* ----------------------------------------------------------------- */}
      {/* Breakfast & Room Service Row                                       */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Breakfast Stats */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Coffee className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-semibold text-text-primary">
                Breakfast Stats
              </h2>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted">
                  Included with room
                </span>
                <span className="text-sm font-mono font-bold text-text-primary">
                  {breakfast.included_guests ?? 0} guests
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted">Paid breakfast</span>
                <span className="text-sm font-mono font-bold text-text-primary">
                  {breakfast.paid_guests ?? 0} guests
                </span>
              </div>
              <div className="border-t border-bastet-border pt-2 flex items-center justify-between">
                <span className="text-xs text-text-muted">
                  Revenue from paid breakfast
                </span>
                <span className="text-sm font-mono font-bold text-cyan-400">
                  {formatCurrency(breakfast.paid_revenue ?? 0)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Room Service */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ConciergeBell className="w-4 h-4 text-purple-400" />
              <h2 className="text-sm font-semibold text-text-primary">
                Room Service
              </h2>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted">Orders today</span>
                <span className="text-sm font-mono font-bold text-text-primary">
                  {room_service.orders_today ?? 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted">Revenue today</span>
                <span className="text-sm font-mono font-bold text-text-primary">
                  {formatCurrency(room_service.revenue_today ?? 0)}
                </span>
              </div>
              <div className="border-t border-bastet-border pt-2 flex items-center justify-between">
                <span className="text-xs text-text-muted">
                  Avg order value
                </span>
                <span className="text-sm font-mono font-bold text-cyan-400">
                  {formatCurrency(room_service.avg_order_value ?? 0)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Monthly P&L Summary                                               */}
      {/* ----------------------------------------------------------------- */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-text-primary">
              Monthly F&amp;B P&amp;L Summary
            </h2>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-[10px] text-text-muted uppercase tracking-wider">
                Monthly Revenue
              </p>
              <p className="text-lg font-mono font-bold text-text-primary mt-1">
                {formatCurrency(monthly_pl.monthly_revenue ?? 0)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-text-muted uppercase tracking-wider">
                Food Cost
              </p>
              <p className="text-lg font-mono font-bold text-text-primary mt-1">
                {formatCurrency(monthly_pl.food_cost ?? 0)}
              </p>
              <p className={cn("text-xs font-mono mt-0.5", foodCostColor(monthly_pl.food_cost_pct ?? 0))}>
                {monthly_pl.food_cost_pct?.toFixed(1) ?? "0"}%
              </p>
            </div>
            <div>
              <p className="text-[10px] text-text-muted uppercase tracking-wider">
                Beverage Cost
              </p>
              <p className="text-lg font-mono font-bold text-text-primary mt-1">
                {formatCurrency(monthly_pl.beverage_cost ?? 0)}
              </p>
              <p className="text-xs font-mono text-text-muted mt-0.5">
                {monthly_pl.beverage_cost_pct?.toFixed(1) ?? "0"}%
              </p>
            </div>
            <div>
              <p className="text-[10px] text-text-muted uppercase tracking-wider">
                F&amp;B GOP
              </p>
              <p className="text-lg font-mono font-bold text-emerald-400 mt-1">
                {formatCurrency(monthly_pl.fnb_gop ?? 0)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ----------------------------------------------------------------- */}
      {/* Menu Overview (Collapsible)                                       */}
      {/* ----------------------------------------------------------------- */}
      <Card>
        <CardHeader>
          <button
            onClick={() => setMenuExpanded(!menuExpanded)}
            className="flex items-center justify-between w-full text-left"
          >
            <div className="flex items-center gap-2">
              <UtensilsCrossed className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-semibold text-text-primary">
                Menu Overview
              </h2>
            </div>
            {menuExpanded ? (
              <ChevronDown className="w-4 h-4 text-text-muted" />
            ) : (
              <ChevronRight className="w-4 h-4 text-text-muted" />
            )}
          </button>
        </CardHeader>
        {menuExpanded && (
          <CardContent>
            {Object.keys(menuByOutlet).length > 0 ? (
              <div className="space-y-5">
                {Object.entries(menuByOutlet).map(([outlet, categories]) => (
                  <div key={outlet}>
                    <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                      {outlet.replace(/_/g, " ")}
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-bastet-border">
                            <th className="text-[10px] text-text-muted uppercase tracking-wider py-2 pr-4">
                              Category
                            </th>
                            <th className="text-[10px] text-text-muted uppercase tracking-wider py-2 pr-4 text-right">
                              Items
                            </th>
                            <th className="text-[10px] text-text-muted uppercase tracking-wider py-2 text-right">
                              Avg Price
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {categories.map((cat) => (
                            <tr
                              key={cat.category}
                              className="border-b border-bastet-border/50"
                            >
                              <td className="text-xs text-text-primary py-2 pr-4 capitalize">
                                {cat.category}
                              </td>
                              <td className="text-xs font-mono text-text-secondary py-2 pr-4 text-right">
                                {cat.item_count}
                              </td>
                              <td className="text-xs font-mono text-text-secondary py-2 text-right">
                                {formatCurrency(cat.avg_price)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-muted py-4 text-center">
                No menu data available
              </p>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Default outlet placeholders (used if API returns empty outlets array)
// ---------------------------------------------------------------------------

const defaultOutlets: OutletData[] = [
  {
    id: "restaurant",
    name: "Bastet Restaurant",
    location: "Ground Floor",
    status: "open",
    covers_today: 0,
    revenue_today: 0,
    avg_spend: 0,
  },
  {
    id: "rooftop",
    name: "Rooftop Lounge",
    location: "Rooftop",
    status: "open",
    covers_today: 0,
    revenue_today: 0,
    avg_spend: 0,
  },
  {
    id: "pool_bar",
    name: "Pool Bar",
    location: "Pool Deck",
    status: "open",
    covers_today: 0,
    revenue_today: 0,
    avg_spend: 0,
  },
];
