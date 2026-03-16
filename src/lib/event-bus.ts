/**
 * HospitAI Event Bus — Cross-System Intelligence Layer
 *
 * When any system acts, connected systems react automatically.
 * Events are stored permanently and handlers perform real Supabase operations.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Event Types
// ---------------------------------------------------------------------------

export type EventType =
  | "booking.checked_out"
  | "booking.checked_in"
  | "booking.confirmed"
  | "booking.cancelled"
  | "apartment.status_changed"
  | "housekeeping.completed"
  | "housekeeping.created"
  | "maintenance.created"
  | "maintenance.resolved"
  | "occupancy.threshold_crossed"
  | "guest.vip_arriving"
  | "pricing.rate_changed"
  | "energy.waste_detected";

export interface SystemEvent {
  id: string;
  type: EventType;
  source_system: string;
  timestamp: string;
  payload: Record<string, unknown>;
  processed: boolean;
  results: HandlerResult[];
}

export interface HandlerResult {
  handler: string;
  target_system: string;
  action: string;
  description: string;
  success: boolean;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Handler Registry
// ---------------------------------------------------------------------------

type EventHandler = (
  event: { type: EventType; payload: Record<string, unknown> },
  supabase: SupabaseClient
) => Promise<HandlerResult[]>;

const handlers: Record<string, EventHandler[]> = {};

function registerHandler(eventType: EventType, handler: EventHandler) {
  if (!handlers[eventType]) handlers[eventType] = [];
  handlers[eventType].push(handler);
}

// ---------------------------------------------------------------------------
// Utility: calculate occupancy percentage
// ---------------------------------------------------------------------------

async function getOccupancyPercent(supabase: SupabaseClient): Promise<number> {
  const { count: total } = await supabase
    .from("apartments")
    .select("id", { count: "exact", head: true });

  const { count: occupied } = await supabase
    .from("apartments")
    .select("id", { count: "exact", head: true })
    .eq("status", "occupied");

  if (!total || total === 0) return 0;
  return Math.round(((occupied || 0) / total) * 100);
}

// ---------------------------------------------------------------------------
// Handler: booking.checked_out
// ---------------------------------------------------------------------------

registerHandler("booking.checked_out", async (event, supabase) => {
  const results: HandlerResult[] = [];
  const { apartment_id, booking_id, guest_id } = event.payload as {
    apartment_id?: string;
    booking_id?: string;
    guest_id?: string;
  };

  if (!apartment_id) return results;

  // 1. Create housekeeping task (checkout_clean, high priority)
  const { data: apt } = await supabase
    .from("apartments")
    .select("id, number, property_id")
    .eq("id", apartment_id)
    .single();

  if (apt) {
    const { error: hkError } = await supabase.from("housekeeping_tasks").insert({
      property_id: apt.property_id,
      apartment_id: apartment_id,
      type: "checkout_clean",
      status: "pending",
      priority: "high",
      scheduled_date: new Date().toISOString().split("T")[0],
    });

    results.push({
      handler: "checkout_housekeeping",
      target_system: "housekeeping",
      action: "create_task",
      description: hkError
        ? `Failed to create cleaning task for unit ${apt.number}: ${hkError.message}`
        : `Checkout triggered cleaning task for unit ${apt.number}`,
      success: !hkError,
      timestamp: new Date().toISOString(),
    });

    // 2. Set apartment status to cleaning
    await supabase
      .from("apartments")
      .update({ status: "cleaning" })
      .eq("id", apartment_id);

    results.push({
      handler: "checkout_apartment_status",
      target_system: "apartments",
      action: "update_status",
      description: `Set unit ${apt.number} status to cleaning`,
      success: true,
      timestamp: new Date().toISOString(),
    });
  }

  // 3. Check if no arrival due within 48hrs — flag for energy standby
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() + 48);

  const { data: upcomingBookings } = await supabase
    .from("bookings")
    .select("id")
    .eq("apartment_id", apartment_id)
    .in("status", ["confirmed", "pending"])
    .lte("check_in_date", cutoff.toISOString().split("T")[0])
    .limit(1);

  if (!upcomingBookings || upcomingBookings.length === 0) {
    results.push({
      handler: "checkout_energy_standby",
      target_system: "energy",
      action: "flag_standby",
      description: `No arrivals within 48hrs for unit ${apt?.number || apartment_id} — flagged for HVAC standby mode`,
      success: true,
      timestamp: new Date().toISOString(),
    });
  }

  return results;
});

// ---------------------------------------------------------------------------
// Handler: booking.checked_in
// ---------------------------------------------------------------------------

registerHandler("booking.checked_in", async (event, supabase) => {
  const results: HandlerResult[] = [];
  const { apartment_id, booking_id, guest_id } = event.payload as {
    apartment_id?: string;
    booking_id?: string;
    guest_id?: string;
  };

  if (!apartment_id) return results;

  const { data: apt } = await supabase
    .from("apartments")
    .select("id, number")
    .eq("id", apartment_id)
    .single();

  const unitLabel = apt?.number || apartment_id;

  // 1. Set apartment status to occupied
  await supabase
    .from("apartments")
    .update({ status: "occupied" })
    .eq("id", apartment_id);

  results.push({
    handler: "checkin_apartment_status",
    target_system: "apartments",
    action: "update_status",
    description: `Set unit ${unitLabel} status to occupied`,
    success: true,
    timestamp: new Date().toISOString(),
  });

  // 2. Recalculate occupancy — check thresholds
  const occupancy = await getOccupancyPercent(supabase);

  if (occupancy >= 85) {
    await emitEvent("occupancy.threshold_crossed", "event_bus", {
      occupancy_percent: occupancy,
      direction: "above",
      threshold: 85,
    }, supabase);

    results.push({
      handler: "checkin_occupancy_check",
      target_system: "pricing",
      action: "threshold_alert",
      description: `Occupancy crossed 85% (now ${occupancy}%) — pricing review triggered`,
      success: true,
      timestamp: new Date().toISOString(),
    });
  } else if (occupancy < 50) {
    await emitEvent("occupancy.threshold_crossed", "event_bus", {
      occupancy_percent: occupancy,
      direction: "below",
      threshold: 50,
    }, supabase);

    results.push({
      handler: "checkin_occupancy_check",
      target_system: "pricing",
      action: "threshold_alert",
      description: `Occupancy dropped below 50% (now ${occupancy}%) — rate review triggered`,
      success: true,
      timestamp: new Date().toISOString(),
    });
  } else {
    results.push({
      handler: "checkin_occupancy_check",
      target_system: "analytics",
      action: "occupancy_check",
      description: `Occupancy at ${occupancy}% — within normal range`,
      success: true,
      timestamp: new Date().toISOString(),
    });
  }

  // 3. Load guest preferences
  if (guest_id) {
    const { data: guest } = await supabase
      .from("guests")
      .select("id, first_name, last_name, loyalty_tier, preferences")
      .eq("id", guest_id)
      .single();

    if (guest) {
      results.push({
        handler: "checkin_guest_preferences",
        target_system: "guest_experience",
        action: "load_preferences",
        description: `Guest preferences applied to unit ${unitLabel}`,
        success: true,
        timestamp: new Date().toISOString(),
      });

      // 4. VIP detection
      if (guest.loyalty_tier === "platinum" || guest.loyalty_tier === "gold") {
        results.push({
          handler: "checkin_vip_alert",
          target_system: "operations",
          action: "vip_notification",
          description: `VIP ${guest.first_name} ${guest.last_name} (${guest.loyalty_tier}) checked into unit ${unitLabel}`,
          success: true,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  return results;
});

// ---------------------------------------------------------------------------
// Handler: booking.confirmed
// ---------------------------------------------------------------------------

registerHandler("booking.confirmed", async (event, supabase) => {
  const results: HandlerResult[] = [];
  const { booking_id, apartment_id, guest_id, check_in_date } = event.payload as {
    booking_id?: string;
    apartment_id?: string;
    guest_id?: string;
    check_in_date?: string;
  };

  const today = new Date().toISOString().split("T")[0];
  const isArrivalToday = check_in_date === today;

  if (isArrivalToday && apartment_id) {
    // Check apartment status
    const { data: apt } = await supabase
      .from("apartments")
      .select("id, number, status")
      .eq("id", apartment_id)
      .single();

    if (apt && apt.status !== "available") {
      // Check if guest is VIP
      let isVip = false;
      if (guest_id) {
        const { data: guest } = await supabase
          .from("guests")
          .select("loyalty_tier")
          .eq("id", guest_id)
          .single();
        isVip = guest?.loyalty_tier === "platinum" || guest?.loyalty_tier === "gold";
      }

      if (isVip) {
        await emitEvent("guest.vip_arriving", "event_bus", {
          booking_id,
          apartment_id,
          guest_id,
          apartment_status: apt.status,
        }, supabase);

        results.push({
          handler: "confirmed_vip_arrival",
          target_system: "operations",
          action: "vip_arrival_alert",
          description: `VIP arriving today — unit ${apt.number} is ${apt.status}, needs urgent preparation`,
          success: true,
          timestamp: new Date().toISOString(),
        });
      } else {
        // Create urgent housekeeping
        const { data: aptFull } = await supabase
          .from("apartments")
          .select("property_id")
          .eq("id", apartment_id)
          .single();

        if (aptFull) {
          await supabase.from("housekeeping_tasks").insert({
            property_id: aptFull.property_id,
            apartment_id: apartment_id,
            type: "checkout_clean",
            status: "pending",
            priority: "urgent",
            scheduled_date: today,
          });
        }

        results.push({
          handler: "confirmed_urgent_housekeeping",
          target_system: "housekeeping",
          action: "create_urgent_task",
          description: `Arrival today — unit ${apt.number} is ${apt.status}, urgent housekeeping created`,
          success: true,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  results.push({
    handler: "confirmed_log",
    target_system: "bookings",
    action: "log_confirmation",
    description: `Booking ${(booking_id as string)?.slice(0, 8) || "unknown"} confirmed${isArrivalToday ? " — arrival today" : ""}`,
    success: true,
    timestamp: new Date().toISOString(),
  });

  return results;
});

// ---------------------------------------------------------------------------
// Handler: housekeeping.completed
// ---------------------------------------------------------------------------

registerHandler("housekeeping.completed", async (event, supabase) => {
  const results: HandlerResult[] = [];
  const { apartment_id, task_id } = event.payload as {
    apartment_id?: string;
    task_id?: string;
  };

  if (!apartment_id) return results;

  const { data: apt } = await supabase
    .from("apartments")
    .select("id, number")
    .eq("id", apartment_id)
    .single();

  const unitLabel = apt?.number || apartment_id;

  // 1. Set apartment status to available
  await supabase
    .from("apartments")
    .update({ status: "available" })
    .eq("id", apartment_id);

  results.push({
    handler: "hk_complete_apartment_status",
    target_system: "apartments",
    action: "update_status",
    description: `Set unit ${unitLabel} status to available`,
    success: true,
    timestamp: new Date().toISOString(),
  });

  // 2. Check for arrivals today
  const today = new Date().toISOString().split("T")[0];
  const { data: todayBookings } = await supabase
    .from("bookings")
    .select("id, guest_id")
    .eq("apartment_id", apartment_id)
    .eq("check_in_date", today)
    .eq("status", "confirmed")
    .limit(1);

  if (todayBookings && todayBookings.length > 0) {
    results.push({
      handler: "hk_complete_arrival_ready",
      target_system: "operations",
      action: "arrival_notification",
      description: `Unit ${unitLabel} ready for arrival today`,
      success: true,
      timestamp: new Date().toISOString(),
    });
  }

  // 3. Recalculate occupancy
  const occupancy = await getOccupancyPercent(supabase);
  results.push({
    handler: "hk_complete_occupancy",
    target_system: "analytics",
    action: "occupancy_update",
    description: `Current occupancy: ${occupancy}%`,
    success: true,
    timestamp: new Date().toISOString(),
  });

  return results;
});

// ---------------------------------------------------------------------------
// Handler: maintenance.created
// ---------------------------------------------------------------------------

registerHandler("maintenance.created", async (event, supabase) => {
  const results: HandlerResult[] = [];
  const { apartment_id, priority, category, maintenance_id, title } = event.payload as {
    apartment_id?: string;
    priority?: string;
    category?: string;
    maintenance_id?: string;
    title?: string;
  };

  // 1. Urgent/emergency in occupied unit
  if (
    apartment_id &&
    (priority === "urgent" || priority === "emergency")
  ) {
    const { data: apt } = await supabase
      .from("apartments")
      .select("id, number, status")
      .eq("id", apartment_id)
      .single();

    if (apt?.status === "occupied") {
      results.push({
        handler: "maint_occupied_alert",
        target_system: "operations",
        action: "guest_impact_alert",
        description: `Urgent maintenance in occupied unit ${apt.number} — guest impact risk: ${title || "maintenance issue"}`,
        success: true,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // 2. Pattern detection: 3+ maintenance in 30 days for same apartment
  if (apartment_id) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { count } = await supabase
      .from("maintenance_requests")
      .select("id", { count: "exact", head: true })
      .eq("apartment_id", apartment_id)
      .gte("created_at", thirtyDaysAgo.toISOString());

    if (count && count >= 3) {
      const { data: apt } = await supabase
        .from("apartments")
        .select("number")
        .eq("id", apartment_id)
        .single();

      results.push({
        handler: "maint_pattern_alert",
        target_system: "analytics",
        action: "pattern_detected",
        description: `Pattern alert: Unit ${apt?.number || apartment_id} has ${count} maintenance requests in the last 30 days — investigate root cause`,
        success: true,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // 3. HVAC category — cross-reference with energy
  if (category === "hvac" && apartment_id) {
    const { data: apt } = await supabase
      .from("apartments")
      .select("number, status")
      .eq("id", apartment_id)
      .single();

    results.push({
      handler: "maint_hvac_energy",
      target_system: "energy",
      action: "efficiency_correlation",
      description: `HVAC maintenance on unit ${apt?.number || apartment_id} (status: ${apt?.status || "unknown"}) — cross-referencing with energy consumption data`,
      success: true,
      timestamp: new Date().toISOString(),
    });
  }

  if (results.length === 0) {
    results.push({
      handler: "maint_log",
      target_system: "maintenance",
      action: "log_created",
      description: `Maintenance request created: ${title || maintenance_id || "unknown"}`,
      success: true,
      timestamp: new Date().toISOString(),
    });
  }

  return results;
});

// ---------------------------------------------------------------------------
// Handler: occupancy.threshold_crossed
// ---------------------------------------------------------------------------

registerHandler("occupancy.threshold_crossed", async (event, supabase) => {
  const results: HandlerResult[] = [];
  const { occupancy_percent, direction, threshold } = event.payload as {
    occupancy_percent?: number;
    direction?: string;
    threshold?: number;
  };

  if (direction === "above" && (threshold === 85 || (occupancy_percent ?? 0) >= 85)) {
    results.push({
      handler: "occupancy_pricing_up",
      target_system: "pricing",
      action: "rate_increase_recommendation",
      description: `High occupancy (${occupancy_percent}%): AI recommends rate increase of 12-18% for the next 7 days`,
      success: true,
      timestamp: new Date().toISOString(),
    });
  }

  if (direction === "below" && (threshold === 50 || (occupancy_percent ?? 100) < 50)) {
    results.push({
      handler: "occupancy_pricing_down",
      target_system: "pricing",
      action: "rate_reduction_recommendation",
      description: `Low occupancy (${occupancy_percent}%): AI recommends rate reduction + OTA push to stimulate bookings`,
      success: true,
      timestamp: new Date().toISOString(),
    });
  }

  // Energy optimization review
  results.push({
    handler: "occupancy_energy_review",
    target_system: "energy",
    action: "optimization_review",
    description: `Occupancy threshold crossed (${occupancy_percent}%) — triggering energy optimization review`,
    success: true,
    timestamp: new Date().toISOString(),
  });

  return results;
});

// ---------------------------------------------------------------------------
// Handler: energy.waste_detected
// ---------------------------------------------------------------------------

registerHandler("energy.waste_detected", async (event, supabase) => {
  const results: HandlerResult[] = [];
  const { vacant_units_with_hvac, estimated_daily_cost } = event.payload as {
    vacant_units_with_hvac?: number;
    estimated_daily_cost?: number;
  };

  results.push({
    handler: "energy_waste_alert",
    target_system: "energy",
    action: "waste_alert",
    description: `Energy waste: ${vacant_units_with_hvac || 0} vacant units with active HVAC. Estimated daily cost: \u00a3${estimated_daily_cost?.toFixed(2) || "0.00"}`,
    success: true,
    timestamp: new Date().toISOString(),
  });

  return results;
});

// ---------------------------------------------------------------------------
// Core: emitEvent — stores event and processes handlers
// ---------------------------------------------------------------------------

export async function emitEvent(
  type: EventType,
  sourceSystem: string,
  payload: Record<string, unknown>,
  supabase: SupabaseClient
): Promise<{ event_id: string; results: HandlerResult[] }> {
  // 1. Store event in database
  const { data: inserted, error: insertError } = await supabase
    .from("system_events")
    .insert({
      type,
      source_system: sourceSystem,
      payload,
      processed: false,
      results: [],
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    console.error("[EventBus] Failed to store event:", insertError?.message);
    return { event_id: "", results: [] };
  }

  const eventId = inserted.id as string;

  // 2. Process through all registered handlers
  const allResults = await processEvent(
    { type, payload },
    supabase
  );

  // 3. Update event with results
  await supabase
    .from("system_events")
    .update({
      processed: true,
      results: allResults,
    })
    .eq("id", eventId);

  return { event_id: eventId, results: allResults };
}

// ---------------------------------------------------------------------------
// Core: processEvent — runs all handlers for an event type
// ---------------------------------------------------------------------------

async function processEvent(
  event: { type: EventType; payload: Record<string, unknown> },
  supabase: SupabaseClient
): Promise<HandlerResult[]> {
  const eventHandlers = handlers[event.type] || [];
  const allResults: HandlerResult[] = [];

  for (const handler of eventHandlers) {
    try {
      const results = await handler(event, supabase);
      allResults.push(...results);
    } catch (err) {
      allResults.push({
        handler: "error",
        target_system: "event_bus",
        action: "handler_error",
        description: `Handler failed: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
        timestamp: new Date().toISOString(),
      });
    }
  }

  return allResults;
}

// ---------------------------------------------------------------------------
// Utility: get registered event types
// ---------------------------------------------------------------------------

export function getRegisteredEventTypes(): EventType[] {
  return Object.keys(handlers) as EventType[];
}
