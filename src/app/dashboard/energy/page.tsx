"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { DemoDataBanner } from "@/components/ui/demo-data-banner";
import { Zap, AlertTriangle, TrendingDown, Leaf, Power, Thermometer, Building2, ChevronRight } from "lucide-react";
import { } from "recharts";
import type { EnergyRecommendation } from "@/lib/energy-engine";
import type { EnergyData} from "@/components/energy/energy-sections";
import { floorLabel, StatCard, FloorBarChart, EnergyHeatmap, HourlyConsumptionChart, TimelineChart, RecommendationsPanel } from "@/components/energy/energy-sections";

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
            Modelled energy consumption, waste detection, and savings
            opportunities
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-card border border-brand-border">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-medium text-text-secondary">
              Live monitoring
            </span>
          </div>
        </div>
      </div>

      <DemoDataBanner kind="modelled">
        No meters or building-management system are connected. Consumption is estimated from unit
        status using serviced-apartment benchmarks, and &ldquo;wasteful&rdquo; units are a modelled
        share of vacant units, not sensor readings. Treat savings as indicative only.
      </DemoDataBanner>

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
              <div className="mt-4 pt-3 border-t border-brand-border">
                <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Occupancy Overlay</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {Object.entries(occupancyByFloor)
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .map(([floor, counts]) => (
                      <div key={floor} className="flex items-center justify-between p-2 rounded-lg bg-brand-bg">
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
              className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-brand-border bg-brand-bg hover:border-cyan-400/30 hover:bg-cyan-400/5 transition-colors group"
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
              className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-brand-border bg-brand-bg hover:border-cyan-400/30 hover:bg-cyan-400/5 transition-colors group"
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
            <div className="mt-4 pt-4 border-t border-brand-border space-y-3">
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
              <div className="flex justify-between text-xs pt-2 border-t border-brand-border">
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
