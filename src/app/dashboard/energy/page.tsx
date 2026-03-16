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
import { cn } from "@/lib/utils";
import type {
  EnergyOverview,
  BuildingEnergy,
  HeatmapCell,
  TimelinePoint,
  EnergyRecommendation,
} from "@/lib/energy-engine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EnergyData {
  overview: EnergyOverview;
  by_building: BuildingEnergy[];
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

function BuildingBarChart({ buildings }: { buildings: BuildingEnergy[] }) {
  if (buildings.length === 0) {
    return (
      <p className="text-sm text-text-muted py-8 text-center">
        No building data available
      </p>
    );
  }

  const maxConsumption = Math.max(...buildings.map((b) => b.consumption_kwh), 1);

  return (
    <div className="space-y-4">
      {buildings.map((building) => {
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
          <div key={building.building_id} className="group">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-text-primary bg-bastet-bg px-2 py-0.5 rounded">
                  {building.building_code}
                </span>
                <span className="text-sm text-text-secondary">
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
      <div className="flex items-center gap-5 pt-2 border-t border-bastet-border">
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

  // Group by building then floor
  const buildingGroups = new Map<
    string,
    { code: string; name: string; floors: Map<number, HeatmapCell[]> }
  >();

  for (const cell of cells) {
    if (!buildingGroups.has(cell.building_id)) {
      buildingGroups.set(cell.building_id, {
        code: cell.building_code,
        name: cell.building_name,
        floors: new Map(),
      });
    }
    const group = buildingGroups.get(cell.building_id)!;
    if (!group.floors.has(cell.floor)) {
      group.floors.set(cell.floor, []);
    }
    group.floors.get(cell.floor)!.push(cell);
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
            {hoveredCell.building_name} / Floor {hoveredCell.floor}
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
        {Array.from(buildingGroups.entries()).map(
          ([buildingId, { code, name, floors }]) => (
            <div key={buildingId}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-mono font-bold text-text-primary bg-bastet-bg px-2 py-0.5 rounded">
                  {code}
                </span>
                <span className="text-xs text-text-muted">{name}</span>
              </div>
              <div className="space-y-1.5">
                {Array.from(floors.entries())
                  .sort(([a], [b]) => a - b)
                  .map(([floor, floorCells]) => (
                    <div key={floor} className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-text-muted w-8 text-right shrink-0">
                        F{floor}
                      </span>
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
            </div>
          )
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 mt-4 pt-3 border-t border-bastet-border">
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
// 24-Hour Timeline Chart (SVG)
// ---------------------------------------------------------------------------

function TimelineChart({ data }: { data: TimelinePoint[] }) {
  if (data.length === 0) return null;

  const width = 800;
  const height = 200;
  const padLeft = 45;
  const padRight = 15;
  const padTop = 10;
  const padBottom = 30;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const maxKwh = Math.max(...data.map((d) => d.total_kwh), 1);
  const yScale = chartH / (maxKwh * 1.15); // 15% headroom

  function x(i: number): number {
    return padLeft + (i / (data.length - 1)) * chartW;
  }

  function y(val: number): number {
    return padTop + chartH - val * yScale;
  }

  // Build SVG path for occupied area
  const occupiedPath = data
    .map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.occupied_kwh)}`)
    .join(" ");
  const occupiedArea = `${occupiedPath} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;

  // Build SVG path for total (occupied + waste) area
  const totalPath = data
    .map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.total_kwh)}`)
    .join(" ");
  const totalArea = `${totalPath} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;

  // Waste area between occupied and total
  const wasteAreaTop = data
    .map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.total_kwh)}`)
    .join(" ");
  const wasteAreaBottom = data
    .slice()
    .reverse()
    .map((d, i) => `L${x(data.length - 1 - i)},${y(d.occupied_kwh)}`)
    .join(" ");
  const wasteArea = `${wasteAreaTop} ${wasteAreaBottom} Z`;

  // Y-axis ticks
  const yTicks = 5;
  const yTickStep = Math.ceil(maxKwh / yTicks);

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full min-w-[600px]"
        role="img"
        aria-label="24-hour energy consumption chart"
      >
        {/* Grid lines */}
        {Array.from({ length: yTicks + 1 }, (_, i) => {
          const val = i * yTickStep;
          if (val > maxKwh * 1.15) return null;
          return (
            <g key={`grid-${i}`}>
              <line
                x1={padLeft}
                y1={y(val)}
                x2={width - padRight}
                y2={y(val)}
                stroke="currentColor"
                strokeOpacity={0.08}
                strokeDasharray="4 4"
              />
              <text
                x={padLeft - 8}
                y={y(val) + 3}
                textAnchor="end"
                className="fill-text-muted"
                fontSize="10"
                fontFamily="monospace"
              >
                {val}
              </text>
            </g>
          );
        })}

        {/* Occupied area (cyan) */}
        <path d={occupiedArea} fill="rgba(34,211,238,0.25)" />
        <path
          d={occupiedPath}
          fill="none"
          stroke="rgba(34,211,238,0.8)"
          strokeWidth="2"
        />

        {/* Waste area (red) */}
        <path d={wasteArea} fill="rgba(248,113,113,0.25)" />
        <path
          d={totalPath}
          fill="none"
          stroke="rgba(248,113,113,0.7)"
          strokeWidth="1.5"
          strokeDasharray="4 2"
        />

        {/* X-axis labels */}
        {data.map((d, i) => {
          if (i % 3 !== 0 && i !== data.length - 1) return null;
          return (
            <text
              key={`x-${i}`}
              x={x(i)}
              y={height - 8}
              textAnchor="middle"
              className="fill-text-muted"
              fontSize="10"
              fontFamily="monospace"
            >
              {d.label}
            </text>
          );
        })}

        {/* Y-axis label */}
        <text
          x={12}
          y={padTop + chartH / 2}
          textAnchor="middle"
          className="fill-text-muted"
          fontSize="9"
          fontFamily="monospace"
          transform={`rotate(-90, 12, ${padTop + chartH / 2})`}
        >
          kWh
        </text>
      </svg>
    </div>
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

  const { overview, by_building, heatmap, timeline, recommendations } = data;

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

      {/* B. Building Breakdown + C. Heatmap */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-cyan-400" />
              <h3 className="text-lg font-semibold text-text-primary">
                Building Breakdown
              </h3>
            </div>
            <span className="text-xs text-text-muted">
              {by_building.length} building{by_building.length !== 1 ? "s" : ""}
            </span>
          </CardHeader>
          <CardContent>
            <BuildingBarChart buildings={by_building} />
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

      {/* D. 24-Hour Consumption Chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-cyan-400" />
            <h3 className="text-lg font-semibold text-text-primary">
              24-Hour Consumption Pattern
            </h3>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-1.5 rounded bg-cyan-400/60" />
              <span className="text-[10px] text-text-muted">
                Occupied usage
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-1.5 rounded bg-red-400/60" />
              <span className="text-[10px] text-text-muted">Vacant waste</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <TimelineChart data={timeline} />
        </CardContent>
      </Card>

      {/* E. Recommendations + F. Quick Actions */}
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
