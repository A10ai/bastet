import { describe, it, expect } from "vitest";
/** Money arithmetic: invoice/booking totals must reconcile to the penny. */
import { calculateInvoiceTotals, getInvoicePaymentStatus } from "@/lib/finance-engine";
import { calculateBookingTotal } from "@/lib/booking-engine";
import { buildJournal, summarise, toCsv, journalRows, type LedgerLine } from "@/lib/accounting";
import { getWhatIfSimulation } from "@/lib/revenue-engine";

describe("finance-engine.calculateInvoiceTotals", () => {
  it("subtotal + VAT equals total for a 58.75 line at 14% VAT", () => {
    const t = calculateInvoiceTotals([{ quantity: 1, unit_price_gbp: 58.75 }], 14);
    // 58.75 * 0.14 = 8.225 -> tax shown 8.23; total 66.975 -> shown 66.97
    expect(Math.round((t.subtotal_gbp + t.tax_amount_gbp) * 100) / 100).toBe(t.total_gbp);
  });
  it("subtotal + VAT equals total for 7 x 2.25 at 14% VAT", () => {
    const t = calculateInvoiceTotals([{ quantity: 7, unit_price_gbp: 2.25 }], 14);
    expect(Math.round((t.subtotal_gbp + t.tax_amount_gbp) * 100) / 100).toBe(t.total_gbp);
  });
  it("sum of per-line rounded totals (as stored by POST /invoices) equals subtotal with fractional quantity", () => {
    const items = [{ quantity: 1.5, unit_price_gbp: 33.33 }, { quantity: 1.5, unit_price_gbp: 33.33 }];
    const lineTotals = items.map((i) => Math.round(i.quantity * i.unit_price_gbp * 100) / 100); // invoices/route.ts:105
    const t = calculateInvoiceTotals(items, 0);
    expect(Math.round(lineTotals.reduce((a, b) => a + b, 0) * 100) / 100).toBe(t.subtotal_gbp);
  });
});

describe("finance-engine.getInvoicePaymentStatus", () => {
  it("treats two payments 100.10 + 200.20 against a 300.30 invoice as paid", () => {
    expect(getInvoicePaymentStatus(300.3, 100.1 + 200.2)).toBe("paid");
  });
});

describe("booking-engine.calculateBookingTotal", () => {
  it("subtotal - discount equals total (40.30/night x 7, 5% LOS)", () => {
    const t = calculateBookingTotal(40.3, 7);
    expect(Math.round((t.subtotal - t.discount) * 100) / 100).toBe(t.total);
  });
});

describe("revenue-engine.getWhatIfSimulation", () => {
  it("returns a finite break-even occupancy when new_rate is 0 (schema allows min 0)", () => {
    const r = getWhatIfSimulation(100, 0, 50);
    expect(Number.isFinite(r.break_even_occupancy)).toBe(true);
  });
  it("is fed a 0-100 occupancy by the UI but revenueAnalysisSchema only accepts 0-1", async () => {
    const { revenueAnalysisSchema } = await import("@/lib/validation");
    // revenue-sections.tsx sends occupancy: selectedPerf.occupancy_pct (e.g. 65.3)
    const ui = revenueAnalysisSchema.safeParse({ current_rate: 45, new_rate: 50, occupancy: 65.3, elasticity: -0.5 });
    expect(ui.success).toBe(true);
  });
  it("schema and engine agree that occupancy is a percent (80 means 80%)", async () => {
    const { revenueAnalysisSchema } = await import("@/lib/validation");
    expect(revenueAnalysisSchema.safeParse({ current_rate: 100, new_rate: 100, occupancy: 101 }).success).toBe(false);
    expect(revenueAnalysisSchema.safeParse({ current_rate: 100, new_rate: 0, occupancy: 80 }).success).toBe(false);
    const r = getWhatIfSimulation(100, 100, 80);
    expect(r.current_revenue).toBe(80);
  });
});

describe("accounting journal", () => {
  const base = { folio_id: "f", business_date: "2026-10-01", reference_type: null, reference_id: null, reversal_of: null };
  it("balances a mixed day (sanity, expected to pass)", () => {
    const lines: LedgerLine[] = [
      { ...base, id: "1", type: "room", description: "Room", debit_gbp: 58.75, credit_gbp: 0 },
      { ...base, id: "2", type: "tax", description: "VAT", debit_gbp: 8.23, credit_gbp: 0 },
      { ...base, id: "3", type: "payment", description: "Pay", debit_gbp: 0, credit_gbp: 66.98, method: "card" },
      { ...base, id: "4", type: "reversal", description: "Void VAT", debit_gbp: 0, credit_gbp: 8.23, reversed_type: "tax" },
    ];
    const s = summarise(buildJournal(lines, null));
    expect(s.balanced).toBe(true);
    expect(s.accounts.find((a) => a.account_key === "vat_output")!.net).toBe(0);
  });
  it("CSV export neutralises spreadsheet formulas in descriptions (CSV injection)", () => {
    const lines: LedgerLine[] = [{ ...base, id: "1", type: "fnb", description: "=HYPERLINK(\"http://evil\",\"x\")", debit_gbp: 5, credit_gbp: 0 }];
    const csv = toCsv(journalRows(buildJournal(lines, null)));
    const cells = csv.split("\r\n")[1];
    expect(cells).not.toMatch(/(^|,)"?=/);
  });
});
