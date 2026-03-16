/**
 * HospitAI Revenue Copilot Engine
 *
 * Queries real Supabase booking, channel, apartment, and rate data to produce
 * revenue KPIs, channel mix analysis, rate performance metrics, LOS patterns,
 * what-if simulations, and 30-day revenue forecasts.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { CHANNEL_COMMISSIONS, LENGTH_OF_STAY_DISCOUNTS } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RevenueOverview {
  total_revenue_gbp: number;
  revenue_this_month: number;
  revenue_last_month: number;
  month_over_month_change_pct: number;
  avg_daily_rate: number;
  revpar: number;
  avg_length_of_stay: number;
  direct_booking_percentage: number;
  net_revenue: number;
  commission_cost_total: number;
  total_bookings: number;
  total_room_nights: number;
  total_apartments: number;
}

export interface ChannelMixItem {
  channel_name: string;
  channel_code: string;
  booking_count: number;
  revenue_gbp: number;
  commission_rate: number;
  commission_cost_gbp: number;
  net_revenue_gbp: number;
  avg_booking_value: number;
  percentage_of_revenue: number;
}

export interface ChannelMixResult {
  channels: ChannelMixItem[];
  ai_recommendation: {
    summary: string;
    actions: string[];
    estimated_annual_savings_gbp: number;
  };
}

export interface ChannelOptimization {
  current_mix: { channel: string; percentage: number }[];
  optimal_mix: { channel: string; percentage: number }[];
  estimated_annual_savings_gbp: number;
  actions: string[];
}

export interface RatePerformanceItem {
  apartment_type_id: string;
  apartment_type_name: string;
  base_rate_gbp: number;
  avg_actual_rate_gbp: number;
  occupancy_pct: number;
  rate_efficiency: number;
  revpau: number;
  total_units: number;
  booked_nights: number;
  total_available_nights: number;
  ai_suggestion: string;
}

export interface LOSBracket {
  label: string;
  min_nights: number;
  max_nights: number;
  booking_count: number;
  total_revenue_gbp: number;
  avg_rate_per_night: number;
  percentage_of_bookings: number;
}

export interface LOSAnalysis {
  brackets: LOSBracket[];
  discount_tiers: { min_nights: number; discount: number }[];
  ai_recommendation: {
    summary: string;
    actions: string[];
  };
}

export interface WhatIfResult {
  current_rate: number;
  new_rate: number;
  rate_change_pct: number;
  current_occupancy: number;
  projected_occupancy: number;
  occupancy_change_pct: number;
  current_revenue: number;
  projected_revenue: number;
  revenue_change_gbp: number;
  revenue_change_pct: number;
  break_even_occupancy: number;
  recommendation: "increase" | "decrease" | "hold";
  reasoning: string;
}

export interface ForecastDay {
  date: string;
  projected_revenue_low: number;
  projected_revenue_mid: number;
  projected_revenue_high: number;
  confirmed_revenue: number;
  cumulative_mid: number;
}

export interface RevenueForecast {
  days: ForecastDay[];
  total_projected_low: number;
  total_projected_mid: number;
  total_projected_high: number;
  total_confirmed: number;
}

export interface RevenueData {
  overview: RevenueOverview;
  channel_mix: ChannelMixResult;
  channel_optimization: ChannelOptimization;
  rate_performance: RatePerformanceItem[];
  los_analysis: LOSAnalysis;
  revenue_forecast: RevenueForecast;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nightsBetween(checkIn: string, checkOut: string): number {
  const a = new Date(checkIn);
  const b = new Date(checkOut);
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}

function getCommissionRate(channelCode: string): number {
  const code = (channelCode || "direct").toLowerCase();
  return CHANNEL_COMMISSIONS[code] ?? 0;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

// ---------------------------------------------------------------------------
// Revenue Overview
// ---------------------------------------------------------------------------

export async function getRevenueOverview(
  supabase: SupabaseClient
): Promise<RevenueOverview> {
  // Fetch active bookings (checked_in, checked_out, confirmed)
  const { data: bookings } = await supabase
    .from("bookings")
    .select(
      "id, total_amount_gbp, rate_per_night_gbp, check_in, check_out, status, channel_id, discount_percentage"
    )
    .in("status", ["checked_in", "checked_out", "confirmed"]);

  const { data: channels } = await supabase
    .from("booking_channels")
    .select("id, name, code, commission_rate");

  const { data: apartments } = await supabase
    .from("apartments")
    .select("id")
    .neq("status", "out_of_service");

  const channelMap = new Map<string, { name: string; code: string; commission_rate: number }>();
  (channels || []).forEach((ch) => channelMap.set(ch.id, ch));

  const rows = bookings || [];
  const totalApartments = (apartments || []).length || 1;

  const now = new Date();
  const thisMonthStart = startOfMonth(now);
  const lastMonthStart = startOfMonth(
    new Date(now.getFullYear(), now.getMonth() - 1, 1)
  );
  const lastMonthEnd = new Date(thisMonthStart.getTime() - 1);

  let totalRevenue = 0;
  let revenueThisMonth = 0;
  let revenueLastMonth = 0;
  let totalRoomNights = 0;
  let totalCommission = 0;
  let directBookings = 0;

  for (const b of rows) {
    const revenue = b.total_amount_gbp || 0;
    const nights = nightsBetween(b.check_in, b.check_out);
    totalRevenue += revenue;
    totalRoomNights += nights;

    const checkIn = new Date(b.check_in);
    if (checkIn >= thisMonthStart) revenueThisMonth += revenue;
    if (checkIn >= lastMonthStart && checkIn <= lastMonthEnd) revenueLastMonth += revenue;

    const ch = channelMap.get(b.channel_id);
    const commRate = ch ? getCommissionRate(ch.code) : 0;
    totalCommission += revenue * commRate;

    if (ch && ["direct", "phone", "walk-in"].includes(ch.code?.toLowerCase())) {
      directBookings++;
    }
  }

  const adr = totalRoomNights > 0 ? totalRevenue / totalRoomNights : 0;
  const periodDays = daysInMonth(now);
  const revpar = totalRevenue / (totalApartments * periodDays);
  const avgLOS = rows.length > 0
    ? rows.reduce((s, b) => s + nightsBetween(b.check_in, b.check_out), 0) / rows.length
    : 0;
  const directPct = rows.length > 0 ? (directBookings / rows.length) * 100 : 0;
  const momChange = revenueLastMonth > 0
    ? ((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100
    : 0;

  return {
    total_revenue_gbp: Math.round(totalRevenue * 100) / 100,
    revenue_this_month: Math.round(revenueThisMonth * 100) / 100,
    revenue_last_month: Math.round(revenueLastMonth * 100) / 100,
    month_over_month_change_pct: Math.round(momChange * 10) / 10,
    avg_daily_rate: Math.round(adr * 100) / 100,
    revpar: Math.round(revpar * 100) / 100,
    avg_length_of_stay: Math.round(avgLOS * 10) / 10,
    direct_booking_percentage: Math.round(directPct * 10) / 10,
    net_revenue: Math.round((totalRevenue - totalCommission) * 100) / 100,
    commission_cost_total: Math.round(totalCommission * 100) / 100,
    total_bookings: rows.length,
    total_room_nights: totalRoomNights,
    total_apartments: totalApartments,
  };
}

// ---------------------------------------------------------------------------
// Channel Mix
// ---------------------------------------------------------------------------

export async function getChannelMix(
  supabase: SupabaseClient
): Promise<ChannelMixResult> {
  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, total_amount_gbp, channel_id, check_in, check_out, status")
    .in("status", ["checked_in", "checked_out", "confirmed"]);

  const { data: channels } = await supabase
    .from("booking_channels")
    .select("id, name, code, commission_rate");

  const channelMap = new Map<string, { name: string; code: string; commission_rate: number }>();
  (channels || []).forEach((ch) => channelMap.set(ch.id, ch));

  const agg = new Map<
    string,
    { name: string; code: string; count: number; revenue: number; commRate: number }
  >();

  let totalRevenue = 0;
  for (const b of bookings || []) {
    const ch = channelMap.get(b.channel_id);
    const name = ch?.name || "Unknown";
    const code = ch?.code || "unknown";
    const commRate = ch ? getCommissionRate(ch.code) : 0;
    const revenue = b.total_amount_gbp || 0;
    totalRevenue += revenue;

    const existing = agg.get(code);
    if (existing) {
      existing.count++;
      existing.revenue += revenue;
    } else {
      agg.set(code, { name, code, count: 1, revenue, commRate });
    }
  }

  const items: ChannelMixItem[] = [];
  for (const [, v] of Array.from(agg)) {
    const commCost = v.revenue * v.commRate;
    items.push({
      channel_name: v.name,
      channel_code: v.code,
      booking_count: v.count,
      revenue_gbp: Math.round(v.revenue * 100) / 100,
      commission_rate: v.commRate,
      commission_cost_gbp: Math.round(commCost * 100) / 100,
      net_revenue_gbp: Math.round((v.revenue - commCost) * 100) / 100,
      avg_booking_value: v.count > 0 ? Math.round((v.revenue / v.count) * 100) / 100 : 0,
      percentage_of_revenue: totalRevenue > 0
        ? Math.round((v.revenue / totalRevenue) * 1000) / 10
        : 0,
    });
  }

  items.sort((a, b) => b.revenue_gbp - a.revenue_gbp);

  // AI recommendations
  const highCommChannels = items.filter((c) => c.commission_rate >= 0.14);
  const directChannel = items.find((c) =>
    ["direct", "phone", "walk-in"].includes(c.channel_code.toLowerCase())
  );
  const totalComm = items.reduce((s, c) => s + c.commission_cost_gbp, 0);

  const actions: string[] = [];
  let estSavings = 0;

  for (const hc of highCommChannels) {
    if (hc.percentage_of_revenue > 20) {
      const shiftPct = Math.min(10, hc.percentage_of_revenue - 15);
      const savings = (hc.revenue_gbp * (shiftPct / 100)) * hc.commission_rate * 12;
      estSavings += savings;
      actions.push(
        `Reduce ${hc.channel_name} allocation by ${Math.round(shiftPct)}%, shift to direct bookings — save ~\u00a3${Math.round(savings).toLocaleString()}/yr`
      );
    }
  }

  if (directChannel && directChannel.percentage_of_revenue < 40) {
    actions.push(
      `Increase direct booking share from ${directChannel.percentage_of_revenue}% to 40%+ through website promotions and loyalty incentives`
    );
  }

  if (actions.length === 0) {
    actions.push("Channel mix is well-optimized. Monitor OTA commission rate changes.");
  }

  return {
    channels: items,
    ai_recommendation: {
      summary:
        totalComm > 0
          ? `Current commission costs are \u00a3${Math.round(totalComm).toLocaleString()}. ${
              estSavings > 0
                ? `Optimizing channel mix could save \u00a3${Math.round(estSavings).toLocaleString()}/year.`
                : "Mix is close to optimal."
            }`
          : "No commission costs detected — all bookings are direct.",
      actions,
      estimated_annual_savings_gbp: Math.round(estSavings),
    },
  };
}

// ---------------------------------------------------------------------------
// Channel Optimization
// ---------------------------------------------------------------------------

export async function getChannelOptimization(
  supabase: SupabaseClient
): Promise<ChannelOptimization> {
  const mix = await getChannelMix(supabase);
  const current = mix.channels.map((c) => ({
    channel: c.channel_name,
    percentage: c.percentage_of_revenue,
  }));

  // Build optimal mix: maximize net revenue by shifting from high-commission to low
  const totalRevenue = mix.channels.reduce((s, c) => s + c.revenue_gbp, 0);
  const optimal: { channel: string; percentage: number }[] = [];
  let targetDirect = 0;

  for (const ch of mix.channels) {
    let optPct = ch.percentage_of_revenue;
    if (ch.commission_rate >= 0.15 && optPct > 15) {
      const shift = Math.min(optPct - 15, 10);
      targetDirect += shift;
      optPct -= shift;
    } else if (ch.commission_rate >= 0.10 && optPct > 20) {
      const shift = Math.min(optPct - 20, 5);
      targetDirect += shift;
      optPct -= shift;
    }
    optimal.push({ channel: ch.channel_name, percentage: Math.round(optPct * 10) / 10 });
  }

  // Add to direct
  const directIdx = optimal.findIndex((o) =>
    o.channel.toLowerCase().includes("direct")
  );
  if (directIdx >= 0) {
    optimal[directIdx].percentage += targetDirect;
    optimal[directIdx].percentage = Math.round(optimal[directIdx].percentage * 10) / 10;
  }

  // Savings from shifting to 0-commission direct
  const avgOTAComm =
    mix.channels
      .filter((c) => c.commission_rate > 0)
      .reduce((s, c) => s + c.commission_rate, 0) /
      Math.max(1, mix.channels.filter((c) => c.commission_rate > 0).length) || 0.15;
  const shiftedRevenue = totalRevenue * (targetDirect / 100);
  const annualSavings = shiftedRevenue * avgOTAComm * 12;

  return {
    current_mix: current,
    optimal_mix: optimal,
    estimated_annual_savings_gbp: Math.round(annualSavings),
    actions: mix.ai_recommendation.actions,
  };
}

// ---------------------------------------------------------------------------
// Rate Performance
// ---------------------------------------------------------------------------

export async function getRatePerformance(
  supabase: SupabaseClient
): Promise<RatePerformanceItem[]> {
  const { data: types } = await supabase
    .from("apartment_types")
    .select("id, name, slug, base_rate_gbp");

  const { data: apartments } = await supabase
    .from("apartments")
    .select("id, apartment_type_id, status")
    .neq("status", "out_of_service");

  const { data: bookings } = await supabase
    .from("bookings")
    .select(
      "id, apartment_id, total_amount_gbp, rate_per_night_gbp, check_in, check_out, status"
    )
    .in("status", ["checked_in", "checked_out", "confirmed"]);

  const typeMap = new Map<string, { name: string; base_rate_gbp: number }>();
  (types || []).forEach((t) => typeMap.set(t.id, { name: t.name, base_rate_gbp: t.base_rate_gbp }));

  // Map apartment -> type
  const aptTypeMap = new Map<string, string>();
  const typeUnitCount = new Map<string, number>();
  for (const apt of apartments || []) {
    aptTypeMap.set(apt.id, apt.apartment_type_id);
    typeUnitCount.set(apt.apartment_type_id, (typeUnitCount.get(apt.apartment_type_id) || 0) + 1);
  }

  // Aggregate bookings by type
  const agg = new Map<
    string,
    { totalRevenue: number; totalNights: number; totalRate: number; count: number }
  >();

  for (const b of bookings || []) {
    const typeId = aptTypeMap.get(b.apartment_id);
    if (!typeId) continue;
    const nights = nightsBetween(b.check_in, b.check_out);
    const existing = agg.get(typeId) || { totalRevenue: 0, totalNights: 0, totalRate: 0, count: 0 };
    existing.totalRevenue += b.total_amount_gbp || 0;
    existing.totalNights += nights;
    existing.totalRate += (b.rate_per_night_gbp || 0) * nights;
    existing.count++;
    agg.set(typeId, existing);
  }

  const now = new Date();
  const periodDays = daysInMonth(now);
  const results: RatePerformanceItem[] = [];

  for (const [typeId, info] of Array.from(typeMap)) {
    const stats = agg.get(typeId) || { totalRevenue: 0, totalNights: 0, totalRate: 0, count: 0 };
    const units = typeUnitCount.get(typeId) || 1;
    const totalAvailableNights = units * periodDays;
    const occupancyPct = totalAvailableNights > 0
      ? (stats.totalNights / totalAvailableNights) * 100
      : 0;
    const avgActualRate = stats.totalNights > 0
      ? stats.totalRate / stats.totalNights
      : 0;
    const rateEfficiency = info.base_rate_gbp > 0
      ? avgActualRate / info.base_rate_gbp
      : 0;
    const revpau = totalAvailableNights > 0
      ? stats.totalRevenue / totalAvailableNights
      : 0;

    // AI suggestion
    let suggestion = "";
    if (occupancyPct > 80 && rateEfficiency < 1.05) {
      const suggestIncrease = Math.min(15, Math.round((occupancyPct - 75) / 2));
      suggestion = `High occupancy at ${Math.round(occupancyPct)}% — consider increasing rate by ${suggestIncrease}% to capture more revenue`;
    } else if (occupancyPct < 50 && rateEfficiency > 0.9) {
      const suggestDecrease = Math.min(10, Math.round((55 - occupancyPct) / 3));
      suggestion = `Low occupancy at ${Math.round(occupancyPct)}% — consider reducing rate by ${suggestDecrease}% to drive demand`;
    } else if (rateEfficiency > 1.15) {
      suggestion = `Rate efficiency at ${Math.round(rateEfficiency * 100)}% — actual rates exceed base rate. Consider updating base rate to reflect market position`;
    } else if (occupancyPct >= 50 && occupancyPct <= 80) {
      suggestion = `Balanced at ${Math.round(occupancyPct)}% occupancy — rate is well-positioned`;
    } else {
      suggestion = `Monitor performance — ${Math.round(occupancyPct)}% occupancy with ${Math.round(rateEfficiency * 100)}% rate efficiency`;
    }

    results.push({
      apartment_type_id: typeId,
      apartment_type_name: info.name,
      base_rate_gbp: info.base_rate_gbp,
      avg_actual_rate_gbp: Math.round(avgActualRate * 100) / 100,
      occupancy_pct: Math.round(occupancyPct * 10) / 10,
      rate_efficiency: Math.round(rateEfficiency * 100) / 100,
      revpau: Math.round(revpau * 100) / 100,
      total_units: units,
      booked_nights: stats.totalNights,
      total_available_nights: totalAvailableNights,
      ai_suggestion: suggestion,
    });
  }

  results.sort((a, b) => b.revpau - a.revpau);
  return results;
}

// ---------------------------------------------------------------------------
// Length of Stay Analysis
// ---------------------------------------------------------------------------

export async function getLOSAnalysis(
  supabase: SupabaseClient
): Promise<LOSAnalysis> {
  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, total_amount_gbp, rate_per_night_gbp, check_in, check_out, status")
    .in("status", ["checked_in", "checked_out", "confirmed"]);

  const brackets: {
    label: string;
    min: number;
    max: number;
    count: number;
    revenue: number;
    totalNights: number;
  }[] = [
    { label: "1-3 nights", min: 1, max: 3, count: 0, revenue: 0, totalNights: 0 },
    { label: "4-6 nights", min: 4, max: 6, count: 0, revenue: 0, totalNights: 0 },
    { label: "7-13 nights", min: 7, max: 13, count: 0, revenue: 0, totalNights: 0 },
    { label: "14-20 nights", min: 14, max: 20, count: 0, revenue: 0, totalNights: 0 },
    { label: "21-27 nights", min: 21, max: 27, count: 0, revenue: 0, totalNights: 0 },
    { label: "28+ nights", min: 28, max: 999, count: 0, revenue: 0, totalNights: 0 },
  ];

  const rows = bookings || [];
  for (const b of rows) {
    const nights = nightsBetween(b.check_in, b.check_out);
    const revenue = b.total_amount_gbp || 0;
    for (const bracket of brackets) {
      if (nights >= bracket.min && nights <= bracket.max) {
        bracket.count++;
        bracket.revenue += revenue;
        bracket.totalNights += nights;
        break;
      }
    }
  }

  const totalBookings = rows.length || 1;

  const result: LOSBracket[] = brackets.map((br) => ({
    label: br.label,
    min_nights: br.min,
    max_nights: br.max,
    booking_count: br.count,
    total_revenue_gbp: Math.round(br.revenue * 100) / 100,
    avg_rate_per_night: br.totalNights > 0
      ? Math.round((br.revenue / br.totalNights) * 100) / 100
      : 0,
    percentage_of_bookings: Math.round((br.count / totalBookings) * 1000) / 10,
  }));

  // AI recommendation: find gaps between discount tiers and booking patterns
  const actions: string[] = [];
  const fourToSix = result.find((b) => b.label === "4-6 nights");
  if (fourToSix && fourToSix.percentage_of_bookings > 15) {
    actions.push(
      `Introduce a 5-night discount at 3% — ${fourToSix.percentage_of_bookings}% of bookings are 4-6 nights with no discount tier`
    );
  }

  const shortStay = result.find((b) => b.label === "1-3 nights");
  if (shortStay && shortStay.percentage_of_bookings > 40) {
    actions.push(
      `${shortStay.percentage_of_bookings}% of bookings are short-stay (1-3 nights). Consider minimum stay requirements or premium short-stay rates`
    );
  }

  const longStay = result.find((b) => b.label === "28+ nights");
  if (longStay && longStay.percentage_of_bookings > 10) {
    actions.push(
      `Strong long-stay demand at ${longStay.percentage_of_bookings}%. Consider a dedicated monthly rate package`
    );
  }

  if (actions.length === 0) {
    actions.push(
      "Length of stay distribution aligns well with current discount tiers. Continue monitoring for seasonal shifts."
    );
  }

  return {
    brackets: result,
    discount_tiers: LENGTH_OF_STAY_DISCOUNTS.map((t) => ({
      min_nights: t.min_nights,
      discount: t.discount,
    })),
    ai_recommendation: {
      summary: `Analysed ${rows.length} bookings across ${brackets.filter((b) => b.count > 0).length} LOS brackets.`,
      actions,
    },
  };
}

// ---------------------------------------------------------------------------
// What-If Simulation
// ---------------------------------------------------------------------------

export function getWhatIfSimulation(
  currentRate: number,
  newRate: number,
  currentOccupancy: number,
  elasticity: number = -0.5
): WhatIfResult {
  const rateChangePct = currentRate > 0
    ? ((newRate - currentRate) / currentRate) * 100
    : 0;

  // Price elasticity model: occupancy change = rate change * elasticity
  const occupancyChangePct = rateChangePct * elasticity;
  const projectedOccupancy = Math.max(
    0,
    Math.min(100, currentOccupancy + (currentOccupancy * occupancyChangePct) / 100)
  );

  // Revenue = rate * occupancy (simplified per-unit model)
  const currentRevenue = currentRate * (currentOccupancy / 100);
  const projectedRevenue = newRate * (projectedOccupancy / 100);
  const revenueChangeGbp = projectedRevenue - currentRevenue;
  const revenueChangePct = currentRevenue > 0
    ? ((projectedRevenue - currentRevenue) / currentRevenue) * 100
    : 0;

  // Break-even: find occupancy where new rate * occ = current rate * current occ
  const breakEvenOccupancy = currentRate > 0
    ? (currentRate * currentOccupancy) / newRate
    : currentOccupancy;

  let recommendation: "increase" | "decrease" | "hold";
  let reasoning: string;

  if (revenueChangePct > 2) {
    recommendation = newRate > currentRate ? "increase" : "decrease";
    reasoning = `Projected ${Math.round(revenueChangePct)}% revenue increase. The rate change generates more revenue than the occupancy adjustment costs.`;
  } else if (revenueChangePct < -2) {
    recommendation = "hold";
    reasoning = `Projected ${Math.round(Math.abs(revenueChangePct))}% revenue decrease. The occupancy impact outweighs the rate change benefit.`;
  } else {
    recommendation = "hold";
    reasoning = "Minimal revenue impact. The rate change is roughly revenue-neutral given the expected occupancy shift.";
  }

  return {
    current_rate: currentRate,
    new_rate: newRate,
    rate_change_pct: Math.round(rateChangePct * 10) / 10,
    current_occupancy: currentOccupancy,
    projected_occupancy: Math.round(projectedOccupancy * 10) / 10,
    occupancy_change_pct: Math.round(occupancyChangePct * 10) / 10,
    current_revenue: Math.round(currentRevenue * 100) / 100,
    projected_revenue: Math.round(projectedRevenue * 100) / 100,
    revenue_change_gbp: Math.round(revenueChangeGbp * 100) / 100,
    revenue_change_pct: Math.round(revenueChangePct * 10) / 10,
    break_even_occupancy: Math.round(breakEvenOccupancy * 10) / 10,
    recommendation,
    reasoning,
  };
}

// ---------------------------------------------------------------------------
// Revenue Forecasting (30-day forward projection)
// ---------------------------------------------------------------------------

export async function getRevenueForecasting(
  supabase: SupabaseClient
): Promise<RevenueForecast> {
  const now = new Date();
  const thirtyDaysOut = new Date(now.getTime() + 30 * 86_400_000);

  // Get confirmed future bookings
  const { data: futureBookings } = await supabase
    .from("bookings")
    .select("id, total_amount_gbp, rate_per_night_gbp, check_in, check_out, status")
    .in("status", ["confirmed", "checked_in"])
    .gte("check_out", now.toISOString().slice(0, 10))
    .lte("check_in", thirtyDaysOut.toISOString().slice(0, 10));

  // Get historical bookings from last 90 days for pattern extraction
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 86_400_000);
  const { data: historicalBookings } = await supabase
    .from("bookings")
    .select("id, total_amount_gbp, rate_per_night_gbp, check_in, check_out, status")
    .in("status", ["checked_in", "checked_out"])
    .gte("check_in", ninetyDaysAgo.toISOString().slice(0, 10));

  const { data: apartments } = await supabase
    .from("apartments")
    .select("id")
    .neq("status", "out_of_service");

  const totalApartments = (apartments || []).length || 1;

  // Calculate historical average daily revenue
  const histRows = historicalBookings || [];
  const dailyRevenueMap = new Map<string, number>();
  for (const b of histRows) {
    const nights = nightsBetween(b.check_in, b.check_out);
    const dailyRev = (b.total_amount_gbp || 0) / nights;
    const start = new Date(b.check_in);
    for (let i = 0; i < nights; i++) {
      const d = new Date(start.getTime() + i * 86_400_000);
      const key = d.toISOString().slice(0, 10);
      dailyRevenueMap.set(key, (dailyRevenueMap.get(key) || 0) + dailyRev);
    }
  }

  const histValues = Array.from(dailyRevenueMap.values());
  const avgDailyRev = histValues.length > 0
    ? histValues.reduce((s, v) => s + v, 0) / histValues.length
    : 0;
  const stdDev = histValues.length > 1
    ? Math.sqrt(
        histValues.reduce((s, v) => s + Math.pow(v - avgDailyRev, 2), 0) /
          (histValues.length - 1)
      )
    : avgDailyRev * 0.2;

  // Build confirmed revenue per day from future bookings
  const confirmedDaily = new Map<string, number>();
  for (const b of futureBookings || []) {
    const nights = nightsBetween(b.check_in, b.check_out);
    const dailyRev = (b.total_amount_gbp || 0) / nights;
    const start = new Date(b.check_in);
    for (let i = 0; i < nights; i++) {
      const d = new Date(start.getTime() + i * 86_400_000);
      const key = d.toISOString().slice(0, 10);
      if (d >= now && d <= thirtyDaysOut) {
        confirmedDaily.set(key, (confirmedDaily.get(key) || 0) + dailyRev);
      }
    }
  }

  // Build forecast days
  const days: ForecastDay[] = [];
  let cumulativeMid = 0;
  let totalLow = 0;
  let totalMid = 0;
  let totalHigh = 0;
  let totalConfirmed = 0;

  for (let i = 0; i < 30; i++) {
    const d = new Date(now.getTime() + (i + 1) * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    const confirmed = confirmedDaily.get(key) || 0;

    // For unbooked capacity, estimate additional revenue from future bookings
    const occupancyDecay = 1 - (i / 30) * 0.3; // Less certainty further out
    const additionalEstimate = Math.max(0, (avgDailyRev - confirmed) * occupancyDecay * 0.5);

    const mid = confirmed + additionalEstimate;
    const low = confirmed + additionalEstimate * 0.5;
    const high = confirmed + additionalEstimate * 1.5 + stdDev * 0.3;

    cumulativeMid += mid;
    totalLow += low;
    totalMid += mid;
    totalHigh += high;
    totalConfirmed += confirmed;

    days.push({
      date: key,
      projected_revenue_low: Math.round(low * 100) / 100,
      projected_revenue_mid: Math.round(mid * 100) / 100,
      projected_revenue_high: Math.round(high * 100) / 100,
      confirmed_revenue: Math.round(confirmed * 100) / 100,
      cumulative_mid: Math.round(cumulativeMid * 100) / 100,
    });
  }

  return {
    days,
    total_projected_low: Math.round(totalLow * 100) / 100,
    total_projected_mid: Math.round(totalMid * 100) / 100,
    total_projected_high: Math.round(totalHigh * 100) / 100,
    total_confirmed: Math.round(totalConfirmed * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// Aggregate: get all revenue data
// ---------------------------------------------------------------------------

export async function getAllRevenueData(
  supabase: SupabaseClient
): Promise<RevenueData> {
  const [overview, channel_mix, channel_optimization, rate_performance, los_analysis, revenue_forecast] =
    await Promise.all([
      getRevenueOverview(supabase),
      getChannelMix(supabase),
      getChannelOptimization(supabase),
      getRatePerformance(supabase),
      getLOSAnalysis(supabase),
      getRevenueForecasting(supabase),
    ]);

  return {
    overview,
    channel_mix,
    channel_optimization,
    rate_performance,
    los_analysis,
    revenue_forecast,
  };
}
