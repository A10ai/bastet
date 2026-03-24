"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import {
  Zap,
  AlertTriangle,
  TrendingDown,
  Leaf,
  Power,
  Thermometer,
  Building2,
  Clock,
  Loader2,
  ChevronRight,
} from "lucide-react";
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import type {
  EnergyOverview,
  BuildingEnergy,
  HeatmapCell,
  TimelinePoint,
  EnergyRecommendation,
} from "@/lib/energy-engine";

const floorLabel = (floor: number) => floor === 0 ? 'Ground' : `Floor ${floor}`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EnergyData {
  overview: EnergyOverview;
  by_building: BuildingEnergy[];
  by_floor: BuildingEnergy[];
  heatmap: HeatmapCell[];
  timeline: TimelinePoint[];
  recommendations: EnergyRecommendation[];
}

// ---------------------------------------------------------------------------
// Recommendation icon mapping
// ---------------------------------------------------------------------------

const recIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  power: Power,
  thermometer: Thermometer,
  building: Building2,
  clock: Clock,
  zap: Zap,
};

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  unit,
  subtitle,
  color = "text-text-primary",
  urgent = false,
}: {
  label: string;
  value: string;
  unit?: string;
  subtitle?: string;
  color?: string;
  urgent?: boolean;
}) {
  return (
    <Card className={urgent ? "border-red-500/30" : undefined}>
      <CardContent className="py-5">
        <p className="text-xs text-text-muted uppercase tracking-wider">
          {label}
        </p>
        <div className="flex items-baseline gap-1.5 mt-2">
          <span className={cn("text-2xl font-mono font-bold", color)}>
            {value}
          </span>
          {unit && (
            <span className="text-xs text-text-muted font-mono">{unit}</span>
          )}
        </div>
        {subtitle && (
          <p className="text-xs text-text-muted mt-1">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Building Bar Chart (pure CSS)
// ---------------------------------------------------------------------------

function FloorBarChart({ floors }: { floors: BuildingEnergy[] }) {
  if (floors.length === 0) {
    return (
      <p className="text-sm text-text-muted py-8 text-center">
        No floor data available
      </p>
    );
  }

  const maxConsumption = Math.max(...floors.map((b) => b.consumption_kwh), 1);

  return (
    <div className="space-y-4">
      {floors.map((building) => {
        const occupiedWidth =
          ((building.occupied_units * 18) / maxConsumption) * 100;
        const wasteWidth = (building.waste_kwh / maxConsumption) * 100;
        const cleaningWidth =
          (((building.cleaning_units + building.maintenance_units) * 10) /
            maxConsumption) *
          100;
        const standbyWidth = Math.max(
          0,
          (building.consumption_kwh / maxConsumption) * 100 -
            occupiedWidth -
            wasteWidth -
            cleaningWidth
        );

        return (
          <div key={building.building_code} className="group">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-1.5 gap-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-text-primary bg-bastet-bg px-2 py-0.5 rounded">
                  {building.building_name}
                </span>
                <span className="text-xs text-text-muted">
                  {building.total_units} units
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-text-secondary">
                  {building.consumption_kwh} kWh
                </span>
                {building.waste_kwh > 0 && (
                  <span className="text-xs font-mono text-red-400">
                    -{building.waste_kwh} waste
                  </span>
                )}
                {building.savings_potential_gbp > 0 && (
                  <span className="text-xs font-mono text-emerald-400">
                    save {"\u00A3"}{building.savings_potential_gbp.toFixed(2)}
                  </span>
                )}
              </div>
            </div>
            <div className="h-7 bg-bastet-bg rounded-md overflow-hidden flex">
              {occupiedWidth > 0 && (
                <div
                  className="h-full bg-cyan-400/70 transition-all duration-500"
                  style={{ width: `${occupiedWidth}%` }}
                  title={`Occupied: ${building.occupied_units} units`}
                />
              )}
              {cleaningWidth > 0 && (
                <div
                  className="h-full bg-amber-400/50 transition-all duration-500"
                  style={{ width: `${cleaningWidth}%` }}
                  title={`Cleaning/Maintenance: ${building.cleaning_units + building.maintenance_units} units`}
                />
              )}
              {standbyWidth > 0 && (
                <div
                  className="h-full bg-slate-600/40 transition-all duration-500"
                  style={{ width: `${standbyWidth}%` }}
                  title="Vacant (standby)"
                />
              )}
              {wasteWidth > 0 && (
                <div
                  className="h-full bg-red-500/70 transition-all duration-500"
                  style={{ width: `${wasteWidth}%` }}
                  title={`Waste: ${building.waste_kwh} kWh`}
                />
              )}
            </div>
          </div>
        );
      })}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 md:gap-5 pt-2 border-t border-bastet-border">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-cyan-400/70" />
          <span className="text-[10px] text-text-muted">Occupied</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-amber-400/50" />
          <span className="text-[10px] text-text-muted">Cleaning</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-slate-600/40" />
          <span className="text-[10px] text-text-muted">Standby</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-red-500/70" />
          <span className="text-[10px] text-text-muted">Waste</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Energy Heatmap (GitHub-style grid)
// ---------------------------------------------------------------------------

function EnergyHeatmap({ cells }: { cells: HeatmapCell[] }) {
  const [hoveredCell, setHoveredCell] = useState<HeatmapCell | null>(null);

  if (cells.length === 0) {
    return (
      <p className="text-sm text-text-muted py-8 text-center">
        No apartment data available
      </p>
    );
  }

  // Group by floor
  const floorGroups = new Map<number, HeatmapCell[]>();

  for (const cell of cells) {
    const f = cell.floor ?? 0;
    if (!floorGroups.has(f)) {
      floorGroups.set(f, []);
    }
    floorGroups.get(f)!.push(cell);
  }

  function getCellColor(cell: HeatmapCell): string {
    if (cell.status === "occupied") return "bg-cyan-400/60 hover:bg-cyan-400/80";
    if (cell.status === "cleaning" || cell.status === "maintenance")
      return "bg-amber-400/50 hover:bg-amber-400/70";
    if (cell.is_wasteful) return "bg-red-500/60 hover:bg-red-500/80 animate-pulse";
    // Vacant on standby
    return "bg-slate-700/50 hover:bg-slate-700/70";
  }

  return (
    <div className="relative">
      {/* Tooltip */}
      {hoveredCell && (
        <div className="absolute top-0 right-0 z-10 bg-bastet-card border border-bastet-border rounded-lg p-3 shadow-xl min-w-[200px]">
          <p className="text-sm font-mono font-bold text-text-primary">
            Unit {hoveredCell.apartment_number}
          </p>
          <p className="text-xs text-text-muted mt-1">
            {floorLabel(hoveredCell.floor)}
          </p>
          <div className="mt-2 space-y-1">
            <div className="flex justify-between">
              <span className="text-xs text-text-muted">Status</span>
              <span className="text-xs text-text-primary capitalize">
                {hoveredCell.status}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-text-muted">Consumption</span>
              <span className="text-xs font-mono text-text-primary">
                {hoveredCell.consumption_kwh} kWh/day
              </span>
            </div>
            {hoveredCell.is_wasteful && (
              <p className="text-xs text-red-400 font-medium mt-1">
                Wasteful: HVAC active on vacant unit
              </p>
            )}
          </div>
        </div>
      )}

      <div className="space-y-5">
        {Array.from(floorGroups.entries())
          .sort(([a], [b]) => a - b)
          .map(([floor, floorCells]) => (
            <div key={floor}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-mono font-bold text-text-primary bg-bastet-bg px-2 py-0.5 rounded">
                  {floorLabel(floor)}
                </span>
                <span className="text-xs text-text-muted">{floorCells.length} units</span>
              </div>
              <div className="flex gap-1 flex-wrap">
                {floorCells.map((cell) => (
                  <div
                    key={cell.apartment_id}
                    className={cn(
                      "w-7 h-7 rounded-sm cursor-pointer transition-all duration-200",
                      getCellColor(cell),
                      hoveredCell?.apartment_id === cell.apartment_id &&
                        "ring-2 ring-white/50 scale-110"
                    )}
                    onMouseEnter={() => setHoveredCell(cell)}
                    onMouseLeave={() => setHoveredCell(null)}
                    title={`${cell.apartment_number} - ${cell.status}`}
                    role="gridcell"
                    aria-label={`Apartment ${cell.apartment_number}, ${cell.status}, ${cell.consumption_kwh} kWh per day${cell.is_wasteful ? ", wasteful" : ""}`}
                  />
                ))}
              </div>
            </div>
          ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 md:gap-5 mt-4 pt-3 border-t border-bastet-border">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-cyan-400/60" />
          <span className="text-[10px] text-text-muted">Occupied</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-slate-700/50" />
          <span className="text-[10px] text-text-muted">Vacant (standby)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-red-500/60" />
          <span className="text-[10px] text-text-muted">Vacant (wasting)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-amber-400/50" />
          <span className="text-[10px] text-text-muted">
            Cleaning / Maintenance
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recharts tooltip style
// ---------------------------------------------------------------------------

const darkTooltipStyle = {
  backgroundColor: '#111827',
  border: '1px solid #1F2937',
  borderRadius: '8px',
};

// ---------------------------------------------------------------------------
// Hourly Consumption Bar Chart (Recharts)
// ---------------------------------------------------------------------------

function HourlyConsumptionChart({ data }: { data: TimelinePoint[] }) {
  if (data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
        <XAxis
          dataKey="label"
          tick={{ fill: '#6B7280', fontSize: 10, fontFamily: 'monospace' }}
          axisLine={{ stroke: '#1F2937' }}
          tickLine={false}
          interval={2}
        />
        <YAxis
          tick={{ fill: '#6B7280', fontSize: 10, fontFamily: 'monospace' }}
          axisLine={{ stroke: '#1F2937' }}
          tickLine={false}
          unit=" kWh"
        />
        <Tooltip
          contentStyle={darkTooltipStyle}
          labelStyle={{ color: '#9CA3AF', fontSize: 12 }}
          formatter={(value: any) => [`${value} kWh`]}
        />
        <Bar dataKey="occupied_kwh" name="Occupied" fill="#22D3EE" radius={[3, 3, 0, 0]} />
        <Bar dataKey="vacant_kwh" name="Vacant Waste" fill="#F87171" radius={[3, 3, 0, 0]} opacity={0.7} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Daily Trend Area Chart (Recharts)
// ---------------------------------------------------------------------------

function TimelineChart({ data }: { data: TimelinePoint[] }) {
  if (data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <defs>
          <linearGradient id="gradOccupied" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#22D3EE" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#22D3EE" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="gradWaste" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#F87171" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#F87171" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
        <XAxis
          dataKey="label"
          tick={{ fill: '#6B7280', fontSize: 10, fontFamily: 'monospace' }}
          axisLine={{ stroke: '#1F2937' }}
          tickLine={false}
          interval={2}
        />
        <YAxis
          tick={{ fill: '#6B7280', fontSize: 10, fontFamily: 'monospace' }}
          axisLine={{ stroke: '#1F2937' }}
          tickLine={false}
          unit=" kWh"
        />
        <Tooltip
          contentStyle={darkTooltipStyle}
          labelStyle={{ color: '#9CA3AF', fontSize: 12 }}
          formatter={(value: any) => [`${value} kWh`]}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, color: '#6B7280' }}
        />
        <Area
          type="monotone"
          dataKey="occupied_kwh"
          name="Occupied Usage"
          stroke="#22D3EE"
          strokeWidth={2}
          fill="url(#gradOccupied)"
        />
        <Area
          type="monotone"
          dataKey="total_kwh"
          name="Total (incl. waste)"
          stroke="#F87171"
          strokeWidth={1.5}
          strokeDasharray="4 2"
          fill="url(#gradWaste)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Recommendations Panel
// ---------------------------------------------------------------------------

function RecommendationsPanel({
  recommendations,
  onApply,
  applyingId,
}: {
  recommendations: EnergyRecommendation[];
  onApply: (rec: EnergyRecommendation) => void;
  applyingId: string | null;
}) {
  const priorityStyles = {
    high: "border-red-500/30 bg-red-500/5",
    medium: "border-amber-500/20 bg-amber-500/5",
    low: "border-bastet-border",
  };

  const priorityBadge = {
    high: "bg-red-500/15 text-red-400",
    medium: "bg-amber-500/15 text-amber-400",
    low: "bg-bastet-bg text-text-muted",
  };

  return (
    <div className="space-y-3">
      {recommendations.map((rec) => {
        const Icon = recIconMap[rec.icon] || Zap;
        return (
          <div
            key={rec.id}
            className={cn(
              "p-4 rounded-lg border transition-colors",
              priorityStyles[rec.priority]
            )}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 p-1.5 rounded-md bg-bastet-bg">
                <Icon className="w-4 h-4 text-text-secondary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-semibold text-text-primary">
                    {rec.title}
                  </h4>
                  <span
                    className={cn(
                      "text-[10px] font-medium uppercase px-2 py-0.5 rounded-full",
                      priorityBadge[rec.priority]
                    )}
                  >
                    {rec.priority}
                  </span>
                </div>
                <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                  {rec.description}
                </p>
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-4">
                    {rec.estimated_savings_gbp > 0 && (
                      <span className="text-xs font-mono text-emerald-400 font-bold">
                        Save {"\u00A3"}{rec.estimated_savings_gbp.toFixed(2)}/day
                      </span>
                    )}
                    {rec.affected_units > 0 && (
                      <span className="text-xs text-text-muted">
                        {rec.affected_units} unit{rec.affected_units !== 1 ? "s" : ""} affected
                      </span>
                    )}
                  </div>
                  {rec.estimated_savings_gbp > 0 && (
                    <button
                      onClick={() => onApply(rec)}
                      disabled={applyingId === rec.id}
                      className={cn(
                        "flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                        applyingId === rec.id
                          ? "bg-bastet-bg text-text-muted cursor-wait"
                          : "bg-cyan-400/10 text-cyan-400 hover:bg-cyan-400/20"
                      )}
                    >
                      {applyingId === rec.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                      Apply
                    </button>
                  )}
                </div>
                {rec.unit_numbers.length > 0 && rec.unit_numbers.length <= 12 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {rec.unit_numbers.map((num) => (
                      <span
                        key={num}
                        className="text-[10px] font-mono bg-bastet-bg text-text-muted px-1.5 py-0.5 rounded"
                      >
                        {num}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function EnergyDashboard() {
  const [data, setData] = useState<EnergyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [occupancyByFloor, setOccupancyByFloor] = useState<Record<number, { occupied: number; vacant: number }>>({});
  const [arrivingSoonCount, setArrivingSoonCount] = useState(0);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/ai/energy");
      if (!res.ok) throw new Error("Failed to fetch energy data");
      const json = await res.json();
      setData(json.data);
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

  // Cross-data: compute occupancy overlay & arriving count when data loads
  useEffect(() => {
    if (!data) return;
    const floorOcc: Record<number, { occupied: number; vacant: number }> = {};
    for (const cell of (data.heatmap || [])) {
      const c = cell as unknown as Record<string, unknown>;
      const f = (c.floor as number) ?? 0;
      if (!floorOcc[f]) floorOcc[f] = { occupied: 0, vacant: 0 };
      if (c.status === "occupied") {
        floorOcc[f].occupied++;
      } else {
        floorOcc[f].vacant++;
      }
    }
    setOccupancyByFloor(floorOcc);

    (async () => {
      try {
        const today = new Date().toISOString().split("T")[0];
        const res = await fetch("/api/v1/bookings?status=confirmed&limit=500");
        const json = await res.json();
        const arriving = (json.data || []).filter((b: Record<string, unknown>) => {
          const checkIn = (b.check_in as string)?.split("T")[0];
          return checkIn === today;
        });
        setArrivingSoonCount(arriving.length);
      } catch { /* — */ }
    })();
  }, [data]);

  const emitEnergyEvent = useCallback(
    async (payload: Record<string, unknown>) => {
      try {
        await fetch("/api/v1/ai/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "energy.waste_detected",
            source_system: "energy_dashboard",
            payload,
          }),
        });
      } catch {
        // Event emission is non-critical
      }
    },
    []
  );

  const handleApplyRecommendation = useCallback(
    async (rec: EnergyRecommendation) => {
      setApplyingId(rec.id);
      await emitEnergyEvent({
        recommendation_id: rec.id,
        title: rec.title,
        affected_units: rec.affected_units,
        unit_numbers: rec.unit_numbers,
        estimated_daily_cost: rec.estimated_savings_gbp,
        vacant_units_with_hvac: rec.affected_units,
      });
      setActionMessage(
        `Applied: "${rec.title}" -- Event emitted to the system bus.`
      );
      setTimeout(() => setActionMessage(null), 4000);
      setApplyingId(null);
    },
    [emitEnergyEvent]
  );

  const handleQuickAction = useCallback(
    async (action: "standby" | "precool") => {
      if (!data) return;

      const payload =
        action === "standby"
          ? {
              action: "set_all_vacant_standby",
              vacant_units_with_hvac: data.heatmap.filter(
                (c) =>
                  ["available", "blocked", "out_of_service"].includes(
                    c.status
                  ) && c.is_wasteful
              ).length,
              estimated_daily_cost: data.overview.waste_cost_gbp,
            }
          : {
              action: "precool_arriving_rooms",
              vacant_units_with_hvac: 0,
              estimated_daily_cost: 0,
            };

      await emitEnergyEvent(payload);
      setActionMessage(
        action === "standby"
          ? "All vacant units flagged for standby mode. Event emitted."
          : "Pre-cool command sent for arriving rooms. Event emitted."
      );
      setTimeout(() => setActionMessage(null), 4000);
    },
    [data, emitEnergyEvent]
  );

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Zap className="w-8 h-8 animate-pulse text-cyan-400" />
        <p className="text-sm text-text-secondary">
          Calculating energy metrics...
        </p>
      </div>
    );
  }

  // Error state
  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <AlertTriangle className="w-8 h-8 text-red-400" />
        <p className="text-sm text-text-secondary">
          {error || "Failed to load energy data"}
        </p>
        <button
          onClick={() => {
            setLoading(true);
            fetchData();
          }}
          className="text-xs text-cyan-400 hover:text-cyan-300 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  const { overview, by_building, by_floor, heatmap, timeline, recommendations } = data;
  const floorData = by_floor || by_building;

  // Cross-data computed in useEffect above (occupancyByFloor + arrivingSoonCount)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Zap className="w-6 h-6 text-cyan-400" />
            <h1 className="text-2xl font-display font-bold text-text-primary">
              Energy Monitor
            </h1>
          </div>
          <p className="text-sm text-text-secondary mt-1">
            Real-time energy consumption, waste detection, and savings
            opportunities
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-bastet-card border border-bastet-border">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-medium text-text-secondary">
              Live monitoring
            </span>
          </div>
        </div>
      </div>

      {/* Action message toast */}
      {actionMessage && (
        <div className="bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 text-sm px-4 py-2.5 rounded-lg">
          {actionMessage}
        </div>
      )}

      {/* A. Top Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard
          label="Daily Consumption"
          value={overview.estimated_daily_consumption_kwh.toLocaleString()}
          unit="kWh"
          subtitle={`${overview.total_units} units active`}
          color="text-cyan-400"
        />
        <StatCard
          label="Daily Waste"
          value={overview.waste_kwh.toLocaleString()}
          unit="kWh"
          subtitle={`${"\u00A3"}${overview.waste_cost_gbp.toFixed(2)} wasted`}
          color={overview.waste_kwh > 50 ? "text-red-400" : "text-amber-400"}
          urgent={overview.waste_kwh > 100}
        />
        <StatCard
          label="Savings Potential"
          value={`\u00A3${overview.daily_savings_potential_gbp.toFixed(2)}`}
          subtitle="per day"
          color="text-emerald-400"
        />
        <StatCard
          label="Monthly Projection"
          value={`\u00A3${overview.monthly_savings_potential_gbp.toLocaleString()}`}
          subtitle="projected savings"
          color="text-emerald-400"
        />
        <StatCard
          label="CO2 Reduction"
          value={overview.co2_saved_kg.toLocaleString()}
          unit="kg"
          subtitle="daily potential"
          color="text-emerald-400"
        />
      </div>

      {/* B. Floor Breakdown + C. Heatmap */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-cyan-400" />
              <h3 className="text-lg font-semibold text-text-primary">
                Floor Breakdown
              </h3>
            </div>
            <span className="text-xs text-text-muted">
              {floorData.length} floor{floorData.length !== 1 ? "s" : ""}
            </span>
          </CardHeader>
          <CardContent>
            <FloorBarChart floors={floorData} />
            {/* Occupancy Overlay */}
            {Object.keys(occupancyByFloor).length > 0 && (
              <div className="mt-4 pt-3 border-t border-bastet-border">
                <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Occupancy Overlay</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {Object.entries(occupancyByFloor)
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .map(([floor, counts]) => (
                      <div key={floor} className="flex items-center justify-between p-2 rounded-lg bg-bastet-bg">
                        <span className="text-xs font-mono text-text-primary">{floorLabel(Number(floor))}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-cyan-400 font-mono">{counts.occupied} occ</span>
                          <span className="text-[10px] text-text-muted font-mono">{counts.vacant} vac</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-400" />
              <h3 className="text-lg font-semibold text-text-primary">
                Energy Heatmap
              </h3>
            </div>
            <span className="text-xs text-text-muted">
              {heatmap.length} apartments
            </span>
          </CardHeader>
          <CardContent>
            <EnergyHeatmap cells={heatmap} />
          </CardContent>
        </Card>
      </div>

      {/* D. Hourly Consumption Bars */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-cyan-400" />
            <h3 className="text-lg font-semibold text-text-primary">
              Hourly Consumption
            </h3>
          </div>
        </CardHeader>
        <CardContent>
          <HourlyConsumptionChart data={timeline} />
        </CardContent>
      </Card>

      {/* E. Daily Trend Area Chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-cyan-400" />
            <h3 className="text-lg font-semibold text-text-primary">
              24-Hour Consumption Trend
            </h3>
          </div>
        </CardHeader>
        <CardContent>
          <TimelineChart data={timeline} />
        </CardContent>
      </Card>

      {/* F. Recommendations + G. Quick Actions */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Leaf className="w-4 h-4 text-emerald-400" />
                <h3 className="text-lg font-semibold text-text-primary">
                  AI Recommendations
                </h3>
              </div>
              <span className="text-xs text-text-muted">
                {recommendations.length} suggestion{recommendations.length !== 1 ? "s" : ""}
              </span>
            </CardHeader>
            <CardContent>
              <RecommendationsPanel
                recommendations={recommendations}
                onApply={handleApplyRecommendation}
                applyingId={applyingId}
              />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Power className="w-4 h-4 text-cyan-400" />
              <h3 className="text-lg font-semibold text-text-primary">
                Quick Actions
              </h3>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <button
              onClick={() => handleQuickAction("standby")}
              className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-bastet-border bg-bastet-bg hover:border-cyan-400/30 hover:bg-cyan-400/5 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <Power className="w-4 h-4 text-text-muted group-hover:text-cyan-400 transition-colors" />
                <div className="text-left">
                  <p className="text-sm font-medium text-text-primary">
                    Set all vacant to standby
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    Reduce HVAC to minimum on empty units
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-cyan-400 transition-colors" />
            </button>

            <button
              onClick={() => handleQuickAction("precool")}
              className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-bastet-border bg-bastet-bg hover:border-cyan-400/30 hover:bg-cyan-400/5 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <Thermometer className="w-4 h-4 text-text-muted group-hover:text-cyan-400 transition-colors" />
                <div className="text-left">
                  <p className="text-sm font-medium text-text-primary">
                    Pre-cool arriving rooms
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    Activate 30 min before check-in
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-cyan-400 transition-colors" />
            </button>

            {/* Arriving Soon Note */}
            {arrivingSoonCount > 0 && (
              <div className="p-3 rounded-lg bg-cyan-400/5 border border-cyan-400/20">
                <div className="flex items-center gap-2">
                  <Thermometer className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs text-cyan-400 font-medium">
                    {arrivingSoonCount} room{arrivingSoonCount !== 1 ? "s" : ""} pre-cooling for arrivals today
                  </span>
                </div>
              </div>
            )}

            {/* Summary stats */}
            <div className="mt-4 pt-4 border-t border-bastet-border space-y-3">
              <div className="flex justify-between text-xs">
                <span className="text-text-muted">Occupied</span>
                <span className="font-mono text-cyan-400">
                  {overview.occupied_units} units
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-text-muted">Vacant</span>
                <span className="font-mono text-text-secondary">
                  {overview.vacant_units} units
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-text-muted">Cleaning</span>
                <span className="font-mono text-amber-400">
                  {overview.cleaning_units} units
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-text-muted">Maintenance</span>
                <span className="font-mono text-amber-400">
                  {overview.maintenance_units} units
                </span>
              </div>
              <div className="flex justify-between text-xs pt-2 border-t border-bastet-border">
                <span className="text-text-muted">Optimal vs Actual</span>
                <span className="font-mono text-emerald-400">
                  {overview.optimal_daily_consumption_kwh} /{" "}
                  {overview.estimated_daily_consumption_kwh} kWh
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
