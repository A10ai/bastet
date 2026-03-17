/**
 * HospitAI Brain -- Hybrid Intelligence Engine
 *
 * Gathers a full property data snapshot from Supabase, sends it to
 * Claude API (Anthropic) for reasoning, or falls back to rule-based
 * analysis when no API key is configured.
 *
 * Returns structured decisions with category, action, reasoning,
 * confidence, and impact. Supports supervised (human approves) and
 * autonomous (auto-executes) modes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { emitEvent, type EventType } from "@/lib/event-bus";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BrainDecision {
  id: string;
  category: "pricing" | "operations" | "energy" | "guest" | "maintenance" | "revenue";
  action: string;
  reasoning: string;
  confidence: number;
  impact_estimate: string;
  auto_executable: boolean;
  executed: boolean;
  approved: boolean | null;
  created_at: string;
  event_type?: EventType;
  event_payload?: Record<string, unknown>;
}

export interface BrainCycleResult {
  cycle_id: string;
  mode: "supervised" | "autonomous";
  timestamp: string;
  data_snapshot: Record<string, unknown>;
  decisions: BrainDecision[];
  summary: string;
}

export interface BrainConfig {
  mode: "supervised" | "autonomous";
  enabled: boolean;
  cycle_interval_minutes: number;
  last_cycle: string | null;
  total_cycles: number;
  total_decisions: number;
  total_executed: number;
}

interface DataSnapshot {
  occupancy: {
    total: number;
    occupied: number;
    available: number;
    cleaning: number;
    maintenance: number;
    occupancy_percent: number;
  };
  revenue: {
    today: number;
    this_week: number;
    this_month: number;
  };
  arrivals: {
    count: number;
    bookings: Array<{
      id: string;
      guest_name: string;
      apartment_number: string;
      check_in_date: string;
    }>;
  };
  departures: {
    count: number;
    bookings: Array<{
      id: string;
      guest_name: string;
      apartment_number: string;
      check_out_date: string;
    }>;
  };
  maintenance: {
    open: number;
    urgent: number;
    categories: Record<string, number>;
  };
  housekeeping: {
    pending: number;
    in_progress: number;
    completed_today: number;
  };
  energy: {
    vacant_units: number;
    estimated_daily_waste: number;
  };
  guest_alerts: {
    vip_arrivals: Array<{
      guest_name: string;
      loyalty_tier: string;
      apartment_number: string;
    }>;
  };
  current_rates: Array<{
    type_name: string;
    rate: number;
  }>;
}

// ---------------------------------------------------------------------------
// In-memory config (persists across requests in the same server process)
// ---------------------------------------------------------------------------

let brainConfig: BrainConfig = {
  mode: "supervised",
  enabled: true,
  cycle_interval_minutes: 30,
  last_cycle: null,
  total_cycles: 0,
  total_decisions: 0,
  total_executed: 0,
};

export function getBrainConfig(): BrainConfig {
  return { ...brainConfig };
}

export function updateBrainConfig(updates: Partial<BrainConfig>): BrainConfig {
  brainConfig = { ...brainConfig, ...updates };
  return { ...brainConfig };
}

// ---------------------------------------------------------------------------
// Data Snapshot Gathering
// ---------------------------------------------------------------------------

async function gatherDataSnapshot(supabase: SupabaseClient): Promise<DataSnapshot> {
  const today = new Date().toISOString().split("T")[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
  const monthStart = `${today.slice(0, 7)}-01`;

  // Run all queries in parallel for speed
  const [
    apartmentsResult,
    arrivalsResult,
    departuresResult,
    maintenanceResult,
    urgentMaintenanceResult,
    housekeepingPendingResult,
    housekeepingInProgressResult,
    housekeepingCompletedResult,
    ratesResult,
    todayRevenueResult,
    weekRevenueResult,
    monthRevenueResult,
  ] = await Promise.all([
    // Apartments overview
    supabase.from("apartments").select("id, status, number"),
    // Today's arrivals
    supabase
      .from("bookings")
      .select("id, check_in_date, apartments(number), guests(first_name, last_name, loyalty_tier)")
      .eq("check_in_date", today)
      .in("status", ["confirmed", "pending"]),
    // Today's departures
    supabase
      .from("bookings")
      .select("id, check_out_date, apartments(number), guests(first_name, last_name)")
      .eq("check_out_date", today)
      .in("status", ["checked_in", "confirmed"]),
    // Open maintenance
    supabase
      .from("maintenance_requests")
      .select("id, priority, category")
      .in("status", ["open", "assigned", "in_progress"]),
    // Urgent maintenance
    supabase
      .from("maintenance_requests")
      .select("id")
      .in("status", ["open", "assigned", "in_progress"])
      .in("priority", ["urgent", "emergency"]),
    // Housekeeping pending
    supabase
      .from("housekeeping_tasks")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    // Housekeeping in progress
    supabase
      .from("housekeeping_tasks")
      .select("id", { count: "exact", head: true })
      .eq("status", "in_progress"),
    // Housekeeping completed today
    supabase
      .from("housekeeping_tasks")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed")
      .gte("updated_at", today),
    // Current rates
    supabase.from("apartment_types").select("name, base_rate_gbp"),
    // Revenue today
    supabase
      .from("bookings")
      .select("total_price_gbp")
      .eq("check_in_date", today)
      .in("status", ["confirmed", "checked_in"]),
    // Revenue this week
    supabase
      .from("bookings")
      .select("total_price_gbp")
      .gte("check_in_date", weekAgo)
      .lte("check_in_date", today)
      .in("status", ["confirmed", "checked_in", "checked_out"]),
    // Revenue this month
    supabase
      .from("bookings")
      .select("total_price_gbp")
      .gte("check_in_date", monthStart)
      .lte("check_in_date", today)
      .in("status", ["confirmed", "checked_in", "checked_out"]),
  ]);

  // Process apartments
  const apartments = apartmentsResult.data || [];
  const total = apartments.length;
  const occupied = apartments.filter((a: any) => a.status === "occupied").length;
  const available = apartments.filter((a: any) => a.status === "available").length;
  const cleaning = apartments.filter((a: any) => a.status === "cleaning").length;
  const maintenanceStatusCount = apartments.filter((a: any) => a.status === "maintenance").length;
  const vacantStatuses = ["available", "blocked", "out_of_service"];
  const vacantUnits = apartments.filter((a: any) => vacantStatuses.includes(a.status)).length;

  // Process arrivals
  const arrivals = (arrivalsResult.data || []).map((b: any) => ({
    id: b.id,
    guest_name: b.guests ? `${b.guests.first_name} ${b.guests.last_name}` : "Unknown",
    apartment_number: b.apartments?.number || "TBD",
    check_in_date: b.check_in_date,
  }));

  // VIP arrivals
  const vipArrivals = (arrivalsResult.data || [])
    .filter((b: any) => b.guests?.loyalty_tier === "platinum" || b.guests?.loyalty_tier === "gold")
    .map((b: any) => ({
      guest_name: `${b.guests.first_name} ${b.guests.last_name}`,
      loyalty_tier: b.guests.loyalty_tier,
      apartment_number: b.apartments?.number || "TBD",
    }));

  // Process departures
  const departures = (departuresResult.data || []).map((b: any) => ({
    id: b.id,
    guest_name: b.guests ? `${b.guests.first_name} ${b.guests.last_name}` : "Unknown",
    apartment_number: b.apartments?.number || "TBD",
    check_out_date: b.check_out_date,
  }));

  // Maintenance categories
  const maintenanceItems = maintenanceResult.data || [];
  const categories: Record<string, number> = {};
  maintenanceItems.forEach((m: any) => {
    categories[m.category] = (categories[m.category] || 0) + 1;
  });

  // Revenue sums
  const sumField = (rows: any[] | null) =>
    (rows || []).reduce((sum: number, r: any) => sum + (r.total_price_gbp || 0), 0);

  // Rates
  const currentRates = (ratesResult.data || []).map((r: any) => ({
    type_name: r.name,
    rate: r.base_rate_gbp,
  }));

  // Estimated energy waste: ~£8/unit/day for HVAC in vacant units
  const estimatedDailyWaste = vacantUnits * 8;

  return {
    occupancy: {
      total,
      occupied,
      available,
      cleaning,
      maintenance: maintenanceStatusCount,
      occupancy_percent: total > 0 ? Math.round((occupied / total) * 100) : 0,
    },
    revenue: {
      today: sumField(todayRevenueResult.data),
      this_week: sumField(weekRevenueResult.data),
      this_month: sumField(monthRevenueResult.data),
    },
    arrivals: { count: arrivals.length, bookings: arrivals },
    departures: { count: departures.length, bookings: departures },
    maintenance: {
      open: maintenanceItems.length,
      urgent: (urgentMaintenanceResult.data || []).length,
      categories,
    },
    housekeeping: {
      pending: housekeepingPendingResult.count || 0,
      in_progress: housekeepingInProgressResult.count || 0,
      completed_today: housekeepingCompletedResult.count || 0,
    },
    energy: {
      vacant_units: vacantUnits,
      estimated_daily_waste: estimatedDailyWaste,
    },
    guest_alerts: {
      vip_arrivals: vipArrivals,
    },
    current_rates: currentRates,
  };
}

// ---------------------------------------------------------------------------
// Claude API Reasoning
// ---------------------------------------------------------------------------

interface ClaudeDecisionRaw {
  category: string;
  action: string;
  reasoning: string;
  confidence: number;
  impact_estimate: string;
  auto_executable: boolean;
  event_type?: string;
  event_payload?: Record<string, unknown>;
}

interface ClaudeResponse {
  decisions: ClaudeDecisionRaw[];
  summary: string;
}

async function callClaudeAPI(snapshot: DataSnapshot): Promise<ClaudeResponse | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const systemPrompt = `You are the HospitAI Brain, an AI operations manager for a serviced apartment property.
Analyze the provided property data snapshot and return structured operational decisions.

Each decision MUST have:
- category: one of "pricing", "operations", "energy", "guest", "maintenance", "revenue"
- action: a concise action title (e.g., "Increase weekend rates by 15%")
- reasoning: 1-2 sentences explaining why
- confidence: 0-100 integer
- impact_estimate: brief estimated impact (e.g., "+£2,400/week revenue")
- auto_executable: boolean, true only for low-risk, high-confidence actions
- event_type: (optional) one of: "occupancy.threshold_crossed", "energy.waste_detected", "pricing.rate_changed", "guest.vip_arriving", "maintenance.created"
- event_payload: (optional) payload for the event

Focus on actionable insights. Prioritise by impact. Return 3-8 decisions.

Respond ONLY with valid JSON in this exact format:
{
  "decisions": [...],
  "summary": "One paragraph executive summary of the property state and key recommendations."
}`;

  const userMessage = `Property Data Snapshot (${new Date().toISOString()}):\n\n${JSON.stringify(snapshot, null, 2)}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!res.ok) {
      console.error("[AI Brain] Claude API error:", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    const textBlock = data.content?.find((c: any) => c.type === "text");
    if (!textBlock?.text) return null;

    // Extract JSON from the response (handle markdown code blocks)
    let jsonStr = textBlock.text.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const parsed: ClaudeResponse = JSON.parse(jsonStr);
    return parsed;
  } catch (err) {
    console.error("[AI Brain] Claude API call failed:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Rule-Based Fallback Analysis
// ---------------------------------------------------------------------------

function runRuleBasedAnalysis(snapshot: DataSnapshot): ClaudeResponse {
  const decisions: ClaudeDecisionRaw[] = [];
  const occ = snapshot.occupancy;
  const maint = snapshot.maintenance;
  const hk = snapshot.housekeeping;
  const energy = snapshot.energy;
  const rev = snapshot.revenue;
  const guests = snapshot.guest_alerts;

  // Rule 1: High occupancy -- recommend rate increase
  if (occ.occupancy_percent >= 85) {
    decisions.push({
      category: "pricing",
      action: `Increase rates by 12-18% (occupancy at ${occ.occupancy_percent}%)`,
      reasoning: `Occupancy is at ${occ.occupancy_percent}% which exceeds the 85% threshold. High demand justifies a rate increase to maximise revenue per available unit.`,
      confidence: 82,
      impact_estimate: "+10-15% RevPAR uplift",
      auto_executable: false,
      event_type: "occupancy.threshold_crossed",
      event_payload: {
        occupancy_percent: occ.occupancy_percent,
        direction: "above",
        threshold: 85,
      },
    });
  }

  // Rule 2: Low occupancy -- recommend rate reduction
  if (occ.occupancy_percent < 50 && occ.total > 0) {
    decisions.push({
      category: "pricing",
      action: `Reduce rates by 10-15% to stimulate bookings (occupancy at ${occ.occupancy_percent}%)`,
      reasoning: `Occupancy is below 50% at ${occ.occupancy_percent}%. A rate reduction combined with OTA channel push could help fill vacant units.`,
      confidence: 75,
      impact_estimate: "+5-10 additional bookings/week",
      auto_executable: false,
      event_type: "occupancy.threshold_crossed",
      event_payload: {
        occupancy_percent: occ.occupancy_percent,
        direction: "below",
        threshold: 50,
      },
    });
  }

  // Rule 3: Energy waste in vacant units
  if (energy.vacant_units > 3 && energy.estimated_daily_waste > 20) {
    decisions.push({
      category: "energy",
      action: `Set ${energy.vacant_units} vacant units to HVAC standby mode`,
      reasoning: `${energy.vacant_units} vacant units have estimated daily energy waste of \u00a3${energy.estimated_daily_waste.toFixed(0)}. Switching to standby mode would reduce unnecessary energy consumption.`,
      confidence: 90,
      impact_estimate: `Save ~\u00a3${(energy.estimated_daily_waste * 0.7).toFixed(0)}/day`,
      auto_executable: true,
      event_type: "energy.waste_detected",
      event_payload: {
        vacant_units_with_hvac: energy.vacant_units,
        estimated_daily_cost: energy.estimated_daily_waste,
      },
    });
  }

  // Rule 4: Urgent maintenance in occupied units
  if (maint.urgent > 0) {
    decisions.push({
      category: "maintenance",
      action: `Prioritise ${maint.urgent} urgent maintenance request${maint.urgent > 1 ? "s" : ""}`,
      reasoning: `There ${maint.urgent === 1 ? "is" : "are"} ${maint.urgent} urgent/emergency maintenance request${maint.urgent > 1 ? "s" : ""} that may impact guest experience. Immediate attention is recommended.`,
      confidence: 95,
      impact_estimate: "Prevent guest complaints and potential refunds",
      auto_executable: false,
    });
  }

  // Rule 5: VIP arrivals today
  if (guests.vip_arrivals.length > 0) {
    const vipNames = guests.vip_arrivals.map((v) => `${v.guest_name} (${v.loyalty_tier})`).join(", ");
    decisions.push({
      category: "guest",
      action: `Prepare VIP welcome for ${guests.vip_arrivals.length} guest${guests.vip_arrivals.length > 1 ? "s" : ""}`,
      reasoning: `VIP guests arriving today: ${vipNames}. Ensure premium welcome amenities and room preparation are completed before arrival.`,
      confidence: 88,
      impact_estimate: "Improve VIP satisfaction and loyalty retention",
      auto_executable: true,
    });
  }

  // Rule 6: Housekeeping backlog
  if (hk.pending > 5) {
    decisions.push({
      category: "operations",
      action: `Clear housekeeping backlog of ${hk.pending} pending tasks`,
      reasoning: `${hk.pending} housekeeping tasks are pending, which may delay room turnover and affect arriving guests. Consider assigning additional staff or re-prioritising the queue.`,
      confidence: 78,
      impact_estimate: "Faster room turnover, reduced guest wait times",
      auto_executable: false,
    });
  }

  // Rule 7: Apartments in cleaning status
  if (occ.cleaning > 3) {
    decisions.push({
      category: "operations",
      action: `Expedite cleaning for ${occ.cleaning} units in cleaning status`,
      reasoning: `${occ.cleaning} apartments are currently in cleaning status. If arrivals are expected, these need to be turned around quickly.`,
      confidence: 72,
      impact_estimate: "Improve check-in readiness",
      auto_executable: false,
    });
  }

  // Rule 8: Revenue performance
  if (rev.this_week > 0 && occ.occupancy_percent >= 60 && occ.occupancy_percent < 85) {
    decisions.push({
      category: "revenue",
      action: "Maintain current rate strategy -- occupancy within optimal range",
      reasoning: `Occupancy is at ${occ.occupancy_percent}% which is within the healthy 60-85% range. Current pricing strategy is performing well. Continue monitoring demand signals.`,
      confidence: 70,
      impact_estimate: "Stable revenue trajectory",
      auto_executable: false,
    });
  }

  // Rule 9: Maintenance pattern detection (many open requests)
  if (maint.open > 10) {
    const topCategory = Object.entries(maint.categories).sort((a, b) => b[1] - a[1])[0];
    decisions.push({
      category: "maintenance",
      action: `Investigate ${maint.open} open maintenance requests${topCategory ? ` (top: ${topCategory[0]} with ${topCategory[1]})` : ""}`,
      reasoning: `High number of open maintenance requests may indicate systemic issues. The most common category should be investigated for root cause.`,
      confidence: 65,
      impact_estimate: "Reduce recurring maintenance costs",
      auto_executable: false,
    });
  }

  // Generate summary
  const summaryParts: string[] = [];
  summaryParts.push(
    `Property is at ${occ.occupancy_percent}% occupancy (${occ.occupied}/${occ.total} units).`
  );
  if (snapshot.arrivals.count > 0) {
    summaryParts.push(`${snapshot.arrivals.count} arrival${snapshot.arrivals.count > 1 ? "s" : ""} expected today.`);
  }
  if (snapshot.departures.count > 0) {
    summaryParts.push(`${snapshot.departures.count} departure${snapshot.departures.count > 1 ? "s" : ""} today.`);
  }
  if (maint.urgent > 0) {
    summaryParts.push(`${maint.urgent} urgent maintenance issue${maint.urgent > 1 ? "s" : ""} require attention.`);
  }
  if (guests.vip_arrivals.length > 0) {
    summaryParts.push(`${guests.vip_arrivals.length} VIP guest${guests.vip_arrivals.length > 1 ? "s" : ""} arriving.`);
  }
  if (decisions.length === 0) {
    summaryParts.push("All systems operating within normal parameters. No immediate actions required.");
  } else {
    summaryParts.push(`Generated ${decisions.length} recommendation${decisions.length > 1 ? "s" : ""} for review.`);
  }

  return {
    decisions,
    summary: summaryParts.join(" "),
  };
}

// ---------------------------------------------------------------------------
// Run Brain Cycle
// ---------------------------------------------------------------------------

export async function runBrainCycle(supabase: SupabaseClient): Promise<BrainCycleResult> {
  const cycleTimestamp = new Date().toISOString();
  const cycleId = `cycle-${Date.now()}`;
  const mode = brainConfig.mode;

  // 1. Gather data snapshot
  const snapshot = await gatherDataSnapshot(supabase);

  // 2. Get decisions -- try Claude API first, fall back to rules
  let analysisResult = await callClaudeAPI(snapshot);
  if (!analysisResult) {
    console.log("[AI Brain] Using rule-based fallback analysis");
    analysisResult = runRuleBasedAnalysis(snapshot);
  }

  // 3. Store decisions in database and build response
  const storedDecisions: BrainDecision[] = [];

  for (const raw of analysisResult.decisions) {
    // Validate category
    const validCategories = ["pricing", "operations", "energy", "guest", "maintenance", "revenue"];
    const category = validCategories.includes(raw.category)
      ? (raw.category as BrainDecision["category"])
      : "operations";

    // In autonomous mode, auto-execute high-confidence decisions
    const shouldAutoExecute =
      mode === "autonomous" && raw.auto_executable && raw.confidence >= 75;

    const { data: inserted, error: insertErr } = await supabase
      .from("brain_decisions")
      .insert({
        cycle_id: cycleId,
        category,
        action: raw.action,
        reasoning: raw.reasoning,
        confidence: Math.max(0, Math.min(100, Math.round(raw.confidence))),
        impact_estimate: raw.impact_estimate || "",
        auto_executable: raw.auto_executable || false,
        executed: shouldAutoExecute,
        approved: shouldAutoExecute ? true : null,
        mode,
        event_type: raw.event_type || null,
        event_payload: raw.event_payload || {},
        data_snapshot: snapshot as unknown as Record<string, unknown>,
        summary: analysisResult!.summary,
      })
      .select("*")
      .single();

    if (insertErr || !inserted) {
      console.error("[AI Brain] Failed to store decision:", insertErr?.message);
      continue;
    }

    // If autonomous + auto-execute, emit the event
    if (shouldAutoExecute && raw.event_type) {
      try {
        await emitEvent(
          raw.event_type as EventType,
          "ai_brain",
          raw.event_payload || {},
          supabase
        );
      } catch (err) {
        console.error("[AI Brain] Failed to emit event on auto-execute:", err);
      }
    }

    storedDecisions.push({
      id: inserted.id,
      category,
      action: raw.action,
      reasoning: raw.reasoning,
      confidence: Math.max(0, Math.min(100, Math.round(raw.confidence))),
      impact_estimate: raw.impact_estimate || "",
      auto_executable: raw.auto_executable || false,
      executed: shouldAutoExecute,
      approved: shouldAutoExecute ? true : null,
      created_at: inserted.created_at,
      event_type: raw.event_type as EventType | undefined,
      event_payload: raw.event_payload,
    });
  }

  // 4. Update config stats
  const autoExecutedCount = storedDecisions.filter((d) => d.executed).length;
  brainConfig = {
    ...brainConfig,
    last_cycle: cycleTimestamp,
    total_cycles: brainConfig.total_cycles + 1,
    total_decisions: brainConfig.total_decisions + storedDecisions.length,
    total_executed: brainConfig.total_executed + autoExecutedCount,
  };

  return {
    cycle_id: cycleId,
    mode,
    timestamp: cycleTimestamp,
    data_snapshot: snapshot as unknown as Record<string, unknown>,
    decisions: storedDecisions,
    summary: analysisResult.summary,
  };
}

// ---------------------------------------------------------------------------
// Brain History -- loads past cycles from the database
// ---------------------------------------------------------------------------

export async function getBrainHistory(
  supabase: SupabaseClient,
  limit: number = 10
): Promise<BrainCycleResult[]> {
  // Get decisions ordered by most recent
  const { data: rows, error } = await supabase
    .from("brain_decisions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit * 10); // overfetch since multiple decisions per cycle

  if (error || !rows || rows.length === 0) return [];

  // Group by cycle_id
  const cycleMap = new Map<string, any[]>();
  for (const row of rows) {
    const key = row.cycle_id as string;
    if (!cycleMap.has(key)) cycleMap.set(key, []);
    cycleMap.get(key)!.push(row);
  }

  // Build cycle results, limited to requested count
  const cycles: BrainCycleResult[] = [];
  let count = 0;
  const entries = Array.from(cycleMap.entries());
  for (const [cycleId, cycleRows] of entries) {
    if (count >= limit) break;
    const first = cycleRows[0];
    cycles.push({
      cycle_id: cycleId,
      mode: (first.mode as "supervised" | "autonomous") || "supervised",
      timestamp: first.created_at,
      data_snapshot: (first.data_snapshot as Record<string, unknown>) || {},
      decisions: cycleRows.map((r: any) => ({
        id: r.id,
        category: r.category as BrainDecision["category"],
        action: r.action,
        reasoning: r.reasoning,
        confidence: r.confidence,
        impact_estimate: r.impact_estimate || "",
        auto_executable: r.auto_executable || false,
        executed: r.executed || false,
        approved: r.approved,
        created_at: r.created_at,
        event_type: r.event_type as EventType | undefined,
        event_payload: r.event_payload as Record<string, unknown> | undefined,
      })),
      summary: (first.summary as string) || "",
    });
    count++;
  }

  return cycles;
}
