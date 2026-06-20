import { describe, it, expect } from "vitest";
import { calculateBookingTotal, calculateNights } from "@/lib/booking-engine";
import { calculateInvoiceTotals, getInvoicePaymentStatus } from "@/lib/finance-engine";

describe("calculateBookingTotal", () => {
  it("calculates total for 1-night stay (no discount)", () => {
    const result = calculateBookingTotal(100, 1);
    expect(result.subtotal).toBe(100);
    expect(result.discount).toBe(0);
    expect(result.total).toBe(100);
    expect(result.discount_percentage).toBe(0);
  });

  it("calculates total for 7-night stay (5% discount)", () => {
    const result = calculateBookingTotal(100, 7);
    expect(result.subtotal).toBe(700);
    expect(result.discount).toBe(35);
    expect(result.total).toBe(665);
    expect(result.discount_percentage).toBe(5);
  });

  it("calculates total for 14-night stay (10% discount)", () => {
    const result = calculateBookingTotal(100, 14);
    expect(result.subtotal).toBe(1400);
    expect(result.discount).toBe(140);
    expect(result.total).toBe(1260);
    expect(result.discount_percentage).toBe(10);
  });

  it("calculates total for 28-night stay (20% discount)", () => {
    const result = calculateBookingTotal(100, 28);
    expect(result.subtotal).toBe(2800);
    expect(result.discount).toBe(560);
    expect(result.total).toBe(2240);
    expect(result.discount_percentage).toBe(20);
  });

  it("handles fractional nightly rates", () => {
    const result = calculateBookingTotal(57.5, 3);
    expect(result.subtotal).toBe(172.5);
    expect(result.discount).toBe(0);
    expect(result.total).toBe(172.5);
  });

  it("handles 0 nights", () => {
    const result = calculateBookingTotal(100, 0);
    expect(result.subtotal).toBe(0);
    expect(result.discount).toBe(0);
    expect(result.total).toBe(0);
  });

  it("rounds to 2 decimal places", () => {
    const result = calculateBookingTotal(33.33, 7);
    // 33.33 * 7 = 233.31, discount 5% = 11.6655, total = 221.6445
    expect(result.total).toBe(Math.round(221.6445 * 100) / 100);
  });
});

describe("calculateNights", () => {
  it("calculates nights between two dates", () => {
    expect(calculateNights("2026-06-01", "2026-06-08")).toBe(7);
  });

  it("returns 0 for same day", () => {
    expect(calculateNights("2026-06-01", "2026-06-01")).toBe(0);
  });

  it("calculates across month boundary", () => {
    expect(calculateNights("2026-06-28", "2026-07-05")).toBe(7);
  });

  it("calculates across year boundary", () => {
    expect(calculateNights("2026-12-28", "2027-01-04")).toBe(7);
  });

  it("handles 1-night stay", () => {
    expect(calculateNights("2026-06-01", "2026-06-02")).toBe(1);
  });

  it("handles long stays", () => {
    expect(calculateNights("2026-01-01", "2026-12-31")).toBe(364); // 2026 is not a leap year
  });
});

describe("calculateInvoiceTotals", () => {
  it("calculates subtotal, tax, and total for line items", () => {
    const result = calculateInvoiceTotals(
      [
        { quantity: 2, unit_price_gbp: 50 },
        { quantity: 1, unit_price_gbp: 100 },
      ],
      0.2
    );
    expect(result.subtotal_gbp).toBe(200);
    expect(result.tax_amount_gbp).toBe(40);
    expect(result.total_gbp).toBe(240);
  });

  it("defaults tax rate to 0", () => {
    const result = calculateInvoiceTotals([
      { quantity: 1, unit_price_gbp: 100 },
    ]);
    expect(result.subtotal_gbp).toBe(100);
    expect(result.tax_amount_gbp).toBe(0);
    expect(result.total_gbp).toBe(100);
  });

  it("handles empty line items", () => {
    const result = calculateInvoiceTotals([], 0.2);
    expect(result.subtotal_gbp).toBe(0);
    expect(result.tax_amount_gbp).toBe(0);
    expect(result.total_gbp).toBe(0);
  });

  it("handles fractional prices", () => {
    const result = calculateInvoiceTotals(
      [{ quantity: 3, unit_price_gbp: 33.33 }],
      0.15
    );
    // subtotal = 99.99, tax = 14.9985, total = 114.9885
    expect(result.subtotal_gbp).toBe(99.99);
    expect(result.tax_amount_gbp).toBe(Math.round(14.9985 * 100) / 100);
  });

  it("handles zero quantity", () => {
    const result = calculateInvoiceTotals(
      [{ quantity: 0, unit_price_gbp: 100 }],
      0.1
    );
    expect(result.subtotal_gbp).toBe(0);
    expect(result.tax_amount_gbp).toBe(0);
    expect(result.total_gbp).toBe(0);
  });
});

describe("getInvoicePaymentStatus", () => {
  it("returns 'paid' when payments >= total", () => {
    expect(getInvoicePaymentStatus(100, 100)).toBe("paid");
    expect(getInvoicePaymentStatus(100, 150)).toBe("paid");
  });

  it("returns 'partially_paid' when 0 < payments < total", () => {
    expect(getInvoicePaymentStatus(100, 50)).toBe("partially_paid");
    expect(getInvoicePaymentStatus(100, 1)).toBe("partially_paid");
    expect(getInvoicePaymentStatus(100, 99.99)).toBe("partially_paid");
  });

  it("returns 'sent' when payments = 0", () => {
    expect(getInvoicePaymentStatus(100, 0)).toBe("sent");
  });

  it("handles zero total", () => {
    expect(getInvoicePaymentStatus(0, 0)).toBe("paid");
  });
});