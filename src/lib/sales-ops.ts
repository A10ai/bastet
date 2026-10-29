import type { SupabaseClient } from "@supabase/supabase-js";
import { generatePortalToken, hashPortalToken, portalExpiry, buildPortalUrl } from "@/lib/portal";
import { createNotification } from "@/lib/notifications";
import { logger } from "@/lib/logger";

/**
 * Sales operations — Sales module, slice 6 (migration 00041).
 *
 * Three things the online-first strategy needs around the booking engine:
 *   - reviews: ask every departing guest, keep OTA reviews in one place,
 *     draft replies (reputation drives OTA ranking for a new property),
 *   - the weekly proof report: occupancy, ADR, RevPAR, channel mix, direct
 *     share, pickup by market, reviews — the numbers tour operators will
 *     be shown when they come to contract,
 *   - the inbound operator pipeline (accounts, contacts, activities).
 */

// ---------------------------------------------------------------------------
// Proof report
// ---------------------------------------------------------------------------

export interface ProofMetrics {
  period_start: string;
  period_end: string;
  days: number;
  rooms: number;
  available_room_nights: number;
  room_nights: number;
  occupancy: number;
  room_revenue_gbp: number;
  adr_gbp: number;
  revpar_gbp: number;
  channels: { code: string; name: string; commission_rate: number | null; room_nights: number; revenue_gbp: number }[];
  direct_share: number;
  online_share: number;
  by_source: Record<string, number>;
  markets: { market: string; room_nights: number; revenue_gbp: number }[];
  pickup: { bookings: number; room_nights: number; revenue_gbp: number };
  cancellations: number;
  reviews: { new: number; avg_rating: number | null; unanswered: number };
  reviews_all_time: { count: number; avg_rating: number | null };
  concierge: { sessions: number; bookings: number };
}

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Monday..next Monday of the ISO week containing `d` (UTC). */
export function isoWeekBounds(d: Date): { start: string; end: string } {
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (day.getUTCDay() + 6) % 7; // Monday = 0
  day.setUTCDate(day.getUTCDate() - dow);
  const end = new Date(day);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start: isoDay(day), end: isoDay(end) };
}

export async function computeProof(admin: SupabaseClient, propertyId: string, from: string, to: string): Promise<ProofMetrics> {
  const { data, error } = await admin.rpc("sales_weekly_proof", { p_property_id: propertyId, p_from: from, p_to: to });
  if (error) throw new Error(`sales_weekly_proof: ${error.message}`);
  return data as ProofMetrics;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const gbp = (n: number) => `${Number(n).toFixed(0)} GBP`;

/** Plain-words summary of the week, the paragraph that goes at the top of the report and to the owner. */
export function proofNarrative(m: ProofMetrics, previous?: ProofMetrics | null): string {
  const parts: string[] = [];
  parts.push(`${m.period_start} to ${m.period_end}: occupancy ${pct(m.occupancy)} (${m.room_nights} of ${m.available_room_nights} room nights), ADR ${gbp(m.adr_gbp)}, RevPAR ${gbp(m.revpar_gbp)}, room revenue ${gbp(m.room_revenue_gbp)}.`);
  if (previous) {
    const d = (a: number, b: number) => (b === 0 ? null : Math.round(((a - b) / b) * 100));
    const occ = d(m.occupancy, previous.occupancy);
    const adr = d(m.adr_gbp, previous.adr_gbp);
    if (occ !== null || adr !== null) parts.push(`Versus the week before: occupancy ${occ === null ? "n/a" : `${occ >= 0 ? "+" : ""}${occ}%`}, ADR ${adr === null ? "n/a" : `${adr >= 0 ? "+" : ""}${adr}%`}.`);
  }
  parts.push(`Direct share ${pct(m.direct_share)}, online share ${pct(m.online_share)}.`);
  const top = m.channels.slice(0, 3).map((c) => `${c.name} ${c.room_nights} nights`).join(", ");
  if (top) parts.push(`Top channels: ${top}.`);
  const markets = m.markets.slice(0, 3).map((x) => `${x.market} ${x.room_nights}`).join(", ");
  if (markets) parts.push(`Top markets by room nights: ${markets}.`);
  parts.push(`Pickup this week: ${m.pickup.bookings} bookings, ${m.pickup.room_nights} room nights, ${gbp(m.pickup.revenue_gbp)}; ${m.cancellations} cancellation${m.cancellations === 1 ? "" : "s"}.`);
  if (m.reviews.new > 0) parts.push(`${m.reviews.new} new review${m.reviews.new === 1 ? "" : "s"}, average ${m.reviews.avg_rating ?? "n/a"}/5${m.reviews.unanswered ? `, ${m.reviews.unanswered} awaiting a reply` : ""}.`);
  else parts.push("No new reviews this week.");
  if (m.concierge.sessions > 0) parts.push(`Concierge: ${m.concierge.sessions} conversations, ${m.concierge.bookings} holds created.`);
  return parts.join(" ");
}

export async function snapshotProof(admin: SupabaseClient, propertyId: string, weekStart: string, weekEnd: string): Promise<{ id: string; metrics: ProofMetrics; narrative: string; created: boolean }> {
  const { data: existing } = await admin.from("sales_reports").select("id, metrics, narrative").eq("property_id", propertyId).eq("kind", "weekly").eq("period_start", weekStart).maybeSingle();
  if (existing) return { id: existing.id as string, metrics: existing.metrics as ProofMetrics, narrative: (existing.narrative as string) ?? "", created: false };
  const prevStart = new Date(`${weekStart}T00:00:00Z`);
  prevStart.setUTCDate(prevStart.getUTCDate() - 7);
  const [metrics, previous] = await Promise.all([computeProof(admin, propertyId, weekStart, weekEnd), computeProof(admin, propertyId, isoDay(prevStart), weekStart).catch(() => null)]);
  const narrative = proofNarrative(metrics, previous);
  const { data, error } = await admin.from("sales_reports").insert({ property_id: propertyId, period_start: weekStart, period_end: weekEnd, kind: "weekly", metrics, narrative }).select("id").single();
  if (error || !data) throw new Error(`sales_reports.insert: ${error?.message}`);
  await createNotification(admin, { property_id: propertyId, title: `Weekly sales report ${weekStart}`, message: narrative.slice(0, 400), type: "info", category: "system", link: "/dashboard/sales" }).catch(() => 0);
  return { id: data.id as string, metrics, narrative, created: true };
}

/** Cron: once the week has closed, store last week's report for every selling property. */
export async function runWeeklyProofReports(admin: SupabaseClient, now: Date = new Date()): Promise<Record<string, { created: boolean; period_start: string } | { error: string }>> {
  const { start } = isoWeekBounds(now);
  const lastEnd = start;
  const lastStart = isoDay(new Date(Date.parse(`${start}T00:00:00Z`) - 7 * 86_400_000));
  const { data: props } = await admin.from("properties").select("id").in("status", ["pre_opening", "active"]);
  const out: Record<string, { created: boolean; period_start: string } | { error: string }> = {};
  for (const p of (props || []) as { id: string }[]) {
    try {
      const r = await snapshotProof(admin, p.id, lastStart, lastEnd);
      out[p.id] = { created: r.created, period_start: lastStart };
    } catch (e) {
      out[p.id] = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

/**
 * After check-out: issue a portal link and queue the review request as a
 * draft communication (the email provider is a documented seam; staff can
 * send it from Guest Messaging until it is wired). Idempotent per booking.
 */
export async function requestReview(admin: SupabaseClient, bookingId: string, origin: string): Promise<{ queued: boolean; reason?: string }> {
  const { data: b } = await admin.from("bookings").select("id, property_id, reference, status, check_out, guest_id, review_requested_at, guests(first_name, email, language)").eq("id", bookingId).maybeSingle();
  if (!b) return { queued: false, reason: "booking not found" };
  if (b.status !== "checked_out") return { queued: false, reason: `status ${b.status}` };
  if (b.review_requested_at) return { queued: false, reason: "already requested" };
  const guest = (Array.isArray(b.guests) ? b.guests[0] : b.guests) as { first_name: string | null; email: string | null; language: string | null } | null;
  if (!b.guest_id || !guest?.email) return { queued: false, reason: "no guest email" };
  const token = generatePortalToken();
  const { error } = await admin.from("booking_access_tokens").insert({ booking_id: b.id, property_id: b.property_id, token_hash: hashPortalToken(token), expires_at: portalExpiry(b.check_out as string).toISOString() });
  if (error) return { queued: false, reason: error.message };
  const url = `${(process.env.NEXT_PUBLIC_APP_URL || origin).replace(/\/$/, "")}/review/${token}`;
  await admin.from("guest_communications").insert({
    guest_id: b.guest_id,
    type: "email",
    direction: "outbound",
    subject: `How was your stay? (${b.reference})`,
    body: `Dear ${guest.first_name ?? "guest"},\n\nThank you for staying with us. It would help us a great deal if you could take a minute to review your stay:\n${url}\n\nThe link is private to your booking and works for seven days.\n\nWarm regards,\nThe team`,
    status: "draft",
    metadata: { kind: "review_request", booking_id: b.id, url, language: guest.language ?? "en" },
  });
  await admin.from("bookings").update({ review_requested_at: new Date().toISOString() }).eq("id", b.id);
  return { queued: true };
}

export interface ReviewRow {
  id: string;
  source: string;
  reviewer_name: string | null;
  overall_rating: number;
  title: string | null;
  body: string | null;
  language: string | null;
  response: string | null;
  created_at: string;
}

const LANG_NAMES: Record<string, string> = { en: "English", de: "German", pl: "Polish", ru: "Russian", cs: "Czech", fr: "French", it: "Italian", es: "Spanish", nl: "Dutch", ar: "Arabic" };

/** A courteous reply without the model: used when no key is configured or the call fails. */
export function templateReply(r: Pick<ReviewRow, "reviewer_name" | "overall_rating" | "title" | "body">, propertyName: string): string {
  const name = r.reviewer_name ? `Dear ${r.reviewer_name}` : "Dear guest";
  if (r.overall_rating >= 4) return `${name}, thank you for taking the time to share your experience at ${propertyName}. We are delighted you enjoyed your stay and look forward to welcoming you back.`;
  if (r.overall_rating >= 3) return `${name}, thank you for your honest feedback on your stay at ${propertyName}. We are glad some things went well and sorry others fell short; your comments have been passed to the team so we can do better. We hope to welcome you again.`;
  return `${name}, thank you for telling us about your stay at ${propertyName}, and we are sorry it did not meet your expectations. We take this seriously: the points you raise have gone straight to the management team. Please contact us directly so we can make things right.`;
}

/**
 * Draft a reply with Claude in the review's language; falls back to the
 * template. The draft is stored for a person to approve and post.
 */
export async function draftReviewReply(admin: SupabaseClient, reviewId: string, propertyName: string): Promise<{ draft: string; model: string | null }> {
  const { data: r } = await admin.from("reviews").select("id, source, reviewer_name, overall_rating, title, body, language, response, created_at").eq("id", reviewId).maybeSingle();
  if (!r) throw new Error("REVIEW_NOT_FOUND");
  const review = r as ReviewRow;
  let draft = templateReply(review, propertyName);
  let model: string | null = null;
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 45_000 });
      model = process.env.CONCIERGE_MODEL || process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
      const lang = LANG_NAMES[(review.language || "en").slice(0, 2)] || "the language of the review";
      const res = await client.beta.messages.create({
        model,
        max_tokens: 1024,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low" },
        system: `You write replies to guest reviews on behalf of ${propertyName}, a serviced-apartment resort in Hurghada. Reply in ${lang}. Three to five sentences, warm and specific to what the guest wrote, never defensive, never promising compensation, no discounts, no emojis, no markdown. Sign off as "The ${propertyName} team". Output only the reply.`,
        messages: [{ role: "user", content: `Review from ${review.reviewer_name || "a guest"} on ${review.source}, rating ${review.overall_rating}/5.\nTitle: ${review.title || "(none)"}\n\n${review.body || "(no text)"}` }],
      });
      const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();
      if (res.stop_reason !== "refusal" && text) draft = text;
    } catch (err) {
      logger.warn({ err: String(err) }, "[sales-ops] review draft fell back to template");
    }
  }
  await admin.from("reviews").update({ reply_draft: draft, reply_drafted_at: new Date().toISOString() }).eq("id", reviewId);
  return { draft, model };
}

export { buildPortalUrl };
