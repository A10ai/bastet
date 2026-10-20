import { describe, it, expect } from "vitest";
import { posOutletSchema, posItemSchema, posTicketSchema, voidPosTicketSchema } from "@/lib/validation";

const U = "6f1c2a3e-1b2c-4d5e-8f90-123456789001";

describe("point of sale validation", () => {
  it("outlets and items validate with sensible defaults", () => {
    const o = posOutletSchema.safeParse({ code: "pool", name: "Pool Bar", type: "bar" });
    expect(o.success).toBe(true);
    if (o.success) expect(o.data.is_active).toBe(true);
    expect(posOutletSchema.safeParse({ code: "p", name: "X" }).success).toBe(false);
    expect(posItemSchema.safeParse({ name: "Beer", unit_price_gbp: -1 }).success).toBe(false);
    expect(posItemSchema.safeParse({ name: "Beer", unit_price_gbp: 3.5, tax_rate_percent: 14 }).success).toBe(true);
  });

  it("a ticket needs a room or booking and items from the catalogue or with a name and price", () => {
    expect(posTicketSchema.safeParse({ outlet_id: U, items: [{ item_id: U }] }).success).toBe(false);
    expect(posTicketSchema.safeParse({ outlet_id: U, room_number: "B416", items: [] }).success).toBe(false);
    expect(posTicketSchema.safeParse({ outlet_id: U, room_number: "B416", items: [{ name: "Tip" }] }).success).toBe(false);
    const ok = posTicketSchema.safeParse({ outlet_id: U, room_number: "B416", items: [{ item_id: U, quantity: 2 }, { name: "Tip", unit_price_gbp: 1, tax_rate_percent: 0 }] });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.items[1].quantity).toBe(1);
  });

  it("voiding needs a reason", () => {
    expect(voidPosTicketSchema.safeParse({ reason: "no" }).success).toBe(false);
    expect(voidPosTicketSchema.safeParse({ reason: "Wrong room" }).success).toBe(true);
  });
});
