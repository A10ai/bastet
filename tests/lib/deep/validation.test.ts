import { describe, it, expect } from "vitest";
/** Zod schemas: inputs that should be rejected. Each test asserts the safe behaviour. */
import {
  createBookingSchema, reportQuerySchema, createInvoiceSchema, paymentSchema, createExpenseSchema,
  staffScheduleSchema, updateGroupSchema, quoteStaySchema, posTicketSchema, groupDatesError,
} from "@/lib/validation";

const uuid = "11111111-1111-4111-8111-111111111111";

describe("createBookingSchema", () => {
  it("rejects check_out before check_in", () => {
    expect(createBookingSchema.safeParse({ apartment_id: uuid, check_in: "2026-11-10", check_out: "2026-11-01" }).success).toBe(false);
  });
  it("rejects impossible calendar dates (31 Feb)", () => {
    expect(createBookingSchema.safeParse({ apartment_id: uuid, check_in: "2026-02-31", check_out: "2026-03-02" }).success).toBe(false);
  });
});

describe("quoteStaySchema", () => {
  it("rejects impossible calendar dates (2026-13-45)", () => {
    expect(quoteStaySchema.safeParse({ apartment_type_id: uuid, check_in: "2026-13-01", check_out: "2026-13-45" }).success).toBe(false);
  });
});

describe("reportQuerySchema", () => {
  it("rejects an inverted range", () => {
    expect(reportQuerySchema.safeParse({ type: "occupancy", from: "2026-12-31", to: "2026-01-01" }).success).toBe(false);
  });
  it("rejects an absurd range (1000 years -> 365k-day loop in getOccupancyReport)", () => {
    expect(reportQuerySchema.safeParse({ type: "occupancy", from: "1000-01-01", to: "2999-12-31" }).success).toBe(false);
  });
});

describe("money schemas", () => {
  it("createInvoiceSchema rejects Infinity from JSON 1e999", () => {
    const body = JSON.parse('{"line_items":[{"description":"x","quantity":1,"unit_price_gbp":1e999}],"due_date":"2026-11-01"}');
    expect(createInvoiceSchema.safeParse(body).success).toBe(false);
  });
  it("createInvoiceSchema rejects sub-penny prices", () => {
    expect(createInvoiceSchema.safeParse({ line_items: [{ description: "x", quantity: 1, unit_price_gbp: 10.005 }], due_date: "2026-11-01" }).success).toBe(false);
  });
  it("createInvoiceSchema rejects zero-quantity line", () => {
    expect(createInvoiceSchema.safeParse({ line_items: [{ description: "x", quantity: 0, unit_price_gbp: 10 }], due_date: "2026-11-01" }).success).toBe(false);
  });
  it("paymentSchema rejects an unbounded amount", () => {
    expect(paymentSchema.safeParse({ amount_gbp: 1e15, method: "cash" }).success).toBe(false);
  });
  it("paymentSchema rejects sub-penny amounts", () => {
    expect(paymentSchema.safeParse({ amount_gbp: 0.015, method: "cash" }).success).toBe(false);
  });
  it("createExpenseSchema requires some amount", () => {
    expect(createExpenseSchema.safeParse({ category: "x", description: "y", expense_date: "2026-10-01" }).success).toBe(false);
  });
});

describe("other schemas", () => {
  it("staffScheduleSchema rejects shift_end before shift_start / non-times", () => {
    expect(staffScheduleSchema.safeParse({ date: "2026-10-01", shift_start: "banana", shift_end: "07:00" }).success).toBe(false);
  });
  it("a lone check_out is checked against the stored check_in (PATCH /groups/:id)", () => {
    // The schema alone cannot see the stored dates; groupDatesError checks the merged result.
    expect(updateGroupSchema.safeParse({ check_out: "2000-01-01" }).success).toBe(true);
    const stored = { check_in: "2026-11-01", check_out: "2026-11-05", cutoff_date: null };
    expect(groupDatesError(stored, { check_out: "2000-01-01" })).toMatch(/after check_in/);
    expect(groupDatesError(stored, { check_in: "2026-11-06" })).toMatch(/after check_in/);
    expect(groupDatesError(stored, { check_out: "2026-11-08" })).toBeNull();
  });
  it("posTicketSchema rejects fractional quantities like 0.001", () => {
    expect(posTicketSchema.safeParse({ outlet_id: uuid, room_number: "101", items: [{ name: "Water", unit_price_gbp: 2, quantity: 0.001 }] }).success).toBe(false);
  });
});
