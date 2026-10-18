"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Zap, Power, Thermometer, Building2, Clock, Loader2, ChevronRight } from "lucide-react";
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
import type { RechartsValue } from "@/types/recharts";
import { darkTooltipStyle } from "@/lib/chart-styles";

export const floorLabel = (floor: number) => floor === 0 ? 'Ground' : `Floor ${floor}`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnergyData {
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

export const recIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  power: Power,
  thermometer: Thermometer,
  building: Building2,
  clock: Clock,
  zap: Zap,
};

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

export function StatCard({
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
          <span className={cn("text-lg font-mono font-bold", color)}>
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

export function FloorBarChart({ floors }: { floors: BuildingEnergy[] }) {
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
                <span className="text-xs font-mono font-bold text-text-primary bg-brand-bg px-2 py-0.5 rounded">
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
            <div className="h-7 bg-brand-bg rounded-md overflow-hidden flex">
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
      <div className="flex flex-wrap items-center gap-3 md:gap-5 pt-2 border-t border-brand-border">
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

export function EnergyHeatmap({ cells }: { cells: HeatmapCell[] }) {
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
        <div className="absolute top-0 right-0 z-10 bg-brand-card border border-brand-border rounded-lg p-3 shadow-xl min-w-[200px]">
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
                <span className="text-xs font-mono font-bold text-text-primary bg-brand-bg px-2 py-0.5 rounded">
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
      <div className="flex flex-wrap items-center gap-3 md:gap-5 mt-4 pt-3 border-t border-brand-border">
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


// ---------------------------------------------------------------------------
// Hourly Consumption Bar Chart (Recharts)
// ---------------------------------------------------------------------------

export function HourlyConsumptionChart({ data }: { data: TimelinePoint[] }) {
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
          formatter={(value: RechartsValue) => [`${value} kWh`]}
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

export function TimelineChart({ data }: { data: TimelinePoint[] }) {
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
          formatter={(value: RechartsValue) => [`${value} kWh`]}
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

export function RecommendationsPanel({
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
    low: "border-brand-border",
  };

  const priorityBadge = {
    high: "bg-red-500/15 text-red-400",
    medium: "bg-amber-500/15 text-amber-400",
    low: "bg-brand-bg text-text-muted",
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
              <div className="mt-0.5 p-1.5 rounded-md bg-brand-bg">
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
                          ? "bg-brand-bg text-text-muted cursor-wait"
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
                        className="text-[10px] font-mono bg-brand-bg text-text-muted px-1.5 py-0.5 rounded"
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
