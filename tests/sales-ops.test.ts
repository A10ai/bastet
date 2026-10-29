// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { createFakeSupabase } from "./__mocks__/supabase-fake";
import { isoWeekBounds, proofNarrative, templateReply, requestReview, snapshotProof, type ProofMetrics } from "@/lib/sales-ops";
import { publicReviewSchema, importReviewsSchema, salesAccountSchema } from "@/lib/validation";

vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn(async () => 1) }));

const metrics: ProofMetrics = {
  period_start: "2027-07-05", period_end: "2027-07-12", days: 7, rooms: 100, available_room_nights: 700, room_nights: 420, occupancy: 0.6, room_revenue_gbp: 25200, adr_gbp: 60, revpar_gbp: 36,
  channels: [{ code: "web", name: "Website", commission_rate: 0, room_nights: 250, revenue_gbp: 16000 }, { code: "booking_com", name: "Booking.com", commission_rate: 15, room_nights: 170, revenue_gbp: 9200 }],
  direct_share: 0.6, online_share: 1, by_source: { web: 250, channel: 170 }, markets: [{ market: "DE", room_nights: 200, revenue_gbp: 12000 }, { market: "PL", room_nights: 120, revenue_gbp: 7000 }],
  pickup: { bookings: 34, room_nights: 210, revenue_gbp: 13000 }, cancellations: 2, reviews: { new: 5, avg_rating: 4.6, unanswered: 2 }, reviews_all_time: { count: 40, avg_rating: 4.5 }, concierge: { sessions: 12, bookings: 3 },
};

describe("proof report", () => {
  it("ISO weeks run Monday to Monday in UTC", () => {
    expect(isoWeekBounds(new Date("2027-07-08T15:00:00Z"))).toEqual({ start: "2027-07-05", end: "2027-07-12" });
    expect(isoWeekBounds(new Date("2027-07-05T00:00:00Z"))).toEqual({ start: "2027-07-05", end: "2027-07-12" });
    expect(isoWeekBounds(new Date("2027-07-11T23:59:00Z"))).toEqual({ start: "2027-07-05", end: "2027-07-12" });
  });
  it("writes the week in plain words with the comparison and the operator-facing numbers", () => {
    const text = proofNarrative(metrics, { ...metrics, occupancy: 0.5, adr_gbp: 50 });
    expect(text).toContain("occupancy 60% (420 of 700 room nights), ADR 60 GBP, RevPAR 36 GBP");
    expect(text).toContain("occupancy +20%, ADR +20%");
    expect(text).toContain("Direct share 60%, online share 100%");
    expect(text).toContain("Top channels: Website 250 nights, Booking.com 170 nights");
    expect(text).toContain("Top markets by room nights: DE 200, PL 120");
    expect(text).toContain("5 new reviews, average 4.6/5, 2 awaiting a reply");
    expect(text).toContain("Concierge: 12 conversations, 3 holds created");
  });
  it("stores one snapshot per week and notifies, and is idempotent", async () => {
    const sb = createFakeSupabase({ sales_reports: [] }, { rpc: { sales_weekly_proof: () => metrics } });
    const a = await snapshotProof(sb, "p1", "2027-07-05", "2027-07-12");
    expect(a.created).toBe(true);
    expect(a.narrative).toContain("occupancy 60%");
    const b = await snapshotProof(sb, "p1", "2027-07-05", "2027-07-12");
    expect(b.created).toBe(false);
    expect(b.id).toBe(a.id);
    const { data } = await sb.from("sales_reports").select("*");
    expect(data).toHaveLength(1);
  });
});

describe("reviews", () => {
  it("queues a review request once, only after check-out and only with an email", async () => {
    const sb = createFakeSupabase({
      bookings: [
        { id: "b1", property_id: "p1", reference: "BAS-1", status: "checked_out", check_out: "2027-07-12", guest_id: "g1", review_requested_at: null, guests: { first_name: "Anna", email: "anna@example.com", language: "pl" } },
        { id: "b2", property_id: "p1", reference: "BAS-2", status: "checked_in", check_out: "2027-07-20", guest_id: "g2", review_requested_at: null, guests: { first_name: "Jan", email: "jan@example.com", language: "cs" } },
        { id: "b3", property_id: "p1", reference: "BAS-3", status: "checked_out", check_out: "2027-07-12", guest_id: "g3", review_requested_at: null, guests: { first_name: "No", email: null, language: "en" } },
      ],
      booking_access_tokens: [], guest_communications: [],
    });
    expect(await requestReview(sb, "b1", "https://app.test")).toEqual({ queued: true });
    expect((await requestReview(sb, "b1", "https://app.test")).reason).toBe("already requested");
    expect((await requestReview(sb, "b2", "https://app.test")).reason).toBe("status checked_in");
    expect((await requestReview(sb, "b3", "https://app.test")).reason).toBe("no guest email");
    const { data: comms } = await sb.from("guest_communications").select("*");
    expect(comms).toHaveLength(1);
    expect(comms![0]).toMatchObject({ guest_id: "g1", type: "email", status: "draft" });
    expect(String(comms![0].body)).toMatch(/https:\/\/app\.test\/review\/[A-Za-z0-9_-]{43}/);
    const { data: tokens } = await sb.from("booking_access_tokens").select("*");
    expect(tokens).toHaveLength(1);
  });
  it("template replies match the rating band and never promise compensation", () => {
    const good = templateReply({ reviewer_name: "Anna", overall_rating: 5, title: null, body: null }, "Bastet");
    const mid = templateReply({ reviewer_name: null, overall_rating: 3, title: null, body: null }, "Bastet");
    const bad = templateReply({ reviewer_name: "Jan", overall_rating: 1, title: null, body: null }, "Bastet");
    expect(good).toContain("Dear Anna");
    expect(good).toContain("delighted");
    expect(mid).toContain("Dear guest");
    expect(bad).toContain("sorry");
    for (const t of [good, mid, bad]) expect(t).not.toMatch(/refund|discount|compensat/i);
  });
  it("validates public and imported reviews on the 1-5 scale", () => {
    expect(publicReviewSchema.safeParse({ overall_rating: 5, consent_public: true }).success).toBe(true);
    expect(publicReviewSchema.safeParse({ overall_rating: 9 }).success).toBe(false);
    expect(importReviewsSchema.safeParse({ reviews: [{ source: "booking_com", external_id: "x1", overall_rating: 4 }] }).success).toBe(true);
    expect(importReviewsSchema.safeParse({ reviews: [{ source: "tiktok", external_id: "x1", overall_rating: 4 }] }).success).toBe(false);
  });
});

describe("operator pipeline", () => {
  it("accepts an inbound operator with defaults and normalises the market code", () => {
    const r = salesAccountSchema.safeParse({ name: "TUI Deutschland", market: "de" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toMatchObject({ kind: "tour_operator", stage: "identified", priority: 3, source: "inbound", market: "DE" });
    expect(salesAccountSchema.safeParse({ name: "X", stage: "won" }).success).toBe(false);
  });
});
