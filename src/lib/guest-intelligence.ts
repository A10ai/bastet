/**
 * HospitAI Guest Intelligence Engine
 *
 * Analyses real guest + booking data to produce actionable scores,
 * churn risk assessments, upsell opportunities, segment breakdowns,
 * predictive insights, and AI-generated text recommendations.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GuestScore {
  guest_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  loyalty_tier: string;
  vip_status: boolean;
  total_stays: number;
  total_nights: number;
  total_spend_gbp: number;
  nationality: string | null;
  ltv: number;
  churn_risk: number;
  upsell_score: number;
  satisfaction_score: number;
  last_stay_date: string | null;
  avg_spend_per_night: number;
  booking_frequency_days: number | null;
}

export interface ChurnRiskGuest {
  guest_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  loyalty_tier: string;
  churn_risk: number;
  last_stay_date: string | null;
  days_since_last_stay: number;
  total_spend_gbp: number;
  total_stays: number;
  suggested_action: string;
}

export interface UpsellOpportunity {
  type: "room_upgrade" | "extend_stay" | "vip_package";
  label: string;
  description: string;
  target_guests: {
    guest_id: string;
    first_name: string;
    last_name: string;
    loyalty_tier: string;
  }[];
  estimated_revenue_impact: number;
}

export interface SegmentAnalysis {
  loyalty_tiers: {
    tier: string;
    count: number;
    avg_spend: number;
    avg_stays: number;
    total_revenue: number;
  }[];
  top_nationalities: {
    nationality: string;
    count: number;
    total_revenue: number;
  }[];
  avg_length_of_stay_by_tier: {
    tier: string;
    avg_nights: number;
  }[];
}

export interface GuestPrediction {
  guest_id: string;
  first_name: string;
  last_name: string;
  loyalty_tier: string;
  ltv: number;
  next_booking_probability: number;
  predicted_next_stay_value: number;
  recommended_room_type: string;
  best_outreach_timing: string;
}

export interface GuestInsight {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  recommendation: string;
  metric?: string;
}

export interface GuestIntelligenceData {
  scores: GuestScore[];
  churn_risks: ChurnRiskGuest[];
  upsell_opportunities: UpsellOpportunity[];
  segments: SegmentAnalysis;
  predictions: GuestPrediction[];
  insights: GuestInsight[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function tierWeight(tier: string): number {
  switch (tier) {
    case "platinum": return 4;
    case "gold": return 3;
    case "silver": return 2;
    case "bronze": return 1;
    default: return 1;
  }
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24)));
}

// ---------------------------------------------------------------------------
// getGuestScores
// ---------------------------------------------------------------------------

export async function getGuestScores(
  supabase: SupabaseClient
): Promise<GuestScore[]> {
  // Fetch all guests
  const { data: guests, error: guestError } = await supabase
    .from("guests")
    .select("id, first_name, last_name, email, loyalty_tier, vip_status, total_stays, total_nights, total_spend_gbp, nationality, created_at");

  if (guestError || !guests) return [];

  // Fetch latest checkout per guest
  const { data: bookings } = await supabase
    .from("bookings")
    .select("guest_id, check_in, check_out, total_amount_gbp, status, rate_per_night_gbp, apartment_id, nights")
    .in("status", ["checked_out", "checked_in", "confirmed"]);

  const bookingsByGuest: Record<string, typeof bookings> = {};
  if (bookings) {
    for (const b of bookings) {
      if (!b.guest_id) continue;
      if (!bookingsByGuest[b.guest_id]) bookingsByGuest[b.guest_id] = [];
      bookingsByGuest[b.guest_id]!.push(b);
    }
  }

  const now = new Date();
  const scores: GuestScore[] = [];

  for (const guest of guests) {
    const guestBookings = bookingsByGuest[guest.id] || [];
    const checkedOutBookings = guestBookings
      .filter((b) => b.status === "checked_out" && b.check_out)
      .sort((a, b) => new Date(b.check_out).getTime() - new Date(a.check_out).getTime());

    const lastStayDate = checkedOutBookings.length > 0 ? checkedOutBookings[0].check_out : null;
    const daysSinceLastStay = lastStayDate ? daysBetween(now, new Date(lastStayDate)) : 999;

    // Booking frequency: average days between stays
    let bookingFrequencyDays: number | null = null;
    if (checkedOutBookings.length >= 2) {
      const dates = checkedOutBookings.map((b) => new Date(b.check_out).getTime()).sort((a, b) => a - b);
      const intervals: number[] = [];
      for (let i = 1; i < dates.length; i++) {
        intervals.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
      }
      bookingFrequencyDays = Math.round(intervals.reduce((s, v) => s + v, 0) / intervals.length);
    }

    const avgSpendPerNight = guest.total_nights > 0
      ? guest.total_spend_gbp / guest.total_nights
      : 0;

    // LTV: total_spend + predicted future (annualized based on frequency * avg booking value)
    const avgBookingValue = guestBookings.length > 0
      ? guest.total_spend_gbp / Math.max(guest.total_stays, 1)
      : 0;
    const staysPerYear = bookingFrequencyDays && bookingFrequencyDays > 0
      ? 365 / bookingFrequencyDays
      : guest.total_stays > 0
        ? guest.total_stays / Math.max(daysBetween(now, new Date(guest.created_at)) / 365, 0.5)
        : 0;
    const predictedAnnualSpend = staysPerYear * avgBookingValue;
    const ltv = Math.round(guest.total_spend_gbp + predictedAnnualSpend * 2); // 2-year forward

    // Churn Risk (0-100)
    let churnRisk = 0;
    // Days since last stay component (0-50)
    if (daysSinceLastStay > 365) churnRisk += 50;
    else if (daysSinceLastStay > 180) churnRisk += 35;
    else if (daysSinceLastStay > 90) churnRisk += 20;
    else if (daysSinceLastStay > 60) churnRisk += 10;
    else churnRisk += 0;

    // Frequency decline component (0-30)
    if (bookingFrequencyDays !== null) {
      if (daysSinceLastStay > bookingFrequencyDays * 2) churnRisk += 30;
      else if (daysSinceLastStay > bookingFrequencyDays * 1.5) churnRisk += 20;
      else if (daysSinceLastStay > bookingFrequencyDays * 1.2) churnRisk += 10;
    } else if (guest.total_stays <= 1) {
      churnRisk += 15; // one-time guests have moderate churn risk
    }

    // Tier inverse component (0-20): higher tier guests who churn are more impactful
    if (guest.loyalty_tier === "platinum" || guest.loyalty_tier === "gold") {
      // High-tier guests: lower base churn unless inactive
      if (daysSinceLastStay > 90) churnRisk += 20;
    } else {
      churnRisk += 10;
    }
    churnRisk = clamp(churnRisk, 0, 100);

    // Upsell Score (0-100)
    let upsellScore = 0;
    // Spend per night component (0-40)
    if (avgSpendPerNight > 200) upsellScore += 40;
    else if (avgSpendPerNight > 100) upsellScore += 30;
    else if (avgSpendPerNight > 50) upsellScore += 20;
    else upsellScore += 10;

    // Tier component (0-30)
    upsellScore += tierWeight(guest.loyalty_tier) * 7.5;

    // Frequency component (0-30)
    if (guest.total_stays >= 5) upsellScore += 30;
    else if (guest.total_stays >= 3) upsellScore += 20;
    else if (guest.total_stays >= 2) upsellScore += 10;
    upsellScore = clamp(Math.round(upsellScore), 0, 100);

    // Satisfaction Score (0-100)
    let satisfactionScore = 50; // baseline
    // Repeat bookings add satisfaction signal
    if (guest.total_stays >= 5) satisfactionScore += 25;
    else if (guest.total_stays >= 3) satisfactionScore += 15;
    else if (guest.total_stays >= 2) satisfactionScore += 10;

    // VIP status adds satisfaction signal
    if (guest.vip_status) satisfactionScore += 10;

    // Growing stay length indicates satisfaction
    if (checkedOutBookings.length >= 2) {
      const recentNights = checkedOutBookings.slice(0, Math.ceil(checkedOutBookings.length / 2));
      const olderNights = checkedOutBookings.slice(Math.ceil(checkedOutBookings.length / 2));
      const recentAvg = recentNights.reduce((s, b) => s + (b.nights || 1), 0) / recentNights.length;
      const olderAvg = olderNights.reduce((s, b) => s + (b.nights || 1), 0) / olderNights.length;
      if (recentAvg > olderAvg) satisfactionScore += 10;
      else if (recentAvg < olderAvg * 0.7) satisfactionScore -= 10;
    }

    // Tier bonus
    satisfactionScore += tierWeight(guest.loyalty_tier) * 2;
    satisfactionScore = clamp(Math.round(satisfactionScore), 0, 100);

    scores.push({
      guest_id: guest.id,
      first_name: guest.first_name,
      last_name: guest.last_name,
      email: guest.email,
      loyalty_tier: guest.loyalty_tier,
      vip_status: guest.vip_status,
      total_stays: guest.total_stays,
      total_nights: guest.total_nights,
      total_spend_gbp: guest.total_spend_gbp,
      nationality: guest.nationality,
      ltv,
      churn_risk: churnRisk,
      upsell_score: upsellScore,
      satisfaction_score: satisfactionScore,
      last_stay_date: lastStayDate,
      avg_spend_per_night: Math.round(avgSpendPerNight * 100) / 100,
      booking_frequency_days: bookingFrequencyDays,
    });
  }

  // Sort by LTV descending
  scores.sort((a, b) => b.ltv - a.ltv);
  return scores;
}

// ---------------------------------------------------------------------------
// getChurnRiskGuests
// ---------------------------------------------------------------------------

export async function getChurnRiskGuests(
  supabase: SupabaseClient
): Promise<ChurnRiskGuest[]> {
  const scores = await getGuestScores(supabase);
  const now = new Date();

  return scores
    .filter((s) => s.churn_risk > 60)
    .sort((a, b) => b.churn_risk - a.churn_risk)
    .map((s) => {
      const daysSince = s.last_stay_date
        ? daysBetween(now, new Date(s.last_stay_date))
        : 999;

      let suggestedAction = "Send win-back offer";
      if (s.loyalty_tier === "platinum" || s.loyalty_tier === "gold") {
        suggestedAction = "Personal outreach";
      } else if (s.churn_risk > 80) {
        suggestedAction = "Loyalty bonus";
      } else if (daysSince > 365) {
        suggestedAction = "Send win-back offer";
      }

      return {
        guest_id: s.guest_id,
        first_name: s.first_name,
        last_name: s.last_name,
        email: s.email,
        loyalty_tier: s.loyalty_tier,
        churn_risk: s.churn_risk,
        last_stay_date: s.last_stay_date,
        days_since_last_stay: daysSince,
        total_spend_gbp: s.total_spend_gbp,
        total_stays: s.total_stays,
        suggested_action: suggestedAction,
      };
    });
}

// ---------------------------------------------------------------------------
// getUpsellOpportunities
// ---------------------------------------------------------------------------

export async function getUpsellOpportunities(
  supabase: SupabaseClient
): Promise<UpsellOpportunity[]> {
  const scores = await getGuestScores(supabase);

  // Fetch bookings with apartment types for room upgrade analysis
  const { data: bookings } = await supabase
    .from("bookings")
    .select("guest_id, apartment_id, nights, total_amount_gbp, apartments(id, apartment_type_id, apartment_types(id, name, bedrooms))")
    .in("status", ["checked_out", "checked_in"]);

  const bookingsByGuest: Record<string, typeof bookings> = {};
  if (bookings) {
    for (const b of bookings) {
      if (!b.guest_id) continue;
      if (!bookingsByGuest[b.guest_id]) bookingsByGuest[b.guest_id] = [];
      bookingsByGuest[b.guest_id]!.push(b);
    }
  }

  const opportunities: UpsellOpportunity[] = [];

  // 1. Room Upgrade: guests who stayed in studio 3+ times
  const upgradeGuests: UpsellOpportunity["target_guests"] = [];
  let upgradeRevenue = 0;
  for (const score of scores) {
    const gb = bookingsByGuest[score.guest_id] || [];
    const studioStays = gb.filter((b) => {
      const apt = b.apartments as any;
      const typeName = apt?.apartment_types?.name?.toLowerCase() || "";
      return typeName.includes("studio") || (apt?.apartment_types?.bedrooms === 0);
    });
    if (studioStays.length >= 3) {
      upgradeGuests.push({
        guest_id: score.guest_id,
        first_name: score.first_name,
        last_name: score.last_name,
        loyalty_tier: score.loyalty_tier,
      });
      upgradeRevenue += score.avg_spend_per_night * 7 * 0.3; // 30% uplift estimate
    }
  }
  if (upgradeGuests.length > 0) {
    opportunities.push({
      type: "room_upgrade",
      label: "Room Upgrade",
      description: `${upgradeGuests.length} guest${upgradeGuests.length > 1 ? "s" : ""} have stayed in studios 3+ times and could be upgraded to 1-bedroom apartments`,
      target_guests: upgradeGuests,
      estimated_revenue_impact: Math.round(upgradeRevenue),
    });
  }

  // 2. Extend Stay: guests who consistently book 7 nights, could do 14
  const extendGuests: UpsellOpportunity["target_guests"] = [];
  let extendRevenue = 0;
  for (const score of scores) {
    const gb = bookingsByGuest[score.guest_id] || [];
    if (gb.length < 2) continue;
    const avgNights = gb.reduce((s, b) => s + (b.nights || 7), 0) / gb.length;
    if (avgNights >= 6 && avgNights <= 8) {
      extendGuests.push({
        guest_id: score.guest_id,
        first_name: score.first_name,
        last_name: score.last_name,
        loyalty_tier: score.loyalty_tier,
      });
      extendRevenue += score.avg_spend_per_night * 7 * 0.9; // extra week at 10% LOS discount
    }
  }
  if (extendGuests.length > 0) {
    opportunities.push({
      type: "extend_stay",
      label: "Stay Extension",
      description: `${extendGuests.length} guest${extendGuests.length > 1 ? "s" : ""} averaging 7-night stays could be offered 14-night packages with LOS discounts`,
      target_guests: extendGuests,
      estimated_revenue_impact: Math.round(extendRevenue),
    });
  }

  // 3. VIP Package: high spenders not yet VIP
  const vipGuests: UpsellOpportunity["target_guests"] = [];
  let vipRevenue = 0;
  for (const score of scores) {
    if (!score.vip_status && score.total_spend_gbp > 5000 && score.total_stays >= 3) {
      vipGuests.push({
        guest_id: score.guest_id,
        first_name: score.first_name,
        last_name: score.last_name,
        loyalty_tier: score.loyalty_tier,
      });
      vipRevenue += score.avg_spend_per_night * 3 * 0.2; // estimated VIP package uplift
    }
  }
  if (vipGuests.length > 0) {
    opportunities.push({
      type: "vip_package",
      label: "VIP Package",
      description: `${vipGuests.length} high-spending guest${vipGuests.length > 1 ? "s" : ""} qualify for VIP packages but haven't been upgraded yet`,
      target_guests: vipGuests,
      estimated_revenue_impact: Math.round(vipRevenue),
    });
  }

  return opportunities;
}

// ---------------------------------------------------------------------------
// getGuestSegmentAnalysis
// ---------------------------------------------------------------------------

export async function getGuestSegmentAnalysis(
  supabase: SupabaseClient
): Promise<SegmentAnalysis> {
  const { data: guests } = await supabase
    .from("guests")
    .select("id, loyalty_tier, total_stays, total_nights, total_spend_gbp, nationality");

  if (!guests) {
    return { loyalty_tiers: [], top_nationalities: [], avg_length_of_stay_by_tier: [] };
  }

  // Loyalty tier breakdown
  const tierMap: Record<string, { count: number; totalSpend: number; totalStays: number; totalNights: number }> = {};
  const natMap: Record<string, { count: number; totalRevenue: number }> = {};

  for (const g of guests) {
    const tier = g.loyalty_tier || "bronze";
    if (!tierMap[tier]) tierMap[tier] = { count: 0, totalSpend: 0, totalStays: 0, totalNights: 0 };
    tierMap[tier].count++;
    tierMap[tier].totalSpend += g.total_spend_gbp || 0;
    tierMap[tier].totalStays += g.total_stays || 0;
    tierMap[tier].totalNights += g.total_nights || 0;

    const nat = g.nationality || "Unknown";
    if (!natMap[nat]) natMap[nat] = { count: 0, totalRevenue: 0 };
    natMap[nat].count++;
    natMap[nat].totalRevenue += g.total_spend_gbp || 0;
  }

  const loyaltyTiers = ["bronze", "silver", "gold", "platinum"].map((tier) => {
    const data = tierMap[tier] || { count: 0, totalSpend: 0, totalStays: 0, totalNights: 0 };
    return {
      tier,
      count: data.count,
      avg_spend: data.count > 0 ? Math.round(data.totalSpend / data.count) : 0,
      avg_stays: data.count > 0 ? Math.round((data.totalStays / data.count) * 10) / 10 : 0,
      total_revenue: Math.round(data.totalSpend),
    };
  });

  const topNationalities = Object.entries(natMap)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([nationality, data]) => ({
      nationality,
      count: data.count,
      total_revenue: Math.round(data.totalRevenue),
    }));

  const avgLosByTier = ["bronze", "silver", "gold", "platinum"].map((tier) => {
    const data = tierMap[tier] || { count: 0, totalNights: 0, totalStays: 0 };
    return {
      tier,
      avg_nights: data.totalStays > 0 ? Math.round((data.totalNights / data.totalStays) * 10) / 10 : 0,
    };
  });

  return {
    loyalty_tiers: loyaltyTiers,
    top_nationalities: topNationalities,
    avg_length_of_stay_by_tier: avgLosByTier,
  };
}

// ---------------------------------------------------------------------------
// getGuestPredictions
// ---------------------------------------------------------------------------

export async function getGuestPredictions(
  supabase: SupabaseClient
): Promise<GuestPrediction[]> {
  const scores = await getGuestScores(supabase);
  const top20 = scores.slice(0, 20);

  return top20.map((s) => {
    // Next booking probability based on frequency and recency
    let nextBookingProb = 0.5;
    if (s.booking_frequency_days && s.last_stay_date) {
      const daysSince = daysBetween(new Date(), new Date(s.last_stay_date));
      const ratio = daysSince / s.booking_frequency_days;
      if (ratio < 0.8) nextBookingProb = 0.85;
      else if (ratio < 1.2) nextBookingProb = 0.7;
      else if (ratio < 1.5) nextBookingProb = 0.5;
      else if (ratio < 2) nextBookingProb = 0.3;
      else nextBookingProb = 0.15;
    } else if (s.total_stays >= 3) {
      nextBookingProb = 0.6;
    }

    // Predicted stay value
    const predictedValue = Math.round(s.avg_spend_per_night * (s.total_nights / Math.max(s.total_stays, 1)));

    // Room recommendation
    let recommendedRoom = "Standard Apartment";
    if (s.avg_spend_per_night > 200) recommendedRoom = "Premium Suite";
    else if (s.avg_spend_per_night > 120) recommendedRoom = "1-Bedroom Deluxe";
    else if (s.avg_spend_per_night > 80) recommendedRoom = "1-Bedroom Standard";
    else recommendedRoom = "Studio";

    // Best outreach timing
    let bestTiming = "Within 2 weeks";
    if (s.booking_frequency_days) {
      const daysSince = s.last_stay_date
        ? daysBetween(new Date(), new Date(s.last_stay_date))
        : 0;
      const daysUntilNext = Math.max(0, s.booking_frequency_days - daysSince);
      if (daysUntilNext <= 0) bestTiming = "Immediately — overdue for booking";
      else if (daysUntilNext <= 14) bestTiming = "Within 2 weeks";
      else if (daysUntilNext <= 30) bestTiming = "Within 1 month";
      else bestTiming = `In approximately ${Math.round(daysUntilNext / 7)} weeks`;
    }

    return {
      guest_id: s.guest_id,
      first_name: s.first_name,
      last_name: s.last_name,
      loyalty_tier: s.loyalty_tier,
      ltv: s.ltv,
      next_booking_probability: Math.round(nextBookingProb * 100) / 100,
      predicted_next_stay_value: predictedValue,
      recommended_room_type: recommendedRoom,
      best_outreach_timing: bestTiming,
    };
  });
}

// ---------------------------------------------------------------------------
// getGuestInsights
// ---------------------------------------------------------------------------

export async function getGuestInsights(
  supabase: SupabaseClient
): Promise<GuestInsight[]> {
  const scores = await getGuestScores(supabase);
  const segments = await getGuestSegmentAnalysis(supabase);
  const insights: GuestInsight[] = [];
  let id = 1;

  // 1. High-tier churning guests
  const highTierChurning = scores.filter(
    (s) => (s.loyalty_tier === "platinum" || s.loyalty_tier === "gold") && s.churn_risk > 60
  );
  if (highTierChurning.length > 0) {
    const avgDays = highTierChurning.reduce((s, g) => {
      return s + (g.last_stay_date ? daysBetween(new Date(), new Date(g.last_stay_date)) : 999);
    }, 0) / highTierChurning.length;
    insights.push({
      id: String(id++),
      severity: "critical",
      title: `${highTierChurning.length} high-tier guest${highTierChurning.length > 1 ? "s" : ""} at churn risk`,
      description: `${highTierChurning.length} ${highTierChurning.map((g) => g.loyalty_tier).filter((v, i, a) => a.indexOf(v) === i).join("/")} guest${highTierChurning.length > 1 ? "s haven't" : " hasn't"} booked in ${Math.round(avgDays)}+ days`,
      recommendation: "Schedule personal outreach calls and offer exclusive loyalty bonuses to retain these high-value guests",
      metric: `${highTierChurning.reduce((s, g) => s + g.total_spend_gbp, 0).toLocaleString()} GBP at risk`,
    });
  }

  // 2. Studio upgrade potential
  const studioGuests = scores.filter((s) => s.total_stays >= 3 && s.avg_spend_per_night < 80);
  if (studioGuests.length > 0) {
    insights.push({
      id: String(id++),
      severity: "info",
      title: "Studio guests ready for upgrade",
      description: `${studioGuests.length} guests averaging ${Math.round(studioGuests.reduce((s, g) => s + g.total_stays, 0) / studioGuests.length)} stays could be upgraded to 1-bed apartments`,
      recommendation: "Create a targeted upgrade campaign with a 10% discount on the first 1-bedroom booking",
    });
  }

  // 3. Nationality revenue insight
  if (segments.top_nationalities.length >= 2) {
    const totalAvgRevenue = segments.top_nationalities.reduce((s, n) => s + n.total_revenue, 0) / segments.top_nationalities.length;
    const topNat = segments.top_nationalities[0];
    const topAvg = topNat.count > 0 ? topNat.total_revenue / topNat.count : 0;
    const overallAvg = scores.length > 0 ? scores.reduce((s, g) => s + g.total_spend_gbp, 0) / scores.length : 0;

    if (topAvg > overallAvg * 1.2) {
      const pctMore = Math.round(((topAvg - overallAvg) / overallAvg) * 100);
      insights.push({
        id: String(id++),
        severity: "info",
        title: `${topNat.nationality} guests outperform average`,
        description: `${topNat.nationality} guests spend ${pctMore}% more than the average guest`,
        recommendation: `Increase marketing spend targeting ${topNat.nationality} travellers for higher ROI`,
        metric: `${topNat.count} guests, ${formatGBP(topNat.total_revenue)} total revenue`,
      });
    }
  }

  // 4. One-time guest conversion opportunity
  const oneTimeGuests = scores.filter((s) => s.total_stays === 1);
  if (oneTimeGuests.length > 0 && scores.length > 0) {
    const pct = Math.round((oneTimeGuests.length / scores.length) * 100);
    if (pct > 40) {
      insights.push({
        id: String(id++),
        severity: "warning",
        title: `${pct}% of guests are one-time visitors`,
        description: `${oneTimeGuests.length} guests have only stayed once — significant conversion opportunity`,
        recommendation: "Implement a post-stay email sequence with a repeat booking discount to improve retention",
        metric: `${oneTimeGuests.length} guests`,
      });
    }
  }

  // 5. VIP underutilization
  const highSpendNonVip = scores.filter((s) => !s.vip_status && s.total_spend_gbp > 5000);
  if (highSpendNonVip.length > 0) {
    insights.push({
      id: String(id++),
      severity: "warning",
      title: `${highSpendNonVip.length} high spenders missing VIP status`,
      description: `Guests who've spent ${formatGBP(highSpendNonVip.reduce((s, g) => s + g.total_spend_gbp, 0))} total are not flagged as VIP`,
      recommendation: "Review VIP criteria and upgrade qualifying guests to improve retention and satisfaction",
    });
  }

  // 6. Average satisfaction across tiers
  const platinumScores = scores.filter((s) => s.loyalty_tier === "platinum");
  const bronzeScores = scores.filter((s) => s.loyalty_tier === "bronze");
  if (platinumScores.length > 0 && bronzeScores.length > 0) {
    const platAvg = Math.round(platinumScores.reduce((s, g) => s + g.satisfaction_score, 0) / platinumScores.length);
    const bronzeAvg = Math.round(bronzeScores.reduce((s, g) => s + g.satisfaction_score, 0) / bronzeScores.length);
    if (platAvg > bronzeAvg + 15) {
      insights.push({
        id: String(id++),
        severity: "info",
        title: "Satisfaction gap between tiers",
        description: `Platinum guests average ${platAvg} satisfaction vs ${bronzeAvg} for bronze — tier benefits working`,
        recommendation: "Introduce mid-tier perks for silver and gold to accelerate tier progression",
      });
    }
  }

  return insights;
}

function formatGBP(amount: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 0 }).format(amount);
}

// ---------------------------------------------------------------------------
// getAllGuestIntelligence — single call for the API
// ---------------------------------------------------------------------------

export async function getAllGuestIntelligence(
  supabase: SupabaseClient
): Promise<GuestIntelligenceData> {
  const [scores, churnRisks, upsellOpportunities, segments, predictions, insights] = await Promise.all([
    getGuestScores(supabase),
    getChurnRiskGuests(supabase),
    getUpsellOpportunities(supabase),
    getGuestSegmentAnalysis(supabase),
    getGuestPredictions(supabase),
    getGuestInsights(supabase),
  ]);

  return {
    scores,
    churn_risks: churnRisks,
    upsell_opportunities: upsellOpportunities,
    segments,
    predictions,
    insights,
  };
}
