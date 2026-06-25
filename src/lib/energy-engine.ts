/**
 * HospitAI Energy Engine
 *
 * Calculates energy metrics from real apartment/booking data.
 * Consumption estimates are based on serviced-apartment benchmarks:
 *   - Occupied unit: ~18 kWh/day (HVAC, lighting, appliances, hot water)
 *   - Vacant unit with standby: ~3 kWh/day (fridge, network, safety systems)
 *   - Cleaning/maintenance unit: ~10 kWh/day (equipment, lighting, HVAC blast)
 *
 * Cost rate: GBP 0.28/kWh  (UK commercial average)
 * CO2 factor: 0.23 kg CO2/kWh (UK grid 2025)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KWH_OCCUPIED = 18;
const KWH_VACANT_ACTIVE = 18; // vacant but HVAC still running (wasteful)
const KWH_VACANT_STANDBY = 3;
const KWH_CLEANING = 10;
const KWH_MAINTENANCE = 10;
const COST_PER_KWH = 0.28;
const CO2_PER_KWH = 0.23;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnergyOverview {
  total_units: number;
  occupied_units: number;
  vacant_units: number;
  cleaning_units: number;
  maintenance_units: number;
  estimated_daily_consumption_kwh: number;
  optimal_daily_consumption_kwh: number;
  waste_kwh: number;
  waste_cost_gbp: number;
  daily_savings_potential_gbp: number;
  monthly_savings_potential_gbp: number;
  co2_saved_kg: number;
}

export interface BuildingEnergy {
  building_id: string;
  building_name: string;
  building_code: string;
  total_units: number;
  occupied_units: number;
  vacant_units: number;
  cleaning_units: number;
  maintenance_units: number;
  consumption_kwh: number;
  optimal_kwh: number;
  waste_kwh: number;
  savings_potential_gbp: number;
}

export interface FloorEnergy {
  floor: number;
  total_units: number;
  occupied_units: number;
  vacant_units: number;
  consumption_kwh: number;
  waste_kwh: number;
}

export interface HeatmapCell {
  apartment_id: string;
  apartment_number: string;
  building_code: string;
  building_name: string;
  building_id: string;
  floor: number;
  status: string;
  consumption_kwh: number;
  is_wasteful: boolean;
}

export interface TimelinePoint {
  hour: number;
  label: string;
  total_kwh: number;
  occupied_kwh: number;
  vacant_kwh: number;
}

export interface EnergyRecommendation {
  id: string;
  icon: "power" | "thermometer" | "building" | "clock" | "zap";
  title: string;
  description: string;
  estimated_savings_gbp: number;
  affected_units: number;
  unit_numbers: string[];
  priority: "high" | "medium" | "low";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
interface ApartmentRow {
  id: string;
  number: string;
  floor: number;
  status: string;
  building_id: string;
  buildings?: Record<string, any>[];
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function toApartmentRows(data: unknown): ApartmentRow[] {
  if (!Array.isArray(data)) return [];
  return data as ApartmentRow[];
}

function computeConsumption(status: string, isWasteful: boolean): number {
  switch (status) {
    case "occupied":
      return KWH_OCCUPIED;
    case "cleaning":
      return KWH_CLEANING;
    case "maintenance":
      return KWH_MAINTENANCE;
    case "available":
    case "blocked":
    case "out_of_service":
    default:
      return isWasteful ? KWH_VACANT_ACTIVE : KWH_VACANT_STANDBY;
  }
}

function isVacantStatus(status: string): boolean {
  return ["available", "blocked", "out_of_service"].includes(status);
}

/**
 * Deterministic "wasteful" flag for vacant units.
 * In production this would come from IoT / BMS data.
 * Here we simulate: ~35% of vacant units are wasteful, seeded by apartment id.
 */
function isUnitWasteful(apartmentId: string, status: string): boolean {
  if (!isVacantStatus(status)) return false;
  let hash = 0;
  for (let i = 0; i < apartmentId.length; i++) {
    hash = (hash * 31 + apartmentId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 100 < 35;
}

function getBuildingInfo(unit: ApartmentRow): { code: string; name: string } {
  const b = unit.buildings as Record<string, any> | Record<string, any>[] | null;
  if (!b) return { code: "??", name: "Unknown" };
  // Supabase joins can return object or array depending on relationship
  if (Array.isArray(b)) {
    return b.length > 0
      ? { code: b[0].code || "??", name: b[0].name || "Unknown" }
      : { code: "??", name: "Unknown" };
  }
  return { code: b.code || "??", name: b.name || "Unknown" };
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

export async function getEnergyOverview(
  supabase: SupabaseClient
): Promise<EnergyOverview> {
  const { data: apartments } = await supabase
    .from("apartments")
    .select("id, number, floor, status, building_id");

  const units = toApartmentRows(apartments);
  const total = units.length;
  const occupied = units.filter((a) => a.status === "occupied").length;
  const cleaning = units.filter((a) => a.status === "cleaning").length;
  const maintenance = units.filter((a) => a.status === "maintenance").length;
  const vacant = total - occupied - cleaning - maintenance;

  let estimatedConsumption = 0;
  let optimalConsumption = 0;

  for (const unit of units) {
    const wasteful = isUnitWasteful(unit.id, unit.status);
    estimatedConsumption += computeConsumption(unit.status, wasteful);

    if (isVacantStatus(unit.status)) {
      optimalConsumption += KWH_VACANT_STANDBY;
    } else {
      optimalConsumption += computeConsumption(unit.status, false);
    }
  }

  const waste = Math.max(0, estimatedConsumption - optimalConsumption);
  const wasteCost = waste * COST_PER_KWH;
  const dailySavings = wasteCost;
  const monthlySavings = dailySavings * 30;
  const co2Saved = waste * CO2_PER_KWH;

  return {
    total_units: total,
    occupied_units: occupied,
    vacant_units: vacant,
    cleaning_units: cleaning,
    maintenance_units: maintenance,
    estimated_daily_consumption_kwh: Math.round(estimatedConsumption * 10) / 10,
    optimal_daily_consumption_kwh: Math.round(optimalConsumption * 10) / 10,
    waste_kwh: Math.round(waste * 10) / 10,
    waste_cost_gbp: Math.round(wasteCost * 100) / 100,
    daily_savings_potential_gbp: Math.round(dailySavings * 100) / 100,
    monthly_savings_potential_gbp: Math.round(monthlySavings * 100) / 100,
    co2_saved_kg: Math.round(co2Saved * 10) / 10,
  };
}

export async function getEnergyByBuilding(
  supabase: SupabaseClient
): Promise<BuildingEnergy[]> {
  const { data: apartments } = await supabase
    .from("apartments")
    .select("id, number, floor, status, building_id, buildings(id, code, name)");

  const units = toApartmentRows(apartments);

  // Group by building using a plain object instead of Map iteration
  const buildingGroups: Record<string, ApartmentRow[]> = {};
  for (const unit of units) {
    const bid = unit.building_id || "unknown";
    if (!buildingGroups[bid]) buildingGroups[bid] = [];
    buildingGroups[bid].push(unit);
  }

  const results: BuildingEnergy[] = [];
  const buildingIds = Object.keys(buildingGroups);

  for (let k = 0; k < buildingIds.length; k++) {
    const buildingId = buildingIds[k];
    const buildingUnits = buildingGroups[buildingId];
    const first = buildingUnits[0];
    const building = getBuildingInfo(first);

    const occupied = buildingUnits.filter((a: ApartmentRow) => a.status === "occupied").length;
    const cleaning = buildingUnits.filter((a: ApartmentRow) => a.status === "cleaning").length;
    const maint = buildingUnits.filter((a: ApartmentRow) => a.status === "maintenance").length;
    const vacant = buildingUnits.length - occupied - cleaning - maint;

    let consumption = 0;
    let optimal = 0;

    for (const unit of buildingUnits) {
      const wasteful = isUnitWasteful(unit.id, unit.status);
      consumption += computeConsumption(unit.status, wasteful);
      if (isVacantStatus(unit.status)) {
        optimal += KWH_VACANT_STANDBY;
      } else {
        optimal += computeConsumption(unit.status, false);
      }
    }

    const waste = Math.max(0, consumption - optimal);

    results.push({
      building_id: buildingId,
      building_name: building.name,
      building_code: building.code,
      total_units: buildingUnits.length,
      occupied_units: occupied,
      vacant_units: vacant,
      cleaning_units: cleaning,
      maintenance_units: maint,
      consumption_kwh: Math.round(consumption * 10) / 10,
      optimal_kwh: Math.round(optimal * 10) / 10,
      waste_kwh: Math.round(waste * 10) / 10,
      savings_potential_gbp: Math.round(waste * COST_PER_KWH * 100) / 100,
    });
  }

  results.sort((a, b) => b.waste_kwh - a.waste_kwh);
  return results;
}

const floorLabelFn = (floor: number) => floor === 0 ? 'Ground' : `Floor ${floor}`;

export async function getEnergyByFloorGrouped(
  supabase: SupabaseClient
): Promise<BuildingEnergy[]> {
  const { data: apartments } = await supabase
    .from("apartments")
    .select("id, number, floor, status, building_id");

  const units = toApartmentRows(apartments);

  // Group by floor
  const floorGroups: Record<number, ApartmentRow[]> = {};
  for (const unit of units) {
    const f = unit.floor ?? 0;
    if (!floorGroups[f]) floorGroups[f] = [];
    floorGroups[f].push(unit);
  }

  const results: BuildingEnergy[] = [];
  const floors = Object.keys(floorGroups).map(Number).sort((a, b) => a - b);

  for (const floor of floors) {
    const floorUnits = floorGroups[floor];

    const occupied = floorUnits.filter((a) => a.status === "occupied").length;
    const cleaning = floorUnits.filter((a) => a.status === "cleaning").length;
    const maint = floorUnits.filter((a) => a.status === "maintenance").length;
    const vacant = floorUnits.length - occupied - cleaning - maint;

    let consumption = 0;
    let optimal = 0;

    for (const unit of floorUnits) {
      const wasteful = isUnitWasteful(unit.id, unit.status);
      consumption += computeConsumption(unit.status, wasteful);
      if (isVacantStatus(unit.status)) {
        optimal += KWH_VACANT_STANDBY;
      } else {
        optimal += computeConsumption(unit.status, false);
      }
    }

    const waste = Math.max(0, consumption - optimal);

    results.push({
      building_id: String(floor),
      building_name: floorLabelFn(floor),
      building_code: `F${floor}`,
      total_units: floorUnits.length,
      occupied_units: occupied,
      vacant_units: vacant,
      cleaning_units: cleaning,
      maintenance_units: maint,
      consumption_kwh: Math.round(consumption * 10) / 10,
      optimal_kwh: Math.round(optimal * 10) / 10,
      waste_kwh: Math.round(waste * 10) / 10,
      savings_potential_gbp: Math.round(waste * COST_PER_KWH * 100) / 100,
    });
  }

  return results;
}

export async function getEnergyByFloor(
  supabase: SupabaseClient,
  buildingId: string
): Promise<FloorEnergy[]> {
  const { data: apartments } = await supabase
    .from("apartments")
    .select("id, number, floor, status, building_id")
    .eq("building_id", buildingId);

  const units = toApartmentRows(apartments);
  const floorGroups: Record<number, ApartmentRow[]> = {};

  for (const unit of units) {
    const f = unit.floor || 0;
    if (!floorGroups[f]) floorGroups[f] = [];
    floorGroups[f].push(unit);
  }

  const results: FloorEnergy[] = [];
  const floors = Object.keys(floorGroups).map(Number);

  for (let k = 0; k < floors.length; k++) {
    const floor = floors[k];
    const floorUnits = floorGroups[floor];
    const occupied = floorUnits.filter((a: ApartmentRow) => a.status === "occupied").length;
    const vacant = floorUnits.filter((a: ApartmentRow) => isVacantStatus(a.status)).length;

    let consumption = 0;
    let optimal = 0;

    for (const unit of floorUnits) {
      const wasteful = isUnitWasteful(unit.id, unit.status);
      consumption += computeConsumption(unit.status, wasteful);
      if (isVacantStatus(unit.status)) {
        optimal += KWH_VACANT_STANDBY;
      } else {
        optimal += computeConsumption(unit.status, false);
      }
    }

    results.push({
      floor,
      total_units: floorUnits.length,
      occupied_units: occupied,
      vacant_units: vacant,
      consumption_kwh: Math.round(consumption * 10) / 10,
      waste_kwh: Math.round(Math.max(0, consumption - optimal) * 10) / 10,
    });
  }

  results.sort((a, b) => a.floor - b.floor);
  return results;
}

export async function getEnergyHeatmap(
  supabase: SupabaseClient
): Promise<HeatmapCell[]> {
  const { data: apartments } = await supabase
    .from("apartments")
    .select("id, number, floor, status, building_id, buildings(id, code, name)")
    .order("building_id")
    .order("floor")
    .order("number");

  const units = toApartmentRows(apartments);

  return units.map((unit) => {
    const wasteful = isUnitWasteful(unit.id, unit.status);
    const building = getBuildingInfo(unit);

    return {
      apartment_id: unit.id,
      apartment_number: unit.number,
      building_code: building.code,
      building_name: building.name,
      building_id: unit.building_id,
      floor: unit.floor || 0,
      status: unit.status,
      consumption_kwh: computeConsumption(unit.status, wasteful),
      is_wasteful: wasteful,
    };
  });
}

export function getEnergyTimeline(
  occupiedUnits: number,
  vacantWastefulUnits: number
): TimelinePoint[] {
  // Hourly consumption multipliers (normalised to 1.0 = average)
  const hourlyMultipliers = [
    0.45, 0.40, 0.38, 0.36, 0.35, 0.40, // 00-05: deep night
    0.55, 0.75, 0.95, 1.00, 0.92, 0.88, // 06-11: morning peak
    0.85, 0.82, 0.80, 0.82, 0.88, 0.95, // 12-17: afternoon
    1.10, 1.15, 1.08, 0.95, 0.75, 0.55, // 18-23: evening peak
  ];

  const avgOccupiedHourly = KWH_OCCUPIED / 24;
  const avgVacantWasteHourly = (KWH_VACANT_ACTIVE - KWH_VACANT_STANDBY) / 24;

  return hourlyMultipliers.map((mult, hour) => {
    const occupiedKwh = occupiedUnits * avgOccupiedHourly * mult;
    const vacantKwh = vacantWastefulUnits * avgVacantWasteHourly * mult;

    return {
      hour,
      label: `${hour.toString().padStart(2, "0")}:00`,
      total_kwh: Math.round((occupiedKwh + vacantKwh) * 10) / 10,
      occupied_kwh: Math.round(occupiedKwh * 10) / 10,
      vacant_kwh: Math.round(vacantKwh * 10) / 10,
    };
  });
}

export async function getEnergyRecommendations(
  supabase: SupabaseClient
): Promise<EnergyRecommendation[]> {
  const heatmap = await getEnergyHeatmap(supabase);
  const recommendations: EnergyRecommendation[] = [];

  // 1. Vacant units with active HVAC (wasteful)
  const wastefulVacant = heatmap.filter(
    (c) => isVacantStatus(c.status) && c.is_wasteful
  );

  if (wastefulVacant.length > 0) {
    const dailySavings =
      wastefulVacant.length * (KWH_VACANT_ACTIVE - KWH_VACANT_STANDBY) * COST_PER_KWH;

    recommendations.push({
      id: "vacant-hvac-standby",
      icon: "power",
      title: `${wastefulVacant.length} vacant units have active HVAC`,
      description: `Switch these units to standby mode to eliminate unnecessary energy consumption. Each unit is consuming ~${KWH_VACANT_ACTIVE} kWh/day instead of the optimal ${KWH_VACANT_STANDBY} kWh/day.`,
      estimated_savings_gbp: Math.round(dailySavings * 100) / 100,
      affected_units: wastefulVacant.length,
      unit_numbers: wastefulVacant.map((c) => c.apartment_number),
      priority: "high",
    });
  }

  // 2. Building with highest waste ratio
  const buildingWasteMap: Record<
    string,
    { name: string; code: string; waste: number; total: number }
  > = {};

  for (const cell of heatmap) {
    if (!buildingWasteMap[cell.building_id]) {
      buildingWasteMap[cell.building_id] = {
        name: cell.building_name,
        code: cell.building_code,
        waste: 0,
        total: 0,
      };
    }
    const entry = buildingWasteMap[cell.building_id];
    entry.total++;
    if (cell.is_wasteful) entry.waste++;
  }

  let worstBuilding: { name: string; code: string; ratio: number } | null = null;
  const bwKeys = Object.keys(buildingWasteMap);
  for (let i = 0; i < bwKeys.length; i++) {
    const entry = buildingWasteMap[bwKeys[i]];
    if (entry.total === 0) continue;
    const ratio = entry.waste / entry.total;
    if (!worstBuilding || ratio > worstBuilding.ratio) {
      worstBuilding = { name: entry.name, code: entry.code, ratio };
    }
  }

  if (worstBuilding && worstBuilding.ratio > 0) {
    const worstBuildingCells = heatmap.filter(
      (c) => c.building_code === worstBuilding!.code
    );
    const floorWasteMap: Record<number, { waste: number; total: number }> = {};
    for (const cell of worstBuildingCells) {
      if (!floorWasteMap[cell.floor]) {
        floorWasteMap[cell.floor] = { waste: 0, total: 0 };
      }
      const entry = floorWasteMap[cell.floor];
      entry.total++;
      if (cell.is_wasteful) entry.waste++;
    }

    let worstFloor = 0;
    let worstFloorRatio = 0;
    const fwKeys = Object.keys(floorWasteMap);
    for (let i = 0; i < fwKeys.length; i++) {
      const floor = Number(fwKeys[i]);
      const entry = floorWasteMap[floor];
      const ratio = entry.total > 0 ? entry.waste / entry.total : 0;
      if (ratio > worstFloorRatio) {
        worstFloorRatio = ratio;
        worstFloor = floor;
      }
    }

    if (worstFloorRatio > 0) {
      const affectedUnits = worstBuildingCells.filter(
        (c) => c.floor === worstFloor && c.is_wasteful
      );
      const floorSavings =
        affectedUnits.length *
        (KWH_VACANT_ACTIVE - KWH_VACANT_STANDBY) *
        COST_PER_KWH;

      recommendations.push({
        id: "building-floor-waste",
        icon: "building",
        title: `${worstBuilding.name} floor ${worstFloor} has highest waste ratio`,
        description: `${Math.round(worstFloorRatio * 100)}% of vacant units on this floor are consuming full power. Investigate potential BMS configuration issues or stuck HVAC relays.`,
        estimated_savings_gbp: Math.round(floorSavings * 100) / 100,
        affected_units: affectedUnits.length,
        unit_numbers: affectedUnits.map((c) => c.apartment_number),
        priority: "medium",
      });
    }
  }

  // 3. Pre-cool arriving rooms recommendation
  const today = new Date().toISOString().split("T")[0];
  const { data: todayArrivals } = await supabase
    .from("bookings")
    .select("id, apartment_id, apartments(number)")
    .eq("check_in", today)
    .in("status", ["confirmed", "pending"]);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const arrivingUnits = (todayArrivals || []) as Record<string, any>[];
  /* eslint-enable @typescript-eslint/no-explicit-any */

  if (arrivingUnits.length > 0) {
    const savingsPerUnit = (KWH_OCCUPIED - KWH_OCCUPIED * 0.5) * COST_PER_KWH * 0.25;
    recommendations.push({
      id: "precool-arrivals",
      icon: "thermometer",
      title: "Pre-cool arriving rooms 30 min before check-in",
      description: `${arrivingUnits.length} arrivals today. Instead of running HVAC at full power for hours, activate cooling 30 minutes before scheduled check-in time for optimal comfort with minimal waste.`,
      estimated_savings_gbp:
        Math.round(arrivingUnits.length * savingsPerUnit * 100) / 100,
      affected_units: arrivingUnits.length,
      unit_numbers: arrivingUnits.map(
        (a: { apartments?: { number?: string } | null }) =>
          a.apartments?.number || "Unknown"
      ),
      priority: "medium",
    });
  }

  // 4. Off-peak scheduling recommendation
  const cleaningUnits = heatmap.filter((c) => c.status === "cleaning");
  if (cleaningUnits.length > 2) {
    const savings = cleaningUnits.length * KWH_CLEANING * 0.15 * COST_PER_KWH;
    recommendations.push({
      id: "offpeak-cleaning",
      icon: "clock",
      title: "Schedule cleaning during off-peak energy hours",
      description: `${cleaningUnits.length} units are being cleaned. Shifting heavy-equipment cleaning tasks to off-peak hours (10:00-14:00) can reduce energy costs by up to 15%.`,
      estimated_savings_gbp: Math.round(savings * 100) / 100,
      affected_units: cleaningUnits.length,
      unit_numbers: cleaningUnits.map((c) => c.apartment_number),
      priority: "low",
    });
  }

  // 5. General efficiency tip (always show at least one)
  if (recommendations.length === 0) {
    recommendations.push({
      id: "energy-optimal",
      icon: "zap",
      title: "Energy usage is near optimal",
      description:
        "All vacant units are on standby mode and no significant waste patterns detected. Continue monitoring for changes.",
      estimated_savings_gbp: 0,
      affected_units: 0,
      unit_numbers: [],
      priority: "low",
    });
  }

  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  recommendations.sort(
    (a, b) => (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2)
  );

  return recommendations;
}
