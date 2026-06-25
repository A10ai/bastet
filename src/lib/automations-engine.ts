/**
 * HospitAI Smart Automations Engine
 *
 * Executes rule-based automations against live Supabase data:
 * - Dynamic pricing adjustments based on occupancy thresholds
 * - Auto-creation of housekeeping tasks on checkout
 * - Maintenance pattern detection (repeated issues)
 * - VIP preparation alerts for dirty rooms
 * - Energy standby recommendations for empty units
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { format, subDays } from "date-fns";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AutomationResult {
  action: string;
  description: string;
  impact: string;
  timestamp: string;
}

export type AutomationType =
  | "auto_pricing"
  | "auto_housekeeping"
  | "maintenance_pattern"
  | "vip_preparation"
  | "energy_standby";

export interface AutomationDefinition {
  id: string;
  name: string;
  type: AutomationType;
  description: string;
  enabled: boolean;
  last_run: string | null;
  actions_taken: number;
  run: (supabase: SupabaseClient) => Promise<AutomationResult[]>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const now = () => new Date().toISOString();
const todayStr = () => format(new Date(), "yyyy-MM-dd");

/** Supabase embedded joins can return an array or a single object depending on
 *  the relationship type. This helper safely extracts the first item. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function first<T>(val: T | T[] | null | undefined): T | null {
  if (val == null) return null;
  if (Array.isArray(val)) return val[0] ?? null;
  return val;
}

// ---------------------------------------------------------------------------
// 1. Auto Pricing
// ---------------------------------------------------------------------------

async function runAutoPricing(
  supabase: SupabaseClient
): Promise<AutomationResult[]> {
  const results: AutomationResult[] = [];

  // Get current occupancy
  const { data: apartments } = await supabase
    .from("apartments")
    .select("id, status");
  if (!apartments || apartments.length === 0) return results;

  const total = apartments.length;
  const occupied = apartments.filter(
    (a: { status: string }) => a.status === "occupied"
  ).length;
  const occupancy = Math.round((occupied / total) * 100);

  // Only act when crossing thresholds
  if (occupancy < 85 && occupancy >= 50) {
    results.push({
      action: "pricing_check",
      description: `Occupancy at ${occupancy}% — within normal band (50-85%). No rate adjustment needed.`,
      impact: "No change",
      timestamp: now(),
    });
    return results;
  }

  // Determine multiplier
  let multiplier: number;
  let reason: string;
  if (occupancy > 85) {
    multiplier = 1.15;
    reason = `High occupancy (${occupancy}%) — increasing rates by 15%`;
  } else {
    multiplier = 0.88;
    reason = `Low occupancy (${occupancy}%) — reducing rates by 12% to stimulate bookings`;
  }

  // Fetch apartment types and update rates
  const { data: types } = await supabase
    .from("apartment_types")
    .select("id, name, base_weekly_rate_gbp");

  if (!types || types.length === 0) return results;

  for (const aptType of types) {
    const currentRate = aptType.base_weekly_rate_gbp as number | null;
    if (!currentRate || currentRate <= 0) continue;

    const newRate = Math.round(currentRate * multiplier);
    if (newRate === currentRate) continue;

    const { error } = await supabase
      .from("apartment_types")
      .update({ base_weekly_rate_gbp: newRate })
      .eq("id", aptType.id);

    if (!error) {
      results.push({
        action: "rate_adjusted",
        description: `${aptType.name}: rate changed from £${currentRate} to £${newRate}/night. ${reason}.`,
        impact: `£${Math.abs(newRate - currentRate)}/night ${newRate > currentRate ? "increase" : "decrease"} per booking`,
        timestamp: now(),
      });

      // Log pricing decision
      const { data: prop } = await supabase
        .from("properties")
        .select("id")
        .limit(1)
        .single();

      if (prop) {
        await supabase.from("pricing_decisions").insert({
          property_id: prop.id,
          apartment_type_id: aptType.id,
          decision_date: todayStr(),
          base_rate_gbp: currentRate,
          recommended_rate_gbp: newRate,
          applied_rate_gbp: newRate,
          adjustment_reason: reason,
          demand_score: occupancy,
          was_accepted: true,
        });
      }
    }
  }

  if (results.length === 0) {
    results.push({
      action: "pricing_check",
      description: `Occupancy at ${occupancy}% but no valid rates to adjust.`,
      impact: "No change",
      timestamp: now(),
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// 2. Auto Housekeeping
// ---------------------------------------------------------------------------

async function runAutoHousekeeping(
  supabase: SupabaseClient
): Promise<AutomationResult[]> {
  const results: AutomationResult[] = [];
  const td = todayStr();

  // Find bookings checking out today
  const { data: checkouts } = await supabase
    .from("bookings")
    .select(
      `id, apartment_id, guest_id,
       apartment:apartments(id, number, property_id),
       guest:guests(id, first_name, last_name, vip_status, loyalty_tier)`
    )
    .eq("check_out", td)
    .in("status", ["checked_in", "checked_out"]);

  if (!checkouts || checkouts.length === 0) {
    results.push({
      action: "housekeeping_check",
      description:
        "No checkouts found for today. No housekeeping tasks to create.",
      impact: "No action needed",
      timestamp: now(),
    });
    return results;
  }

  // Check which apartments already have a task for today
  const apartmentIds = checkouts
    .map((b: { apartment_id: string }) => b.apartment_id)
    .filter(Boolean);
  const { data: existingTasks } = await supabase
    .from("housekeeping_tasks")
    .select("apartment_id")
    .in("apartment_id", apartmentIds)
    .eq("scheduled_date", td)
    .eq("type", "checkout_clean");

  const alreadyScheduled = new Set(
    (existingTasks || []).map(
      (t: { apartment_id: string }) => t.apartment_id
    )
  );

  // Find bookings arriving today (for prioritisation)
  const { data: arrivalBookings } = await supabase
    .from("bookings")
    .select("apartment_id")
    .eq("check_in", td)
    .in("status", ["confirmed", "pending"]);

  const arrivalApartments = new Set(
    (arrivalBookings || []).map(
      (b: { apartment_id: string }) => b.apartment_id
    )
  );

  // Get available housekeeping staff
  const { data: hkStaff } = await supabase
    .from("staff")
    .select("id, first_name, last_name")
    .eq("role", "housekeeping")
    .eq("is_active", true);

  // Count current assignments to balance load
  const { data: currentAssignments } = await supabase
    .from("housekeeping_tasks")
    .select("assigned_to")
    .eq("scheduled_date", td)
    .in("status", ["pending", "assigned", "in_progress"]);

  const loadMap = new Map<string, number>();
  (currentAssignments || []).forEach(
    (t: { assigned_to: string | null }) => {
      if (t.assigned_to) {
        loadMap.set(
          t.assigned_to,
          (loadMap.get(t.assigned_to) || 0) + 1
        );
      }
    }
  );

  function getNextHousekeeper(): string | null {
    if (!hkStaff || hkStaff.length === 0) return null;
    let minLoad = Infinity;
    let chosen: string | null = null;
    for (const s of hkStaff) {
      const load = loadMap.get(s.id) || 0;
      if (load < minLoad) {
        minLoad = load;
        chosen = s.id;
      }
    }
    if (chosen) {
      loadMap.set(chosen, (loadMap.get(chosen) || 0) + 1);
    }
    return chosen;
  }

  // Sort checkouts by priority: VIP first, then arrivals-due, then standard
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sorted = [...checkouts].sort((a: Record<string, any>, b: Record<string, any>) => {
    const aGuest = first<{ vip_status?: boolean; loyalty_tier?: string }>(
      a.guest
    );
    const bGuest = first<{ vip_status?: boolean; loyalty_tier?: string }>(
      b.guest
    );
    const aVip =
      aGuest?.vip_status || aGuest?.loyalty_tier === "platinum" ? 1 : 0;
    const bVip =
      bGuest?.vip_status || bGuest?.loyalty_tier === "platinum" ? 1 : 0;
    if (aVip !== bVip) return bVip - aVip;

    const aArr = arrivalApartments.has(a.apartment_id) ? 1 : 0;
    const bArr = arrivalApartments.has(b.apartment_id) ? 1 : 0;
    if (aArr !== bArr) return bArr - aArr;

    return 0;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const booking of sorted as Record<string, any>[]) {
    if (alreadyScheduled.has(booking.apartment_id)) continue;

    const apt = first<{ id: string; number: string; property_id: string }>(
      booking.apartment
    );
    if (!apt) continue;

    const guest = first<{ vip_status?: boolean; loyalty_tier?: string }>(
      booking.guest
    );
    const isVip =
      guest?.vip_status || guest?.loyalty_tier === "platinum";
    const isArrivalDue = arrivalApartments.has(booking.apartment_id);
    const priority = isVip ? "urgent" : isArrivalDue ? "high" : "normal";

    const assignee = getNextHousekeeper();

    const { error } = await supabase.from("housekeeping_tasks").insert({
      property_id: apt.property_id,
      apartment_id: booking.apartment_id,
      assigned_to: assignee,
      type: "checkout_clean",
      status: assignee ? "assigned" : "pending",
      priority,
      scheduled_date: td,
      notes: `Auto-created by Smart Automations. ${isVip ? "VIP room — priority clean." : ""} ${isArrivalDue ? "New arrival due today — urgent turnaround." : ""}`.trim(),
    });

    if (!error) {
      const staffMember = hkStaff?.find(
        (s: { id: string }) => s.id === assignee
      );
      const assignedName = staffMember
        ? `${staffMember.first_name} ${staffMember.last_name}`
        : "Unassigned";

      results.push({
        action: "housekeeping_created",
        description: `Checkout clean created for Apt ${apt.number} (${priority} priority). Assigned to ${assignedName}.`,
        impact: isVip
          ? "VIP turnaround — guest satisfaction priority"
          : isArrivalDue
          ? "Arrival due today — fast turnaround required"
          : "Standard checkout clean",
        timestamp: now(),
      });
    }
  }

  if (results.length === 0) {
    results.push({
      action: "housekeeping_check",
      description: "All checkout cleans already scheduled for today.",
      impact: "No additional tasks needed",
      timestamp: now(),
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// 3. Maintenance Pattern Detection
// ---------------------------------------------------------------------------

interface MaintenanceRow {
  id: string;
  apartment_id: string | null;
  category: string;
  title: string;
  created_at: string;
  apartment: { number: string }[] | { number: string } | null;
}

async function runMaintenancePattern(
  supabase: SupabaseClient
): Promise<AutomationResult[]> {
  const results: AutomationResult[] = [];
  const thirtyDaysAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");

  const { data: requests } = await supabase
    .from("maintenance_requests")
    .select(
      "id, apartment_id, category, title, created_at, apartment:apartments(number)"
    )
    .gte("created_at", thirtyDaysAgo)
    .order("created_at", { ascending: false });

  if (!requests || requests.length === 0) {
    results.push({
      action: "pattern_check",
      description:
        "No maintenance requests in the last 30 days. No patterns detected.",
      impact: "Property in good condition",
      timestamp: now(),
    });
    return results;
  }

  const typedRequests = requests as MaintenanceRow[];

  // Group by apartment_id
  const byApartment = new Map<string, MaintenanceRow[]>();
  for (const req of typedRequests) {
    if (!req.apartment_id) continue;
    const existing = byApartment.get(req.apartment_id) || [];
    existing.push(req);
    byApartment.set(req.apartment_id, existing);
  }

  // Detect apartments with 3+ requests in 30 days
  const aptEntries = Array.from(byApartment.entries());
  for (const [apartmentId, reqs] of aptEntries) {
    if (reqs.length >= 3) {
      const apt = first<{ number: string }>(reqs[0].apartment);
      const aptNumber = apt?.number || apartmentId.slice(0, 8);
      const catSet = new Set<string>();
      reqs.forEach((r) => catSet.add(r.category));
      const categories = Array.from(catSet);

      results.push({
        action: "pattern_detected_unit",
        description: `Apt ${aptNumber} has ${reqs.length} maintenance requests in the last 30 days. Categories: ${categories.join(", ")}. This unit may need a comprehensive inspection.`,
        impact: `Potential systemic issue — ${reqs.length}x repeat requests indicate deeper problem`,
        timestamp: now(),
      });
    }
  }

  // Group by category
  const byCategory = new Map<string, MaintenanceRow[]>();
  for (const req of typedRequests) {
    const existing = byCategory.get(req.category) || [];
    existing.push(req);
    byCategory.set(req.category, existing);
  }

  // Detect categories with 3+ requests in 30 days
  const catEntries = Array.from(byCategory.entries());
  for (const [category, reqs] of catEntries) {
    if (reqs.length >= 3) {
      const aptIds = new Set<string>();
      reqs.forEach((r) => {
        if (r.apartment_id) aptIds.add(r.apartment_id);
      });
      results.push({
        action: "pattern_detected_category",
        description: `"${category}" category has ${reqs.length} requests across ${aptIds.size} unit(s) in the last 30 days. Consider a property-wide ${category} inspection or preventive maintenance programme.`,
        impact: "Preventive action could reduce reactive calls by 40-60%",
        timestamp: now(),
      });
    }
  }

  if (results.length === 0) {
    results.push({
      action: "pattern_check",
      description: `Analysed ${requests.length} requests from the last 30 days. No concerning patterns detected (threshold: 3+ per unit or category).`,
      impact: "Maintenance distribution is normal",
      timestamp: now(),
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// 4. VIP Preparation
// ---------------------------------------------------------------------------

async function runVipPreparation(
  supabase: SupabaseClient
): Promise<AutomationResult[]> {
  const results: AutomationResult[] = [];
  const td = todayStr();

  // Find arrivals today
  const { data: arrivals } = await supabase
    .from("bookings")
    .select(
      `id, apartment_id,
       apartment:apartments(id, number, status),
       guest:guests(id, first_name, last_name, vip_status, loyalty_tier)`
    )
    .eq("check_in", td)
    .in("status", ["confirmed", "pending"]);

  if (!arrivals || arrivals.length === 0) {
    results.push({
      action: "vip_check",
      description: "No arrivals today. VIP preparation not required.",
      impact: "No action needed",
      timestamp: now(),
    });
    return results;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vipArrivals = arrivals.filter((b: Record<string, any>) => {
    const guest = first<{ vip_status?: boolean; loyalty_tier?: string }>(
      b.guest
    );
    return guest?.vip_status || guest?.loyalty_tier === "platinum";
  });

  if (vipArrivals.length === 0) {
    results.push({
      action: "vip_check",
      description: `${arrivals.length} arrival(s) today but none are VIP/Platinum. Standard preparation applies.`,
      impact: "No VIP action needed",
      timestamp: now(),
    });
    return results;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const booking of vipArrivals as Record<string, any>[]) {
    const apt = first<{ id: string; number: string; status: string }>(
      booking.apartment
    );
    const guest = first<{ first_name: string; last_name: string }>(
      booking.guest
    );
    const guestName = guest
      ? `${guest.first_name} ${guest.last_name}`
      : "VIP Guest";

    if (!apt) continue;

    const isReady = apt.status === "available";

    if (!isReady) {
      // Check if there's already a housekeeping task
      const { data: hkTask } = await supabase
        .from("housekeeping_tasks")
        .select("id, status, priority")
        .eq("apartment_id", apt.id)
        .eq("scheduled_date", td)
        .in("status", ["pending", "assigned", "in_progress"])
        .limit(1)
        .maybeSingle();

      if (hkTask) {
        if (hkTask.priority !== "urgent") {
          await supabase
            .from("housekeeping_tasks")
            .update({
              priority: "urgent",
              notes: `ESCALATED: VIP guest ${guestName} arriving today. Room not yet ready.`,
            })
            .eq("id", hkTask.id);

          results.push({
            action: "vip_escalated",
            description: `Apt ${apt.number} — housekeeping task escalated to URGENT for VIP guest ${guestName}. Room status: ${apt.status}.`,
            impact: "VIP satisfaction — immediate attention required",
            timestamp: now(),
          });
        } else {
          results.push({
            action: "vip_monitored",
            description: `Apt ${apt.number} — already has urgent housekeeping task for VIP guest ${guestName}. Monitoring.`,
            impact: "Already prioritised",
            timestamp: now(),
          });
        }
      } else {
        // Create urgent housekeeping task
        const { data: hkStaff } = await supabase
          .from("staff")
          .select("id")
          .eq("role", "housekeeping")
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();

        const { data: prop } = await supabase
          .from("properties")
          .select("id")
          .limit(1)
          .single();

        await supabase.from("housekeeping_tasks").insert({
          property_id: prop?.id,
          apartment_id: apt.id,
          assigned_to: hkStaff?.id || null,
          type: "checkout_clean",
          status: hkStaff ? "assigned" : "pending",
          priority: "urgent",
          scheduled_date: td,
          notes: `VIP ALERT: ${guestName} arriving today. Room not ready (status: ${apt.status}). Created by Smart Automations.`,
        });

        results.push({
          action: "vip_alert_created",
          description: `URGENT: Apt ${apt.number} is "${apt.status}" but VIP guest ${guestName} arrives today. Emergency housekeeping task created.`,
          impact:
            "Critical VIP satisfaction risk — requires immediate resolution",
          timestamp: now(),
        });
      }
    } else {
      results.push({
        action: "vip_ready",
        description: `Apt ${apt.number} is ready for VIP guest ${guestName}. Room status: available.`,
        impact: "VIP preparation confirmed",
        timestamp: now(),
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// 5. Energy Standby
// ---------------------------------------------------------------------------

interface ApartmentRow {
  id: string;
  number: string;
  status: string;
  ac_unit_id: string | null;
  building: { name: string }[] | { name: string } | null;
}

async function runEnergyStandby(
  supabase: SupabaseClient
): Promise<AutomationResult[]> {
  const results: AutomationResult[] = [];

  const { data: apartments } = await supabase
    .from("apartments")
    .select("id, number, status, ac_unit_id, building:buildings(name)")
    .eq("status", "available");

  if (!apartments || apartments.length === 0) {
    results.push({
      action: "energy_check",
      description:
        "No available (empty) units found. All apartments are occupied or in use.",
      impact: "No energy savings opportunity",
      timestamp: now(),
    });
    return results;
  }

  const typedApts = apartments as ApartmentRow[];

  // Check which available units have no arrival scheduled today or tomorrow
  const td = todayStr();
  const tomorrowDate = format(
    new Date(Date.now() + 86_400_000),
    "yyyy-MM-dd"
  );

  const { data: upcomingArrivals } = await supabase
    .from("bookings")
    .select("apartment_id")
    .in("check_in", [td, tomorrowDate])
    .in("status", ["confirmed", "pending"]);

  const arrivalSet = new Set(
    (upcomingArrivals || []).map(
      (b: { apartment_id: string }) => b.apartment_id
    )
  );

  const trueVacant = typedApts.filter((a) => !arrivalSet.has(a.id));

  const savingsPerUnit = 3.5;
  const dailySavings = trueVacant.length * savingsPerUnit;
  const monthlySavings = Math.round(dailySavings * 30);

  if (trueVacant.length > 0) {
    // Group by building
    const byBuilding = new Map<string, ApartmentRow[]>();
    for (const apt of trueVacant) {
      const bldg = first<{ name: string }>(apt.building)?.name || "Unknown";
      const existing = byBuilding.get(bldg) || [];
      existing.push(apt);
      byBuilding.set(bldg, existing);
    }

    const bldgEntries = Array.from(byBuilding.entries());
    for (const [building, apts] of bldgEntries) {
      const unitNumbers = apts
        .map((a) => a.number)
        .slice(0, 8)
        .join(", ");
      const more = apts.length > 8 ? ` +${apts.length - 8} more` : "";

      results.push({
        action: "energy_standby_recommended",
        description: `${building}: ${apts.length} unit(s) vacant with no arrival in 48hrs (${unitNumbers}${more}). HVAC systems can be set to standby mode.`,
        impact: `£${(apts.length * savingsPerUnit).toFixed(2)}/day savings potential`,
        timestamp: now(),
      });
    }

    results.push({
      action: "energy_summary",
      description: `Total: ${trueVacant.length} of ${typedApts.length} available units can have HVAC in standby mode. ${typedApts.length - trueVacant.length} unit(s) have arrivals due and should remain at comfort temperature.`,
      impact: `£${dailySavings.toFixed(2)}/day, ~£${monthlySavings}/month potential savings`,
      timestamp: now(),
    });
  } else {
    results.push({
      action: "energy_check",
      description: `All ${typedApts.length} available units have arrivals due within 48 hours. HVAC should remain at comfort settings.`,
      impact: "No standby savings available right now",
      timestamp: now(),
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Automation Registry
// ---------------------------------------------------------------------------

export const AUTOMATIONS: AutomationDefinition[] = [
  {
    id: "auto_pricing",
    name: "Dynamic Pricing",
    type: "auto_pricing",
    description:
      "Automatically adjusts apartment rates when occupancy crosses key thresholds (>85% increase, <50% decrease). Logs every pricing decision.",
    enabled: true,
    last_run: null,
    actions_taken: 0,
    run: runAutoPricing,
  },
  {
    id: "auto_housekeeping",
    name: "Auto Housekeeping",
    type: "auto_housekeeping",
    description:
      "Creates checkout cleaning tasks and auto-assigns to the least-loaded housekeeper. Prioritises VIP rooms, then arrivals-due, then standard.",
    enabled: true,
    last_run: null,
    actions_taken: 0,
    run: runAutoHousekeeping,
  },
  {
    id: "maintenance_pattern",
    name: "Maintenance Patterns",
    type: "maintenance_pattern",
    description:
      "Detects repeated maintenance requests in the same unit or category (3+ in 30 days) and flags systemic issues for preventive action.",
    enabled: true,
    last_run: null,
    actions_taken: 0,
    run: runMaintenancePattern,
  },
  {
    id: "vip_preparation",
    name: "VIP Preparation",
    type: "vip_preparation",
    description:
      "Scans for VIP and Platinum guests arriving today whose rooms are not yet clean. Creates urgent alerts and escalates housekeeping priority.",
    enabled: true,
    last_run: null,
    actions_taken: 0,
    run: runVipPreparation,
  },
  {
    id: "energy_standby",
    name: "Energy Standby",
    type: "energy_standby",
    description:
      "Identifies vacant units with no upcoming arrivals and recommends HVAC standby mode. Calculates daily and monthly savings potential.",
    enabled: true,
    last_run: null,
    actions_taken: 0,
    run: runEnergyStandby,
  },
];

/**
 * Returns a copy of the automations registry with current metadata.
 * In production the last_run / actions_taken would be stored in a DB table;
 * here we use in-memory state that resets on deploy.
 */
export function getAutomations(): Omit<AutomationDefinition, "run">[] {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return AUTOMATIONS.map(({ run: _run, ...rest }) => rest);
}

/**
 * Run a single automation by ID against live Supabase data.
 */
export async function runAutomation(
  id: string,
  supabase: SupabaseClient
): Promise<AutomationResult[]> {
  const automation = AUTOMATIONS.find((a) => a.id === id);
  if (!automation) throw new Error(`Unknown automation: ${id}`);
  if (!automation.enabled)
    throw new Error(`Automation "${id}" is disabled`);

  const results = await automation.run(supabase);

  automation.last_run = now();
  automation.actions_taken += results.filter(
    (r) => !r.action.endsWith("_check")
  ).length;

  return results;
}

/**
 * Run all enabled automations and return combined results.
 */
export async function runAllAutomations(
  supabase: SupabaseClient
): Promise<
  {
    automation_id: string;
    automation_name: string;
    results: AutomationResult[];
  }[]
> {
  const output: {
    automation_id: string;
    automation_name: string;
    results: AutomationResult[];
  }[] = [];

  for (const automation of AUTOMATIONS) {
    if (!automation.enabled) continue;

    try {
      const results = await automation.run(supabase);
      automation.last_run = now();
      automation.actions_taken += results.filter(
        (r) => !r.action.endsWith("_check")
      ).length;

      output.push({
        automation_id: automation.id,
        automation_name: automation.name,
        results,
      });
    } catch (err) {
      output.push({
        automation_id: automation.id,
        automation_name: automation.name,
        results: [
          {
            action: "error",
            description: `Failed to run: ${err instanceof Error ? err.message : "Unknown error"}`,
            impact: "Automation skipped",
            timestamp: now(),
          },
        ],
      });
    }
  }

  return output;
}
