/**
 * HospitAI Chat Intelligence
 *
 * Uses Claude API with live property data for intelligent, natural responses.
 * Falls back to rule-based intent matching if no API key.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { format, addDays, subDays } from "date-fns";

export interface ChatMessage {
  role: "user" | "ai";
  content: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

interface QueryIntent {
  category: "occupancy" | "revenue" | "bookings" | "guests" | "maintenance" | "housekeeping" | "pricing" | "energy" | "general";
  timeframe?: "today" | "tomorrow" | "week" | "month";
  action: string;
}

/**
 * Parse user message into a query intent.
 */
function parseIntent(message: string): QueryIntent {
  const msg = message.toLowerCase();

  // Full status update / summary / overview
  if (msg.match(/status update|full status|overview|summary|what.*going on|how.*everything|brief me|update me|report/)) {
    return { category: "general", action: "status_update" };
  }

  // Occupancy
  if (msg.match(/occupan|how full|how busy|availability|vacant|empty/)) {
    const tf = getTimeframe(msg);
    return { category: "occupancy", timeframe: tf, action: "check_occupancy" };
  }

  // Revenue
  if (msg.match(/revenue|income|earn|money|profit|how much.*made/)) {
    const tf = getTimeframe(msg);
    return { category: "revenue", timeframe: tf, action: "check_revenue" };
  }

  // Pricing
  if (msg.match(/rate|price|pricing|cost|how much.*charge|best rate|suggest.*rate/)) {
    return { category: "pricing", timeframe: getTimeframe(msg), action: "check_pricing" };
  }

  // Bookings / arrivals / departures
  if (msg.match(/arrival|check.?in|coming|arriving|who.*coming/)) {
    const tf = getTimeframe(msg) || "today";
    return { category: "bookings", timeframe: tf, action: "check_arrivals" };
  }
  if (msg.match(/departure|check.?out|leaving|departing/)) {
    const tf = getTimeframe(msg) || "today";
    return { category: "bookings", timeframe: tf, action: "check_departures" };
  }
  if (msg.match(/booking|reservation/)) {
    return { category: "bookings", timeframe: getTimeframe(msg), action: "check_bookings" };
  }

  // Guests
  if (msg.match(/vip|loyal|platinum|gold|important.*guest|guest/)) {
    return { category: "guests", action: "check_guests" };
  }

  // Maintenance
  if (msg.match(/maintenan|repair|broken|fix|issue|problem/)) {
    return { category: "maintenance", action: "check_maintenance" };
  }

  // Housekeeping
  if (msg.match(/clean|housekeep|dirty|room.*status|ready/)) {
    return { category: "housekeeping", action: "check_housekeeping" };
  }

  // Energy
  if (msg.match(/energy|power|electric|hvac|consumption|saving/)) {
    return { category: "energy", action: "check_energy" };
  }

  return { category: "general", action: "general_help" };
}

function getTimeframe(msg: string): "today" | "tomorrow" | "week" | "month" {
  if (msg.includes("tomorrow") || msg.includes("tmrw")) return "tomorrow";
  if (msg.match(/week|7 day|next 7/)) return "week";
  if (msg.match(/month|30 day/)) return "month";
  return "today";
}

/**
 * Gather a live data snapshot for Claude context.
 */
async function gatherPropertyContext(supabase: SupabaseClient): Promise<string> {
  const today = format(new Date(), "yyyy-MM-dd");
  const tomorrow = format(addDays(new Date(), 1), "yyyy-MM-dd");

  try {
    const [
      { data: apartments },
      { data: bookingsToday },
      { data: arrivalsToday },
      { data: departuresToday },
      { data: arrivalsTomorrow },
      { data: maintenance },
      { data: housekeeping },
      { data: types },
      { data: recentGuests },
    ] = await Promise.all([
      supabase.from("apartments").select("id, number, status, floor"),
      supabase.from("bookings").select("id, reference, status, check_in, check_out, total_amount_gbp, nights, guest_name, special_requests, apartment:apartments(number)").eq("status", "checked_in").lte("check_in", today).gt("check_out", today),
      supabase.from("bookings").select("id, reference, check_in, nights, guest_name, special_requests, apartment:apartments(number), guest:guests(first_name, last_name, loyalty_tier, vip_status)").in("status", ["confirmed", "checked_in"]).eq("check_in", today),
      supabase.from("bookings").select("id, guest_name, apartment:apartments(number)").in("status", ["checked_in", "checked_out"]).eq("check_out", today),
      supabase.from("bookings").select("id, guest_name, apartment:apartments(number), guest:guests(first_name, last_name, loyalty_tier, vip_status)").in("status", ["confirmed"]).eq("check_in", tomorrow),
      supabase.from("maintenance_requests").select("id, title, priority, status, category").in("status", ["open", "assigned", "in_progress"]).order("priority", { ascending: true }).limit(15),
      supabase.from("housekeeping_tasks").select("id, status, type, apartment:apartments(number)").eq("scheduled_date", today),
      supabase.from("apartment_types").select("name, base_rate_gbp"),
      supabase.from("guests").select("first_name, last_name, loyalty_tier, total_spend_gbp, vip_status").or("vip_status.eq.true,loyalty_tier.eq.platinum,loyalty_tier.eq.gold").order("total_spend_gbp", { ascending: false }).limit(10),
    ]);

    const total = apartments?.length || 0;
    const occupied = apartments?.filter((a) => a.status === "occupied").length || 0;
    const available = apartments?.filter((a) => a.status === "available").length || 0;
    const cleaning = apartments?.filter((a) => a.status === "cleaning").length || 0;
    const maint = apartments?.filter((a) => a.status === "maintenance").length || 0;
    const occPct = total > 0 ? Math.round((occupied / total) * 100) : 0;

    const dailyRev = (bookingsToday || []).reduce((s, b) => s + (b.nights > 0 ? b.total_amount_gbp / b.nights : 0), 0);

    const hkPending = housekeeping?.filter((t) => t.status === "pending" || t.status === "assigned").length || 0;
    const hkInProgress = housekeeping?.filter((t) => t.status === "in_progress").length || 0;
    const hkCompleted = housekeeping?.filter((t) => t.status === "completed" || t.status === "verified").length || 0;

    const urgentMaint = maintenance?.filter((r) => r.priority === "urgent" || r.priority === "emergency") || [];

    return JSON.stringify({
      date: today,
      occupancy: { total, occupied, available, cleaning, maintenance: maint, percent: occPct },
      revenue: { today: Math.round(dailyRev), active_bookings: bookingsToday?.length || 0 },
      arrivals: { today: arrivalsToday?.length || 0, tomorrow: arrivalsTomorrow?.length || 0, today_details: arrivalsToday?.slice(0, 10) },
      departures: { today: departuresToday?.length || 0, details: departuresToday?.slice(0, 10) },
      housekeeping: { pending: hkPending, in_progress: hkInProgress, completed: hkCompleted },
      maintenance: { open: maintenance?.length || 0, urgent: urgentMaint.length, details: maintenance?.slice(0, 10) },
      rates: types || [],
      vip_guests: recentGuests?.slice(0, 5) || [],
    }, null, 1);
  } catch {
    return "{}";
  }
}

/**
 * Call Claude API for intelligent chat response.
 */
async function callClaudeChat(message: string, context: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const systemPrompt = `You are HospitAI Assistant — the AI operations assistant for a serviced apartment property. You have access to live property data provided below.

Rules:
- Answer questions conversationally but concisely
- Always use the REAL data provided — never make up numbers
- Use markdown formatting (bold, bullets) for readability
- Include specific numbers and names from the data
- If the data doesn't contain what's needed, say so honestly
- Give actionable recommendations when relevant
- Be professional but warm — you're a GM's right-hand AI
- Use £ for currency
- Keep responses focused — don't dump all data unless asked for a full overview
- When suggesting actions, be specific (e.g., "increase studio rates from £45 to £52" not just "increase rates")`;

  const userMessage = `Live Property Data:\n${context}\n\nUser Question: ${message}`;

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
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!res.ok) {
      console.error("[AI Chat] Claude API error:", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    const textBlock = data.content?.find((c: { type: string }) => c.type === "text");
    return textBlock?.text || null;
  } catch (err) {
    console.error("[AI Chat] Claude API call failed:", err);
    return null;
  }
}

/**
 * Process a chat message and return an AI response with live data.
 */
export async function processChat(
  message: string,
  supabase: SupabaseClient
): Promise<ChatMessage> {
  // Try Claude-powered response first
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    try {
      const context = await gatherPropertyContext(supabase);
      const claudeResponse = await callClaudeChat(message, context);
      if (claudeResponse) {
        return reply(claudeResponse);
      }
    } catch (err) {
      console.error("[AI Chat] Claude chat failed, falling back to rule-based:", err);
    }
  }

  // Fallback to rule-based responses
  const intent = parseIntent(message);
  const today = format(new Date(), "yyyy-MM-dd");
  const tomorrow = format(addDays(new Date(), 1), "yyyy-MM-dd");

  try {
    switch (intent.action) {
      case "check_occupancy": {
        const { data: apartments } = await supabase
          .from("apartments")
          .select("id, status");
        const total = apartments?.length || 0;
        const occupied = apartments?.filter((a) => a.status === "occupied").length || 0;
        const available = apartments?.filter((a) => a.status === "available").length || 0;
        const cleaning = apartments?.filter((a) => a.status === "cleaning").length || 0;
        const maintenance = apartments?.filter((a) => a.status === "maintenance").length || 0;
        const occ = total > 0 ? Math.round((occupied / total) * 100) : 0;

        return reply(
          `**Current occupancy: ${occ}%**\n\n` +
          `- ${occupied} occupied\n` +
          `- ${available} available\n` +
          `- ${cleaning} being cleaned\n` +
          `- ${maintenance} in maintenance\n` +
          `- ${total} total units\n\n` +
          (occ > 85
            ? "💡 High occupancy — AI recommends increasing rates by 12-18% for the next 7 days."
            : occ < 50
            ? "💡 Low occupancy — consider a 10-15% rate reduction or push flash deals to OTAs."
            : "Occupancy is within normal range."),
          { occupancy: occ, occupied, available, total }
        );
      }

      case "check_revenue": {
        const { data: bookings } = await supabase
          .from("bookings")
          .select("total_amount_gbp, nights, status")
          .eq("status", "checked_in")
          .lte("check_in", today)
          .gt("check_out", today);

        const dailyRevenue = (bookings || []).reduce((sum, b) => {
          return sum + (b.nights > 0 ? b.total_amount_gbp / b.nights : 0);
        }, 0);

        const totalActiveRevenue = (bookings || []).reduce(
          (sum, b) => sum + b.total_amount_gbp,
          0
        );

        return reply(
          `**Revenue today: £${Math.round(dailyRevenue).toLocaleString()}**\n\n` +
          `- ${bookings?.length || 0} active bookings generating revenue\n` +
          `- Total active booking value: £${Math.round(totalActiveRevenue).toLocaleString()}\n\n` +
          (dailyRevenue > 0
            ? `Average daily rate per booking: £${Math.round(dailyRevenue / (bookings?.length || 1)).toLocaleString()}`
            : "No active revenue today."),
          { daily_revenue: Math.round(dailyRevenue), active_bookings: bookings?.length || 0 }
        );
      }

      case "check_arrivals": {
        const targetDate = intent.timeframe === "tomorrow" ? tomorrow : today;
        const label = intent.timeframe === "tomorrow" ? "Tomorrow" : "Today";

        const { data: arrivals } = await supabase
          .from("bookings")
          .select(`
            id, reference, check_in, nights, special_requests,
            guest:guests(first_name, last_name, loyalty_tier, vip_status),
            apartment:apartments(number)
          `)
          .in("status", ["confirmed", "checked_in"])
          .eq("check_in", targetDate)
          .order("created_at", { ascending: true });

        if (!arrivals || arrivals.length === 0) {
          return reply(`No arrivals scheduled for ${label.toLowerCase()}.`);
        }

        const vips = arrivals.filter(
          (a: Record<string, unknown>) => {
            const guest = a.guest as Record<string, unknown> | null;
            return guest?.vip_status === true || guest?.loyalty_tier === "platinum" || guest?.loyalty_tier === "gold";
          }
        );

        let response = `**${label}'s arrivals: ${arrivals.length} guest${arrivals.length > 1 ? "s" : ""}**\n\n`;

        if (vips.length > 0) {
          response += `⭐ **${vips.length} VIP/loyalty guest${vips.length > 1 ? "s" : ""}** — ensure rooms are pre-checked.\n\n`;
        }

        arrivals.slice(0, 8).forEach((a: Record<string, unknown>) => {
          const guest = a.guest as Record<string, unknown> | null;
          const apt = a.apartment as Record<string, unknown> | null;
          const name = guest ? `${guest.first_name} ${guest.last_name}` : "Unknown";
          const tier = guest?.loyalty_tier ? ` (${guest.loyalty_tier})` : "";
          const unit = apt?.number || "TBA";
          response += `- **${name}**${tier} → Unit ${unit}, ${a.nights} nights\n`;
        });

        if (arrivals.length > 8) {
          response += `\n...and ${arrivals.length - 8} more.`;
        }

        return reply(response, { count: arrivals.length, vips: vips.length });
      }

      case "check_departures": {
        const targetDate = intent.timeframe === "tomorrow" ? tomorrow : today;
        const label = intent.timeframe === "tomorrow" ? "Tomorrow" : "Today";

        const { data: departures } = await supabase
          .from("bookings")
          .select(`
            id, reference, check_out,
            guest:guests(first_name, last_name),
            apartment:apartments(number)
          `)
          .in("status", ["checked_in", "checked_out"])
          .eq("check_out", targetDate);

        if (!departures || departures.length === 0) {
          return reply(`No departures scheduled for ${label.toLowerCase()}.`);
        }

        let response = `**${label}'s departures: ${departures.length}**\n\n`;
        response += `${departures.length} room${departures.length > 1 ? "s" : ""} will need cleaning after checkout.\n\n`;

        departures.slice(0, 8).forEach((d: Record<string, unknown>) => {
          const guest = d.guest as Record<string, unknown> | null;
          const apt = d.apartment as Record<string, unknown> | null;
          const name = guest ? `${guest.first_name} ${guest.last_name}` : "Unknown";
          response += `- ${name} — Unit ${apt?.number || "?"}\n`;
        });

        return reply(response, { count: departures.length });
      }

      case "check_bookings": {
        const { count: total } = await supabase
          .from("bookings")
          .select("id", { count: "exact", head: true });
        const { count: confirmed } = await supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("status", "confirmed");
        const { count: checkedIn } = await supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("status", "checked_in");
        const { count: pending } = await supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending");

        return reply(
          `**Booking overview:**\n\n` +
          `- ${total || 0} total bookings\n` +
          `- ${checkedIn || 0} currently checked in\n` +
          `- ${confirmed || 0} confirmed (upcoming)\n` +
          `- ${pending || 0} pending confirmation`,
          { total, confirmed, checked_in: checkedIn, pending }
        );
      }

      case "check_guests": {
        const { data: vips } = await supabase
          .from("guests")
          .select("first_name, last_name, loyalty_tier, total_spend_gbp, vip_status")
          .or("vip_status.eq.true,loyalty_tier.eq.platinum,loyalty_tier.eq.gold")
          .order("total_spend_gbp", { ascending: false })
          .limit(10);

        if (!vips || vips.length === 0) {
          return reply("No VIP or high-loyalty guests found in the system yet.");
        }

        let response = `**Top guests:**\n\n`;
        vips.forEach((g) => {
          const vipTag = g.vip_status ? " ⭐ VIP" : "";
          response += `- **${g.first_name} ${g.last_name}** — ${g.loyalty_tier}${vipTag}, £${Math.round(g.total_spend_gbp).toLocaleString()} lifetime spend\n`;
        });

        return reply(response, { count: vips.length });
      }

      case "check_maintenance": {
        const { data: requests } = await supabase
          .from("maintenance_requests")
          .select("id, title, priority, status, category")
          .in("status", ["open", "assigned", "in_progress"])
          .order("priority", { ascending: true });

        if (!requests || requests.length === 0) {
          return reply("✅ No open maintenance requests. All clear.");
        }

        const urgent = requests.filter((r) => r.priority === "urgent" || r.priority === "emergency");

        let response = `**${requests.length} open maintenance request${requests.length > 1 ? "s" : ""}**`;
        if (urgent.length > 0) {
          response += ` — ⚠️ **${urgent.length} urgent**`;
        }
        response += "\n\n";

        requests.slice(0, 8).forEach((r) => {
          const icon = r.priority === "urgent" || r.priority === "emergency" ? "🔴" : r.priority === "high" ? "🟡" : "⚪";
          response += `${icon} **${r.title}** — ${r.category}, ${r.status}\n`;
        });

        if (requests.length > 8) {
          response += `\n...and ${requests.length - 8} more.`;
        }

        return reply(response, { total: requests.length, urgent: urgent.length });
      }

      case "check_housekeeping": {
        const { data: tasks } = await supabase
          .from("housekeeping_tasks")
          .select("id, status, type, apartment:apartments(number)")
          .eq("scheduled_date", today);

        const pending = tasks?.filter((t) => t.status === "pending" || t.status === "assigned") || [];
        const inProgress = tasks?.filter((t) => t.status === "in_progress") || [];
        const completed = tasks?.filter((t) => t.status === "completed" || t.status === "verified") || [];

        return reply(
          `**Housekeeping today:**\n\n` +
          `- 🔴 ${pending.length} rooms need cleaning\n` +
          `- 🟡 ${inProgress.length} in progress\n` +
          `- ✅ ${completed.length} completed\n\n` +
          (pending.length > 5
            ? "💡 Backlog is high — AI recommends prioritising rooms with arrivals due."
            : pending.length === 0
            ? "All rooms are clean. Well done team!"
            : "On track for today."),
          { pending: pending.length, in_progress: inProgress.length, completed: completed.length }
        );
      }

      case "check_pricing": {
        const { data: types } = await supabase
          .from("apartment_types")
          .select("name, base_rate_gbp");
        const { data: apartments } = await supabase
          .from("apartments")
          .select("status");

        const total = apartments?.length || 1;
        const occupied = apartments?.filter((a) => a.status === "occupied").length || 0;
        const occ = Math.round((occupied / total) * 100);

        let response = `**Current rates & AI recommendations:**\n\nOccupancy: ${occ}%\n\n`;

        (types || []).forEach((t) => {
          const mult = occ >= 85 ? 1.15 : occ >= 70 ? 1.05 : occ >= 50 ? 1.0 : 0.9;
          const suggested = Math.round(t.base_rate_gbp * mult);
          const diff = suggested - t.base_rate_gbp;
          const arrow = diff > 0 ? "↑" : diff < 0 ? "↓" : "→";
          response += `**${t.name}**: £${t.base_rate_gbp}/night → AI suggests £${suggested}/night ${arrow}\n`;
        });

        response += occ >= 85
          ? "\n💡 High demand — increase rates to maximise yield."
          : occ < 50
          ? "\n💡 Low demand — consider discounting to stimulate bookings."
          : "\n Rates are well-positioned for current demand.";

        return reply(response, { occupancy: occ });
      }

      case "check_energy": {
        const { data: apartments } = await supabase
          .from("apartments")
          .select("status");
        const total = apartments?.length || 0;
        const empty = apartments?.filter((a) => a.status === "available").length || 0;
        const emptyPct = total > 0 ? Math.round((empty / total) * 100) : 0;
        const savingsDay = Math.round(empty * 1.8);
        const savingsMonth = savingsDay * 30;

        return reply(
          `**Energy overview:**\n\n` +
          `- ${empty} of ${total} units currently vacant (${emptyPct}%)\n` +
          `- Vacant unit HVAC should be in standby mode\n` +
          `- Estimated daily savings potential: £${savingsDay}\n` +
          `- Estimated monthly savings: £${savingsMonth.toLocaleString()}\n\n` +
          (emptyPct > 40
            ? "💡 Significant vacancy — ensure all empty units have HVAC, lighting, and water heating in standby."
            : "Energy systems should be running efficiently at current occupancy."),
          { vacant_units: empty, savings_potential_monthly: savingsMonth }
        );
      }

      case "status_update": {
        const { data: apts } = await supabase.from("apartments").select("status");
        const total = apts?.length || 0;
        const occ = apts?.filter((a) => a.status === "occupied").length || 0;
        const avail = apts?.filter((a) => a.status === "available").length || 0;
        const clean = apts?.filter((a) => a.status === "cleaning").length || 0;
        const maint = apts?.filter((a) => a.status === "maintenance").length || 0;
        const occPct = total > 0 ? Math.round((occ / total) * 100) : 0;

        const { count: openMaint } = await supabase.from("maintenance_requests").select("id", { count: "exact", head: true }).in("status", ["open", "assigned", "in_progress"]);
        const { count: urgentMaint } = await supabase.from("maintenance_requests").select("id", { count: "exact", head: true }).in("priority", ["urgent", "emergency"]);
        const { count: pendingHk } = await supabase.from("housekeeping_tasks").select("id", { count: "exact", head: true }).eq("status", "pending");
        const { count: arrivalsToday } = await supabase.from("bookings").select("id", { count: "exact", head: true }).in("status", ["confirmed"]).eq("check_in", today);
        const { count: departuresToday } = await supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", "checked_in").eq("check_out", today);

        const { data: rev } = await supabase.from("bookings").select("total_amount_gbp, nights").eq("status", "checked_in").lte("check_in", today).gt("check_out", today);
        const dailyRev = (rev || []).reduce((s, b) => s + (b.nights > 0 ? b.total_amount_gbp / b.nights : 0), 0);

        return reply(
          `**HospitAI Status Update**\n\n` +
          `**Occupancy: ${occPct}%** (${occ} of ${total} units)\n` +
          `- ${avail} available, ${clean} cleaning, ${maint} in maintenance\n\n` +
          `**Revenue today: £${Math.round(dailyRev).toLocaleString()}**\n\n` +
          `**Operations:**\n` +
          `- ${arrivalsToday || 0} arrivals today\n` +
          `- ${departuresToday || 0} departures today\n` +
          `- ${pendingHk || 0} rooms need cleaning\n` +
          `- ${openMaint || 0} open maintenance requests${urgentMaint ? ` (${urgentMaint} urgent)` : ""}\n\n` +
          (occPct > 85 ? "💡 High occupancy — consider rate increase.\n" :
           occPct < 50 ? "💡 Low occupancy — consider promotions.\n" : "") +
          ((urgentMaint || 0) > 0 ? "⚠️ Urgent maintenance needs immediate attention.\n" : "") +
          ((pendingHk || 0) > 15 ? "⚠️ Housekeeping backlog building.\n" : ""),
          { occupancy: occPct, revenue_today: Math.round(dailyRev), open_maintenance: openMaint, pending_housekeeping: pendingHk }
        );
      }

      default:
        return reply(
          "I can help you with:\n\n" +
          "- **Occupancy** — \"How full are we?\"\n" +
          "- **Revenue** — \"How much revenue today?\"\n" +
          "- **Arrivals** — \"Who's arriving tomorrow?\"\n" +
          "- **Departures** — \"Any checkouts today?\"\n" +
          "- **Pricing** — \"What rate should I set for studios?\"\n" +
          "- **Guests** — \"Show me VIP guests\"\n" +
          "- **Maintenance** — \"Any urgent issues?\"\n" +
          "- **Housekeeping** — \"Which rooms need cleaning?\"\n" +
          "- **Energy** — \"How can we save on energy?\"\n\n" +
          "Just ask in plain English."
        );
    }
  } catch {
    return reply("Sorry, I had trouble fetching that data. Please try again.");
  }
}

function reply(content: string, data?: Record<string, unknown>): ChatMessage {
  return {
    role: "ai",
    content,
    data,
    timestamp: new Date().toISOString(),
  };
}
