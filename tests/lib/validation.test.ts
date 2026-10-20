import { describe, expect, it } from "vitest";
import * as v from "@/lib/validation";

const uuid = "11111111-1111-4111-8111-111111111111";
const today = new Date().toISOString().slice(0, 10);
const plus = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

describe("validation schemas", () => {
  it("accepts a valid booking and rejects bad dates", () => {
    expect(v.validateBody(v.createBookingSchema, { apartment_id: uuid, check_in: today, check_out: plus(2) }).success).toBe(true);
    expect(v.validateBody(v.createBookingSchema, { apartment_id: "nope", check_in: "2026/01/01", check_out: plus(2) }).success).toBe(false);
  });

  it("only allows confirming through PATCH", () => {
    expect(v.validateBody(v.updateBookingSchema, { status: "confirmed" }).success).toBe(true);
    expect(v.validateBody(v.updateBookingSchema, { status: "checked_in" }).success).toBe(false);
  });

  it("enforces the database enums for housekeeping, maintenance and shifts", () => {
    expect(v.validateBody(v.createHousekeepingTaskSchema, { apartment_id: uuid, type: "turndown", scheduled_date: today }).success).toBe(true);
    expect(v.validateBody(v.createHousekeepingTaskSchema, { apartment_id: uuid, type: "turnover", scheduled_date: today }).success).toBe(false);
    expect(v.validateBody(v.createMaintenanceRequestSchema, { title: "Leak", category: "furniture" }).success).toBe(true);
    expect(v.validateBody(v.createMaintenanceRequestSchema, { title: "Leak", category: "cosmetic" }).success).toBe(false);
  });

  it("validates guests, invoices, payments and staff", () => {
    expect(v.validateBody(v.createGuestSchema, { first_name: "Ada", last_name: "L", email: "ada@test.local", passport_number: "P1" }).success).toBe(true);
    expect(v.validateBody(v.createGuestSchema, { first_name: "", last_name: "L" }).success).toBe(false);
    expect(v.validateBody(v.createInvoiceSchema, { line_items: [{ description: "Room", quantity: 1, unit_price_gbp: 100 }], due_date: plus(7), tax_rate: 14 }).success).toBe(true);
    expect(v.validateBody(v.createInvoiceSchema, { line_items: [], due_date: plus(7) }).success).toBe(false);
    expect(v.validateBody(v.updateInvoiceSchema, { total_gbp: 1 }).success).toBe(false); // totals are derived
    expect(v.validateBody(v.paymentSchema, { amount_gbp: 10, method: "cash" }).success).toBe(true);
    expect(v.validateBody(v.paymentSchema, { amount_gbp: 0, method: "cash" }).success).toBe(false);
    expect(v.validateBody(v.createStaffSchema, { first_name: "A", last_name: "B", email: "a@b.co", role: "readonly" }).success).toBe(true);
    expect(v.validateBody(v.assignSchema, { staff_id: uuid }).success).toBe(true);
    expect(v.validateBody(v.assignSchema, { staff_id: "x" }).success).toBe(false);
  });

  it("validates auth payloads and password strength", () => {
    expect(v.validateBody(v.loginSchema, { email: "a@b.co", password: "x" }).success).toBe(true);
    expect(v.validateBody(v.passwordChangeSchema, { currentPassword: "old", newPassword: "short" }).success).toBe(false);
    expect(v.validateBody(v.passwordChangeSchema, { currentPassword: "old", newPassword: "LongEnough-Password1" }).success).toBe(true);
  });

  it("validates AI control payloads and checkout options", () => {
    expect(v.validateBody(v.aiBrainActionSchema, { action: "update_config", config: { mode: "autonomous" } }).success).toBe(true);
    expect(v.validateBody(v.aiBrainActionSchema, { action: "explode" }).success).toBe(false);
    expect(v.validateBody(v.checkoutSchema, { allow_outstanding_balance: true }).success).toBe(true);
    expect(v.validateBody(v.checkoutSchema, { bogus: 1 }).success).toBe(false);
    expect(v.validateBody(v.schedulerSchema, { action: "run_now" }).success).toBe(true);
    expect(v.validateBody(v.updateBookingChannelSchema, { commission_rate: 15 }).success).toBe(true);
    expect(v.validateBody(v.updateBookingChannelSchema, { commission_rate: 150 }).success).toBe(false);
  });

  it("formats zod errors readably", () => {
    const r = v.validateBody(v.createGuestSchema, { first_name: "", last_name: "" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = v.formatZodErrors(r.error);
      expect(typeof msg === "string" || typeof msg === "object").toBe(true);
      expect(JSON.stringify(msg)).toMatch(/first_name|First name/);
    }
  });

  it("every exported schema parses safely on garbage input", () => {
    for (const [name, schema] of Object.entries(v)) {
      if (name.endsWith("Schema") && schema && typeof (schema as { safeParse?: unknown }).safeParse === "function") {
        const r = (schema as { safeParse: (x: unknown) => { success: boolean } }).safeParse({ junk: true });
        expect(typeof r.success).toBe("boolean");
      }
    }
  });
});
