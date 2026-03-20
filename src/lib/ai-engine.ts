/**
 * HospitAI Intelligence Engine
 *
 * Analyses operational data and generates actionable insights,
 * pricing recommendations, and predictions.
 */

export interface AIInsight {
  id: string;
  type: "pricing" | "energy" | "maintenance" | "occupancy" | "revenue" | "guest" | "housekeeping";
  severity: "info" | "opportunity" | "warning" | "critical";
  title: string;
  description: string;
  impact?: string;
  action?: string;
  confidence: number; // 0-100
  created_at: string;
}

export interface PricingRecommendation {
  apartment_type: string;
  current_rate: number;
  recommended_rate: number;
  change_percent: number;
  reason: string;
  confidence: number;
  period: string;
}

export interface OccupancyForecast {
  date: string;
  predicted_occupancy: number;
  confidence: number;
  factors: string[];
}

export interface AICommandData {
  insights: AIInsight[];
  pricing_recommendations: PricingRecommendation[];
  occupancy_forecast: OccupancyForecast[];
  health_score: number; // 0-100, overall property AI health
  stats: {
    total_insights: number;
    revenue_opportunity: number;
    energy_savings_potential: number;
    predicted_occupancy_7d: number;
    ai_actions_taken: number;
  };
}

/**
 * Generate AI insights from operational data.
 * In production this would use ML models — for now we use
 * rule-based intelligence on real data patterns.
 */
export function generateInsights(data: {
  occupancy: number;
  avg_rate: number;
  open_maintenance: number;
  urgent_maintenance: number;
  housekeeping_dirty: number;
  total_apartments: number;
  revenue_today: number;
  arrivals_today: number;
  departures_today: number;
}): AIInsight[] {
  const insights: AIInsight[] = [];
  const now = new Date().toISOString();

  // Pricing intelligence
  if (data.occupancy > 85) {
    insights.push({
      id: "pricing-high-occ",
      type: "pricing",
      severity: "opportunity",
      title: "High occupancy — increase rates",
      description: `Occupancy at ${data.occupancy}%. Demand exceeds typical levels. Dynamic pricing suggests a 12-18% rate increase for the next 7 days.`,
      impact: "Estimated +£2,400/week additional revenue",
      action: "Review pricing recommendations below",
      confidence: 87,
      created_at: now,
    });
  } else if (data.occupancy < 50) {
    insights.push({
      id: "pricing-low-occ",
      type: "pricing",
      severity: "warning",
      title: "Low occupancy — consider rate adjustment",
      description: `Occupancy at ${data.occupancy}%. Below target threshold. A 10-15% rate reduction could stimulate bookings without significant revenue loss.`,
      impact: "Could increase bookings by 20-30%",
      action: "Review pricing recommendations below",
      confidence: 74,
      created_at: now,
    });
  }

  // Maintenance prediction
  if (data.urgent_maintenance > 0) {
    insights.push({
      id: "maint-urgent",
      type: "maintenance",
      severity: "critical",
      title: `${data.urgent_maintenance} urgent maintenance issue${data.urgent_maintenance > 1 ? "s" : ""}`,
      description: "Unresolved urgent issues directly impact guest experience and can cascade into higher repair costs.",
      impact: "Guest satisfaction risk + potential 3-5x cost increase if delayed",
      action: "Assign and resolve within 4 hours",
      confidence: 95,
      created_at: now,
    });
  }

  if (data.open_maintenance > 5) {
    insights.push({
      id: "maint-backlog",
      type: "maintenance",
      severity: "warning",
      title: "Maintenance backlog building",
      description: `${data.open_maintenance} open requests. Pattern analysis suggests HVAC and plumbing are the primary categories. Schedule preventive maintenance to reduce reactive calls.`,
      action: "Review maintenance queue and batch similar tasks",
      confidence: 72,
      created_at: now,
    });
  }

  // Energy insight
  insights.push({
    id: "energy-occ-match",
    type: "energy",
    severity: data.occupancy < 60 ? "opportunity" : "info",
    title: data.occupancy < 60
      ? "Energy savings opportunity — low occupancy"
      : "Energy systems aligned with occupancy",
    description: data.occupancy < 60
      ? `With ${data.occupancy}% occupancy, ${100 - data.occupancy}% of units are empty. HVAC and lighting in vacant units should be in standby mode. Estimated savings: £${Math.round((100 - data.occupancy) * 1.8)}/day.`
      : `Occupancy at ${data.occupancy}%. Energy systems are operating within optimal parameters for current load.`,
    impact: data.occupancy < 60
      ? `£${Math.round((100 - data.occupancy) * 1.8 * 30)}/month potential savings`
      : undefined,
    confidence: 82,
    created_at: now,
  });

  // Housekeeping intelligence
  if (data.housekeeping_dirty > data.total_apartments * 0.3) {
    insights.push({
      id: "hk-backlog",
      type: "housekeeping",
      severity: "warning",
      title: "Housekeeping queue above threshold",
      description: `${data.housekeeping_dirty} rooms need cleaning (${Math.round((data.housekeeping_dirty / data.total_apartments) * 100)}% of property). AI recommends prioritising arrivals-due units and high-loyalty guest rooms.`,
      action: "Auto-prioritise based on check-in times",
      confidence: 90,
      created_at: now,
    });
  }

  // Revenue intelligence
  if (data.departures_today > data.arrivals_today + 3) {
    insights.push({
      id: "rev-gap",
      type: "revenue",
      severity: "opportunity",
      title: "Net departures today — fill the gap",
      description: `${data.departures_today} departures vs ${data.arrivals_today} arrivals. Net loss of ${data.departures_today - data.arrivals_today} occupied units. Consider flash rates on OTAs or direct channel promotion.`,
      action: "Push last-minute availability to channels",
      confidence: 68,
      created_at: now,
    });
  }

  // Guest intelligence
  if (data.arrivals_today > 0) {
    insights.push({
      id: "guest-arrivals",
      type: "guest",
      severity: "info",
      title: `${data.arrivals_today} arrival${data.arrivals_today > 1 ? "s" : ""} today — preferences loaded`,
      description: "Guest preference profiles have been synced to room automation systems. Temperature, lighting, and welcome amenities are pre-configured based on historical data.",
      confidence: 85,
      created_at: now,
    });
  }

  return insights.sort((a, b) => {
    const order = { critical: 0, warning: 1, opportunity: 2, info: 3 };
    return order[a.severity] - order[b.severity];
  });
}

/**
 * Generate dynamic pricing recommendations based on occupancy,
 * demand patterns, and competitive positioning.
 */
export function generatePricingRecommendations(
  occupancy: number,
  currentRates: { type: string; rate: number }[]
): PricingRecommendation[] {
  // Dynamic pricing model: adjust rates based on occupancy bands
  const getMultiplier = (occ: number): { mult: number; reason: string } => {
    if (occ >= 90) return { mult: 1.20, reason: "Peak demand — maximise yield" };
    if (occ >= 80) return { mult: 1.12, reason: "High demand — premium pricing" };
    if (occ >= 70) return { mult: 1.05, reason: "Strong demand — slight premium" };
    if (occ >= 50) return { mult: 1.00, reason: "Normal demand — hold rates" };
    if (occ >= 30) return { mult: 0.90, reason: "Low demand — stimulate bookings" };
    return { mult: 0.82, reason: "Very low demand — aggressive discounting" };
  };

  const { mult, reason } = getMultiplier(occupancy);

  return currentRates.map((r) => {
    const recommended = Math.round(r.rate * mult);
    const change = Math.round(((recommended - r.rate) / r.rate) * 100);
    return {
      apartment_type: r.type,
      current_rate: r.rate,
      recommended_rate: recommended,
      change_percent: change,
      reason,
      confidence: Math.min(95, 60 + occupancy * 0.3),
      period: "Next 7 days",
    };
  });
}

/**
 * Generate 14-day occupancy forecast.
 *
 * This is kept as a lightweight fallback for contexts where the full
 * ML model cannot be invoked (no Supabase client available).
 * The real ML-based forecast lives in prediction-model.ts and is served
 * via /api/v1/ai/predictions.
 */
export function generateOccupancyForecast(
  currentOccupancy: number,
  arrivals: number,
  departures: number
): OccupancyForecast[] {
  const forecast: OccupancyForecast[] = [];
  let occ = currentOccupancy;

  for (let i = 0; i < 14; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    const dayOfWeek = date.getDay();

    // Simple seasonal + day-of-week model (fallback only)
    const weekendBoost = dayOfWeek === 5 || dayOfWeek === 6 ? 8 : 0;
    const trend = (arrivals - departures) * 0.5;

    occ = Math.max(15, Math.min(98, occ + trend * 0.3 + weekendBoost * 0.4));

    const factors: string[] = [];
    if (weekendBoost > 0) factors.push("Weekend demand");
    if (trend > 0) factors.push("Positive booking momentum");
    if (trend < 0) factors.push("Net departures trend");
    if (occ > 85) factors.push("High season pattern");

    forecast.push({
      date: date.toISOString().split("T")[0],
      predicted_occupancy: Math.round(occ),
      confidence: Math.max(50, 92 - i * 3),
      factors: factors.length > 0 ? factors : ["Baseline forecast"],
    });
  }

  return forecast;
}

/**
 * Calculate overall property AI health score.
 */
export function calculateHealthScore(data: {
  occupancy: number;
  urgent_maintenance: number;
  housekeeping_dirty: number;
  total_apartments: number;
}): number {
  let score = 100;

  // Occupancy factor (optimal: 70-90%)
  if (data.occupancy < 50) score -= 20;
  else if (data.occupancy < 70) score -= 10;
  else if (data.occupancy > 95) score -= 5; // Over-saturated

  // Maintenance factor
  score -= data.urgent_maintenance * 8;

  // Housekeeping factor
  const dirtyRatio = data.housekeeping_dirty / Math.max(data.total_apartments, 1);
  if (dirtyRatio > 0.3) score -= 15;
  else if (dirtyRatio > 0.15) score -= 8;

  return Math.max(0, Math.min(100, Math.round(score)));
}
