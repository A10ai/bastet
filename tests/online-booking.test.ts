// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import Stripe from "stripe";
import { createFakeSupabase } from "./__mocks__/supabase-fake";
import {
  computeDeposit, cancellationAssessment, daysUntil, holdRemainingMs, publicBookingView, searchAvailability,
  upsertOnlineGuest, DEFAULT_SALES_SETTINGS, type OnlineBookingRow,
} from "@/lib/online-booking";
import { onlineBookingSchema, onlineAvailabilitySchema } from "@/lib/validation";
import { toMinorUnits, fromMinorUnits, depositFromIntent } from "@/lib/stripe";

const settings = { property_id: "p1", ...DEFAULT_SALES_SETTINGS };
const flexible = { id: "rp", code: "BAR", name: "Best Available Rate", pricing_mode: "bar" as const, adjustment: 0, cancellation_policy: "flexible" as const, free_cancellation_days: 1, includes_breakfast: false, min_nights: 1, max_nights: null };
const nonRefundable = { ...flexible, code: "NR", name: "Non-refundable", cancellation_policy: "non_refundable" as const, free_cancellation_days: 0 };

describe("deposit policy", () => {
  it("takes the property percentage but never less than one night", () => {
    // 20% of 500 over 5 nights = 100 = one night
    expect(computeDeposit(500, 5, settings, flexible)).toBe(100);
    // 20% of 300 over 10 nights = 60 < one night (30)? no: one night is 30, so 60 stands
    expect(computeDeposit(300, 10, settings, flexible)).toBe(60);
    // 20% of 200 over 1 night = 40 < one night (200) -> full night
    expect(computeDeposit(200, 1, settings, flexible)).toBe(200);
  });
  it("charges non-refundable rates in full and caps at the total", () => {
    expect(computeDeposit(750, 3, settings, nonRefundable)).toBe(750);
    expect(computeDeposit(750, 3, { deposit_percent: 100 }, flexible)).toBe(750);
    expect(computeDeposit(0, 3, settings, flexible)).toBe(0);
  });
});

describe("cancellation rules", () => {
  const now = new Date("2027-03-01T10:00:00Z");
  it("is free while nothing has been paid on a pending hold", () => {
    const a = cancellationAssessment({ status: "pending", check_in: "2027-03-02", rate_plan_snapshot: nonRefundable }, 0, now);
    expect(a).toMatchObject({ allowed: true, free: true });
  });
  it("follows the free-cancellation window of the stored plan", () => {
    expect(cancellationAssessment({ status: "confirmed", check_in: "2027-03-10", rate_plan_snapshot: flexible }, 120, now).allowed).toBe(true);
    expect(cancellationAssessment({ status: "confirmed", check_in: "2027-03-02", rate_plan_snapshot: flexible }, 120, now).allowed).toBe(true); // 1 day before, limit 1
    expect(cancellationAssessment({ status: "confirmed", check_in: "2027-03-01", rate_plan_snapshot: flexible }, 120, now).allowed).toBe(false);
  });
  it("never cancels a paid non-refundable or a stay that has started", () => {
    expect(cancellationAssessment({ status: "confirmed", check_in: "2027-06-01", rate_plan_snapshot: nonRefundable }, 500, now).allowed).toBe(false);
    expect(cancellationAssessment({ status: "checked_in", check_in: "2027-02-28", rate_plan_snapshot: flexible }, 500, now).allowed).toBe(false);
  });
  it("counts whole days in UTC", () => {
    expect(daysUntil("2027-03-02", now)).toBe(1);
    expect(daysUntil("2027-02-28", now)).toBe(-1);
    expect(holdRemainingMs("2027-03-01T10:30:00Z", now)).toBe(30 * 60 * 1000);
    expect(holdRemainingMs("2027-03-01T09:00:00Z", now)).toBe(0);
    expect(holdRemainingMs(null, now)).toBe(0);
  });
});

describe("public booking view", () => {
  const booking: OnlineBookingRow = {
    id: "b1", reference: "BST-2027-0001", status: "pending", property_id: "p1", apartment_id: "a1", guest_id: "g1",
    check_in: "2027-07-01", check_out: "2027-07-08", nights: 7, adults: 2, children: 1, total_amount_gbp: "1050.00", rate_per_night_gbp: "150.00",
    rate_plan_snapshot: flexible, hold_expires_at: "2027-03-01T10:30:00Z", guest_currency: "EUR", locale: "de", source: "web",
  };
  it("exposes what the guest needs and nothing internal", () => {
    const v = publicBookingView(booking, 0, settings, new Date("2027-03-01T10:00:00Z"));
    expect(v.deposit_gbp).toBe(210);
    expect(v.due_now_gbp).toBe(210);
    expect(v.balance_gbp).toBe(1050);
    expect(v.hold_remaining_ms).toBe(30 * 60 * 1000);
    expect(v.rate_plan?.cancellation).toContain("Free cancellation");
    expect(Object.keys(v)).not.toContain("apartment_id");
    expect(Object.keys(v)).not.toContain("guest_id");
  });
  it("shows nothing due once confirmed and paid", () => {
    const v = publicBookingView({ ...booking, status: "confirmed", hold_expires_at: null }, 210, settings);
    expect(v.due_now_gbp).toBe(0);
    expect(v.paid_gbp).toBe(210);
    expect(v.balance_gbp).toBe(840);
  });
});

describe("availability search", () => {
  const types = [
    { id: "t1", property_id: "p1", name: "Studio", slug: "studio", description: null, bedrooms: 0, bathrooms: 1, max_occupancy: 2, size_sqm: 35, amenities: ["wifi"], base_weekly_rate_gbp: 700 },
    { id: "t2", property_id: "p1", name: "Two bedroom", slug: "two-bed", description: "Sea view", bedrooms: 2, bathrooms: 2, max_occupancy: 5, size_sqm: 90, amenities: [], base_weekly_rate_gbp: 1400 },
  ];
  const quote = (typeId: string, nights: number, perNight: number) => ({
    apartment_type_id: typeId, apartment_type: typeId, check_in: "2027-07-01", check_out: "2027-07-08", nights, currency: "GBP",
    bar_total_gbp: nights * perNight, total_gbp: nights * perNight, rate_per_night_gbp: perNight, discount_percentage: 0, nightly: [], rate_plan: flexible,
  });
  it("prices free types, explains sold-out and oversize parties", async () => {
    const calls: Record<string, unknown>[] = [];
    const supabase = createFakeSupabase(
      { apartment_types: types, apartment_images: [{ apartment_type_id: "t2", url: "https://img/1.jpg", alt_text: "Sea", sort_order: 1 }] },
      {
        rpc: {
          online_availability: () => [{ apartment_type_id: "t1", available_count: 0 }, { apartment_type_id: "t2", available_count: 3 }],
          quote_stay: (args) => { calls.push(args); return quote(String(args.p_apartment_type_id), 7, 200); },
        },
      }
    );
    const offers = await searchAvailability(supabase, { propertyId: "p1", checkIn: "2027-07-01", checkOut: "2027-07-08", adults: 2, children: 0 }, settings);
    const studio = offers.find((o) => o.apartment_type.id === "t1")!;
    const twoBed = offers.find((o) => o.apartment_type.id === "t2")!;
    expect(studio.unavailable_reason).toBe("Sold out for these dates");
    expect(twoBed.available_count).toBe(3);
    expect(twoBed.quote?.total_gbp).toBe(1400);
    expect(twoBed.deposit_gbp).toBe(280);
    expect(twoBed.apartment_type.images[0].url).toBe("https://img/1.jpg");
    // every quote goes through the web channel so channel-restricted plans apply
    expect(calls.every((c) => c.p_channel_code === "web")).toBe(true);

    const big = await searchAvailability(supabase, { propertyId: "p1", checkIn: "2027-07-01", checkOut: "2027-07-08", adults: 4, children: 2 }, settings);
    expect(big.find((o) => o.apartment_type.id === "t2")!.unavailable_reason).toBe("Sleeps up to 5");
  });
  it("turns a pricing refusal into a guest-readable reason", async () => {
    const supabase = createFakeSupabase({ apartment_types: types.slice(1), apartment_images: [] }, {
      rpc: {
        online_availability: () => [{ apartment_type_id: "t2", available_count: 1 }],
        quote_stay: () => { throw new Error("MIN_NIGHTS: Best Available Rate requires at least 7 nights"); },
      },
    });
    const offers = await searchAvailability(supabase, { propertyId: "p1", checkIn: "2027-07-01", checkOut: "2027-07-03", adults: 2, children: 0 }, settings);
    expect(offers[0].quote).toBeNull();
    expect(offers[0].unavailable_reason).toBe("Best Available Rate requires at least 7 nights");
  });
});

describe("guest upsert", () => {
  it("creates a guest once per email and never overwrites an existing profile", async () => {
    const supabase = createFakeSupabase({ guests: [] });
    const a = await upsertOnlineGuest(supabase, { first_name: "Anna", last_name: "Nowak", email: "Anna@Example.com", phone: null, country: "PL", marketing_consent: false });
    expect(a.created).toBe(true);
    const b = await upsertOnlineGuest(supabase, { first_name: "A.", last_name: "N.", email: "anna@example.com", phone: "+48 600 000 000", country: "DE", marketing_consent: true });
    expect(b.created).toBe(false);
    expect(b.id).toBe(a.id);
    const { data: rows } = await supabase.from("guests").select("*");
    expect(rows).toHaveLength(1);
    expect(rows![0]).toMatchObject({ first_name: "Anna", email: "anna@example.com", phone: "+48 600 000 000", country: "PL", marketing_consent: true });
  });
});

describe("public input validation", () => {
  const good = {
    apartment_type_id: "11111111-1111-4111-8111-111111111111", check_in: "2027-07-01", check_out: "2027-07-08", adults: 2, children: 0,
    guest: { first_name: "Anna", last_name: "Nowak", email: "anna@example.com", country: "pl" }, locale: "pl", currency: "eur", accept_terms: true,
  };
  it("accepts a complete booking and normalises country and currency", () => {
    const r = onlineBookingSchema.safeParse(good);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.guest.country).toBe("PL");
      expect(r.data.currency).toBe("EUR");
      expect(r.data.source).toBe("web");
    }
  });
  it("refuses bookings without accepted terms, with bad dates or unknown locales", () => {
    expect(onlineBookingSchema.safeParse({ ...good, accept_terms: false }).success).toBe(false);
    expect(onlineBookingSchema.safeParse({ ...good, check_out: "2027-07-01" }).success).toBe(false);
    expect(onlineBookingSchema.safeParse({ ...good, locale: "fr" }).success).toBe(false);
    expect(onlineBookingSchema.safeParse({ ...good, guest: { ...good.guest, email: "not-an-email" } }).success).toBe(false);
  });
  it("coerces query-string numbers for the availability search", () => {
    const r = onlineAvailabilitySchema.safeParse({ check_in: "2027-07-01", check_out: "2027-07-08", adults: "3", children: "1" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.adults).toBe(3);
  });
});

describe("stripe helpers", () => {
  beforeEach(() => { vi.unstubAllEnvs(); });
  it("converts to and from minor units per currency", () => {
    expect(toMinorUnits(210.5, "GBP")).toBe(21050);
    expect(toMinorUnits(1234, "JPY")).toBe(1234);
    expect(fromMinorUnits(21050, "gbp")).toBe(210.5);
  });
  it("reads the GBP amount for the folio back out of the intent metadata", () => {
    const intent = { id: "pi_1", currency: "eur", amount: 24500, amount_received: 24500, metadata: { booking_id: "b1", reference: "BST-1", amount_gbp: "210.00", fx_rate: "1.1667", purpose: "deposit" } } as unknown as Stripe.PaymentIntent;
    expect(depositFromIntent(intent)).toEqual({ bookingId: "b1", reference: "pi_1", amountGbp: 210, amountOriginal: 245, currency: "EUR", fxRate: 1.1667 });
    const gbp = { id: "pi_2", currency: "gbp", amount: 21000, amount_received: 21000, metadata: { booking_id: "b2" } } as unknown as Stripe.PaymentIntent;
    expect(depositFromIntent(gbp).amountGbp).toBe(210);
  });
  it("verifies webhook signatures with the configured secret and rejects tampering", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test_secret");
    const { constructWebhookEvent } = await import("@/lib/stripe");
    const payload = JSON.stringify({ id: "evt_1", object: "event", type: "payment_intent.succeeded", data: { object: { id: "pi_1", object: "payment_intent" } } });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_test_secret" });
    expect(constructWebhookEvent(payload, header).type).toBe("payment_intent.succeeded");
    expect(() => constructWebhookEvent(payload.replace("pi_1", "pi_2"), header)).toThrow();
    expect(() => constructWebhookEvent(payload, Stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_other" }))).toThrow();
  });
});
