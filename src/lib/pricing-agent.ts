import type { SupabaseClient } from "@supabase/supabase-js";
import { round2 } from "@/lib/online-booking";
import { emitEvent } from "@/lib/event-bus";
import { logger } from "@/lib/logger";

/**
 * Pricing agent — Sales module, slice 4 (migration 00039).
 *
 * Every day, for every apartment type and each week of the horizon, the
 * agent reads: the rate currently on sale, how many units are still free,
 * what was picked up in the last seven days, the competitor median from
 * rate shops and any demand forecast. It proposes a rate inside the owner's
 * band (floor, ceiling, maximum daily move) with its reasoning written out.
 * Bands with auto_apply write the rate straight away; otherwise the
 * recommendation waits in the queue for a manager. Nothing is ever priced
 * below the floor, and the agent never touches rate plans or restrictions.
 *
 * The scoring is deliberately simple and explainable (see `recommend`).
 * It is the baseline the KTP's learned model will be measured against.
 */

export interface PricingBand {
  property_id: string;
  apartment_type_id: string | null;
  floor_gbp: number;
  ceiling_gbp: number;
  target_premium_percent: number;
  max_daily_change_percent: number;
  auto_apply: boolean;
  horizon_weeks: number;
}

export interface WindowSignals {
  apartment_type_id: string;
  apartment_type: string;
  stay_from: string;
  stay_to: string;
  /** Average rate currently on sale across the window (BAR). */
  current_rate_gbp: number;
  total_units: number;
  /** Average units free across the window. */
  available_units: number;
  /** Nights in this window booked during the last 7 days. */
  pickup_7d: number;
  /** Days from today to the window start. */
  lead_days: number;
  comp_median_gbp: number | null;
  comp_samples: number;
  /** 0..1 from demand_forecasts when present. */
  occupancy_forecast: number | null;
}

export interface Recommendation {
  recommended_rate_gbp: number;
  change_percent: number;
  demand_score: number;
  reasoning: string;
  skip_reason: string | null;
}

export const DEFAULT_BAND: Omit<PricingBand, "property_id" | "apartment_type_id" | "floor_gbp" | "ceiling_gbp"> = {
  target_premium_percent: 15,
  max_daily_change_percent: 10,
  auto_apply: false,
  horizon_weeks: 12,
};

const MIN_CHANGE_PERCENT = 1;

export function median(values: number[]): number | null {
  const v = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/**
 * The pricing rule. Pure, so it can be tested and later replaced by a model.
 *
 *   occupancy  = 1 - available / total (forecast overrides when present)
 *   demand factor: > 85 % +8 %, 70-85 % +4 %, 40-70 % 0, < 40 % and
 *                  arrival within 30 days -6 %; strong pickup (>= 10 % of
 *                  units in 7 days) +3 %
 *   comp anchor = competitor median x (1 + target premium), when shops exist
 *   target      = 0.6 x anchor + 0.4 x (current x demand factor), else the
 *                 demand-adjusted current rate
 *   then clamp to the band and to +/- max daily change; round to 1 GBP.
 */
export function recommend(s: WindowSignals, band: Pick<PricingBand, "floor_gbp" | "ceiling_gbp" | "target_premium_percent" | "max_daily_change_percent">): Recommendation {
  const notes: string[] = [];
  const current = s.current_rate_gbp;
  if (!(current > 0)) return { recommended_rate_gbp: current, change_percent: 0, demand_score: 0, reasoning: "No rate on sale", skip_reason: "no current rate" };
  if (s.total_units <= 0) return { recommended_rate_gbp: current, change_percent: 0, demand_score: 0, reasoning: "No sellable units", skip_reason: "no units" };

  const occ = s.occupancy_forecast ?? Math.min(1, Math.max(0, 1 - s.available_units / s.total_units));
  notes.push(s.occupancy_forecast !== null ? `forecast occupancy ${Math.round(occ * 100)}%` : `${Math.round(occ * 100)}% of units already sold (${Math.round(s.available_units)} of ${s.total_units} free)`);
  let factor = 1;
  if (occ > 0.85) { factor += 0.08; notes.push("high demand +8%"); }
  else if (occ > 0.7) { factor += 0.04; notes.push("firm demand +4%"); }
  else if (occ < 0.4 && s.lead_days <= 30) { factor -= 0.06; notes.push("soft demand close to arrival -6%"); }
  else notes.push("demand in the normal band");
  const pickupShare = s.pickup_7d / Math.max(1, s.total_units * 7);
  if (pickupShare >= 0.1) { factor += 0.03; notes.push(`strong pickup (${s.pickup_7d} nights in 7 days) +3%`); }
  else if (s.pickup_7d > 0) notes.push(`${s.pickup_7d} nights picked up in 7 days`);

  let target = current * factor;
  if (s.comp_median_gbp !== null && s.comp_samples > 0) {
    const anchor = s.comp_median_gbp * (1 + band.target_premium_percent / 100);
    target = 0.6 * anchor + 0.4 * target;
    notes.push(`competitor median ${s.comp_median_gbp.toFixed(0)} GBP (${s.comp_samples} shops), premium target +${band.target_premium_percent}% = ${anchor.toFixed(0)} GBP`);
  } else {
    notes.push("no competitor shops for these dates");
  }

  const maxMove = current * (band.max_daily_change_percent / 100);
  let clamped = Math.min(current + maxMove, Math.max(current - maxMove, target));
  if (clamped !== target) notes.push(`limited to +/-${band.max_daily_change_percent}% per day`);
  const banded = Math.min(band.ceiling_gbp, Math.max(band.floor_gbp, clamped));
  if (banded !== clamped) notes.push(banded === band.floor_gbp ? `held at floor ${band.floor_gbp} GBP` : `held at ceiling ${band.ceiling_gbp} GBP`);
  // Whole pounds, without letting the rounding step over the daily limit or the band.
  clamped = Math.round(banded);
  if (clamped > current + maxMove) clamped = Math.floor(current + maxMove);
  if (clamped < current - maxMove) clamped = Math.ceil(current - maxMove);
  clamped = Math.min(Math.floor(band.ceiling_gbp), Math.max(Math.ceil(band.floor_gbp), clamped));

  const change = round2(((clamped - current) / current) * 100);
  const demandScore = round2(Math.min(1, Math.max(0, occ * 0.7 + Math.min(0.3, pickupShare * 3))));
  const reasoning = `${s.apartment_type} ${s.stay_from} to ${s.stay_to}: ${current.toFixed(0)} -> ${clamped} GBP (${change >= 0 ? "+" : ""}${change}%). ${notes.join("; ")}.`;
  if (Math.abs(change) < MIN_CHANGE_PERCENT) return { recommended_rate_gbp: current, change_percent: 0, demand_score: demandScore, reasoning, skip_reason: "change under 1%" };
  return { recommended_rate_gbp: clamped, change_percent: change, demand_score: demandScore, reasoning, skip_reason: null };
}

// ---------------------------------------------------------------------------
// Data access
// ---------------------------------------------------------------------------

/** Bands for a property: per-type rows override the property default; types without any band get a derived one. */
export async function getBands(admin: SupabaseClient, propertyId: string): Promise<{ byType: Map<string, PricingBand>; fallback: (typeId: string, baseNightly: number) => PricingBand }> {
  const { data } = await admin.from("pricing_bands").select("*").eq("property_id", propertyId);
  const rows = ((data || []) as Record<string, unknown>[]).map((r) => ({
    property_id: propertyId,
    apartment_type_id: (r.apartment_type_id as string | null) ?? null,
    floor_gbp: Number(r.floor_gbp),
    ceiling_gbp: Number(r.ceiling_gbp),
    target_premium_percent: Number(r.target_premium_percent),
    max_daily_change_percent: Number(r.max_daily_change_percent),
    auto_apply: Boolean(r.auto_apply),
    horizon_weeks: Number(r.horizon_weeks ?? 12),
  }));
  const byType = new Map(rows.filter((r) => r.apartment_type_id).map((r) => [r.apartment_type_id as string, r]));
  const def = rows.find((r) => !r.apartment_type_id) ?? null;
  const fallback = (typeId: string, baseNightly: number): PricingBand => ({
    property_id: propertyId,
    apartment_type_id: typeId,
    // Without an owner-set band the agent stays conservative: never below 70%
    // of the base rate, never above double, and never auto-applies.
    floor_gbp: def ? def.floor_gbp : round2(baseNightly * 0.7),
    ceiling_gbp: def ? def.ceiling_gbp : round2(baseNightly * 2),
    target_premium_percent: def?.target_premium_percent ?? DEFAULT_BAND.target_premium_percent,
    max_daily_change_percent: def?.max_daily_change_percent ?? DEFAULT_BAND.max_daily_change_percent,
    auto_apply: def?.auto_apply ?? false,
    horizon_weeks: def?.horizon_weeks ?? DEFAULT_BAND.horizon_weeks,
  });
  return { byType, fallback };
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDay(d);
}

/** Signals for every type x weekly window over the horizon. */
export async function loadSignals(admin: SupabaseClient, propertyId: string, horizonWeeks: number, now: Date = new Date()): Promise<WindowSignals[]> {
  const from = isoDay(now);
  const to = addDays(from, horizonWeeks * 7);
  const since7 = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const [{ data: types }, { data: ari, error }, { data: recent }, { data: shops }, { data: forecasts }] = await Promise.all([
    admin.from("apartment_types").select("id, name, base_weekly_rate_gbp").eq("property_id", propertyId),
    admin.rpc("channel_ari", { p_property_id: propertyId, p_from: from, p_to: to, p_rate_plan_id: null }),
    admin.from("bookings").select("apartment_id, check_in, check_out, created_at, status, apartments(apartment_type_id)").eq("property_id", propertyId).gte("created_at", since7).not("status", "in", "(cancelled,no_show)").lt("check_in", to).gt("check_out", from),
    admin.from("rate_shops").select("apartment_type_id, stay_date, rate_gbp, shopped_at").eq("property_id", propertyId).gte("stay_date", from).lt("stay_date", to).gte("shopped_at", new Date(now.getTime() - 14 * 86_400_000).toISOString()),
    admin.from("demand_forecasts").select("forecast_date, predicted_occupancy").eq("property_id", propertyId).gte("forecast_date", from).lt("forecast_date", to),
  ]);
  if (error) throw new Error(`channel_ari: ${error.message}`);
  const rows = (ari || []) as { apartment_type_id: string; day: string; total: number; available: number; bar_gbp: number }[];
  const out: WindowSignals[] = [];
  for (const t of (types || []) as { id: string; name: string; base_weekly_rate_gbp: number }[]) {
    for (let w = 0; w < horizonWeeks; w++) {
      const wFrom = addDays(from, w * 7);
      const wTo = addDays(wFrom, 7);
      const days = rows.filter((r) => r.apartment_type_id === t.id && r.day >= wFrom && r.day < wTo);
      if (!days.length) continue;
      const avg = (f: (r: typeof days[number]) => number) => days.reduce((s, r) => s + f(r), 0) / days.length;
      let pickup = 0;
      for (const b of (recent || []) as { check_in: string; check_out: string; apartments: { apartment_type_id: string } | { apartment_type_id: string }[] | null }[]) {
        const apt = Array.isArray(b.apartments) ? b.apartments[0] : b.apartments;
        if (apt?.apartment_type_id !== t.id) continue;
        const s = b.check_in > wFrom ? b.check_in : wFrom;
        const e = b.check_out < wTo ? b.check_out : wTo;
        const n = Math.round((Date.parse(`${e}T00:00:00Z`) - Date.parse(`${s}T00:00:00Z`)) / 86_400_000);
        if (n > 0) pickup += n;
      }
      const comp = ((shops || []) as { apartment_type_id: string | null; stay_date: string; rate_gbp: number }[]).filter((x) => x.stay_date >= wFrom && x.stay_date < wTo && (!x.apartment_type_id || x.apartment_type_id === t.id));
      const fc = ((forecasts || []) as { forecast_date: string; predicted_occupancy: number | null }[]).filter((f) => f.forecast_date >= wFrom && f.forecast_date < wTo && f.predicted_occupancy !== null);
      const fcAvg = fc.length ? fc.reduce((s, f) => s + Number(f.predicted_occupancy), 0) / fc.length : null;
      out.push({
        apartment_type_id: t.id,
        apartment_type: t.name,
        stay_from: wFrom,
        stay_to: wTo,
        current_rate_gbp: round2(avg((r) => Number(r.bar_gbp))),
        total_units: Math.round(avg((r) => Number(r.total))),
        available_units: round2(avg((r) => Number(r.available))),
        pickup_7d: pickup,
        lead_days: w * 7,
        comp_median_gbp: median(comp.map((c) => Number(c.rate_gbp))),
        comp_samples: comp.length,
        occupancy_forecast: fcAvg === null ? null : (fcAvg > 1 ? fcAvg / 100 : fcAvg),
      });
    }
  }
  return out;
}

export interface GenerateResult {
  batch_id: string;
  windows: number;
  pending: number;
  auto_applied: number;
  unchanged: number;
  expired: number;
  errors: string[];
}

/**
 * One agent run for a property: expire the previous pending queue, score
 * every window, queue or auto-apply. Idempotent per day: a second run on the
 * same day replaces the queue rather than duplicating it.
 */
export async function generateRecommendations(admin: SupabaseClient, propertyId: string, opts: { now?: Date; actor?: string | null } = {}): Promise<GenerateResult> {
  const now = opts.now ?? new Date();
  const batchId = `${isoDay(now)}-${now.getTime().toString(36)}`;
  const { byType, fallback } = await getBands(admin, propertyId);
  const typeHorizons = [...byType.values()].map((b) => b.horizon_weeks);
  const horizon = Math.max(1, typeHorizons.length ? Math.max(...typeHorizons) : fallback("", 0).horizon_weeks);
  const { data: types } = await admin.from("apartment_types").select("id, base_weekly_rate_gbp").eq("property_id", propertyId);
  const baseByType = new Map(((types || []) as { id: string; base_weekly_rate_gbp: number }[]).map((t) => [t.id, Number(t.base_weekly_rate_gbp) / 7]));
  const signals = await loadSignals(admin, propertyId, horizon, now);

  const { data: expiredRows } = await admin.from("rate_recommendations").update({ status: "expired", decided_at: now.toISOString() }).eq("property_id", propertyId).eq("status", "pending").select("id");
  const result: GenerateResult = { batch_id: batchId, windows: signals.length, pending: 0, auto_applied: 0, unchanged: 0, expired: (expiredRows || []).length, errors: [] };

  for (const s of signals) {
    const band = byType.get(s.apartment_type_id) ?? fallback(s.apartment_type_id, baseByType.get(s.apartment_type_id) ?? s.current_rate_gbp);
    const rec = recommend(s, band);
    if (rec.skip_reason) { result.unchanged += 1; continue; }
    const { data: row, error } = await admin
      .from("rate_recommendations")
      .insert({
        property_id: propertyId,
        apartment_type_id: s.apartment_type_id,
        batch_id: batchId,
        stay_from: s.stay_from,
        stay_to: s.stay_to,
        current_rate_gbp: s.current_rate_gbp,
        recommended_rate_gbp: rec.recommended_rate_gbp,
        change_percent: rec.change_percent,
        floor_gbp: band.floor_gbp,
        ceiling_gbp: band.ceiling_gbp,
        comp_median_gbp: s.comp_median_gbp,
        comp_samples: s.comp_samples,
        occupancy_forecast: s.occupancy_forecast,
        pickup_7d: s.pickup_7d,
        demand_score: rec.demand_score,
        reasoning: rec.reasoning,
        status: "pending",
      })
      .select("id")
      .single();
    if (error || !row) { result.errors.push(`${s.apartment_type} ${s.stay_from}: ${error?.message ?? "insert failed"}`); continue; }
    if (band.auto_apply) {
      const applied = await applyRecommendation(admin, row.id as string, null, true);
      if (applied.error) result.errors.push(`${s.apartment_type} ${s.stay_from}: ${applied.error}`);
      else result.auto_applied += 1;
    } else {
      result.pending += 1;
    }
  }
  logger.info({ property: propertyId, ...result }, "[pricing-agent] run complete");
  return result;
}

/** Approve (or auto-apply) a recommendation through `apply_rate_recommendation`; emits pricing.rate_changed. */
export async function applyRecommendation(admin: SupabaseClient, id: string, actorStaffId: string | null, auto = false): Promise<{ rate_id: string | null; error: string | null }> {
  const { data, error } = await admin.rpc("apply_rate_recommendation", { p_id: id, p_actor: actorStaffId, p_auto: auto });
  if (error) return { rate_id: null, error: error.message };
  const res = data as { rate_id: string; recommendation: { apartment_type_id: string; stay_from: string; stay_to: string; current_rate_gbp: number; recommended_rate_gbp: number; property_id: string } };
  const r = res.recommendation;
  await emitEvent("pricing.rate_changed", "pricing-agent", { property_id: r.property_id, apartment_type_id: r.apartment_type_id, stay_from: r.stay_from, stay_to: r.stay_to, from_gbp: Number(r.current_rate_gbp), to_gbp: Number(r.recommended_rate_gbp), auto, recommendation_id: id }, admin, { idempotencyKey: `pricing:${id}` }).catch(() => undefined);
  return { rate_id: res.rate_id, error: null };
}

export async function rejectRecommendation(admin: SupabaseClient, id: string, actorStaffId: string | null): Promise<{ ok: boolean; error: string | null }> {
  const { data, error } = await admin.from("rate_recommendations").update({ status: "rejected", decided_at: new Date().toISOString(), decided_by: actorStaffId }).eq("id", id).eq("status", "pending").select("id").maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "INVALID_STATUS: recommendation is not pending" };
  return { ok: true, error: null };
}

/** Cron: one run per property per day. */
export async function runPricingAgentForAllProperties(admin: SupabaseClient, now: Date = new Date()): Promise<Record<string, GenerateResult | { skipped: string } | { error: string }>> {
  const { data: props } = await admin.from("properties").select("id").in("status", ["pre_opening", "active"]);
  const out: Record<string, GenerateResult | { skipped: string } | { error: string }> = {};
  const today = isoDay(now);
  for (const p of (props || []) as { id: string }[]) {
    const { data: ran } = await admin.from("rate_recommendations").select("id").eq("property_id", p.id).like("batch_id", `${today}-%`).limit(1);
    if (ran && ran.length) { out[p.id] = { skipped: "already ran today" }; continue; }
    try {
      out[p.id] = await generateRecommendations(admin, p.id, { now });
    } catch (e) {
      out[p.id] = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  return out;
}
