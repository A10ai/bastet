import { describe, it, expect } from "vitest";
import { createGroupSchema, updateGroupSchema, addGroupRoomsSchema, groupPaymentSchema, cancelGroupSchema } from "@/lib/validation";

const U = (n: number) => `6f1c2a3e-1b2c-4d5e-8f90-12345678900${n}`;

describe("group booking validation", () => {
  it("creates a group with defaults and optional room block", () => {
    const r = createGroupSchema.safeParse({ name: "Wedding party", check_in: "2026-12-10", check_out: "2026-12-13", apartment_ids: [U(1), U(2)] });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.status).toBe("tentative");
      expect(r.data.billing_mode).toBe("individual");
      expect(r.data.adults).toBe(2);
    }
  });

  it("rejects inverted dates, a cutoff after arrival and a cancelled status on create", () => {
    expect(createGroupSchema.safeParse({ name: "Bad", check_in: "2026-12-13", check_out: "2026-12-10" }).success).toBe(false);
    expect(createGroupSchema.safeParse({ name: "Bad", check_in: "2026-12-10", check_out: "2026-12-13", cutoff_date: "2026-12-11" }).success).toBe(false);
    expect(createGroupSchema.safeParse({ name: "Bad", check_in: "2026-12-10", check_out: "2026-12-13", status: "cancelled" }).success).toBe(false);
  });

  it("updates allow completing a group but never re-blocking rooms through PATCH", () => {
    expect(updateGroupSchema.safeParse({ status: "completed" }).success).toBe(true);
    const r = updateGroupSchema.safeParse({ apartment_ids: [U(1)], name: "Renamed" });
    expect(r.success).toBe(true);
    if (r.success) expect("apartment_ids" in r.data).toBe(false);
  });

  it("room additions need at least one apartment and matching guest ids", () => {
    expect(addGroupRoomsSchema.safeParse({ apartment_ids: [] }).success).toBe(false);
    expect(addGroupRoomsSchema.safeParse({ apartment_ids: [U(1), U(2)], guest_ids: [U(3)] }).success).toBe(false);
    expect(addGroupRoomsSchema.safeParse({ apartment_ids: [U(1), U(2)], guest_ids: [U(3), null] }).success).toBe(true);
  });

  it("payments need a positive amount and a known method; cancellation needs a reason", () => {
    expect(groupPaymentSchema.safeParse({ amount_gbp: 0, method: "cash" }).success).toBe(false);
    expect(groupPaymentSchema.safeParse({ amount_gbp: 120.5, method: "paypal" }).success).toBe(false);
    expect(groupPaymentSchema.safeParse({ amount_gbp: 120.5, method: "bank_transfer", reference: "INV-1" }).success).toBe(true);
    expect(cancelGroupSchema.safeParse({ reason: "no" }).success).toBe(false);
    expect(cancelGroupSchema.safeParse({ reason: "Operator cancelled the series" }).success).toBe(true);
  });
});
