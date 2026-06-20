import { describe, it, expect } from "vitest";
import { STAFF_ROLES, BOOKING_STATUSES, APARTMENT_STATUSES } from "@/lib/constants";

describe("STAFF_ROLES constant", () => {
  it("contains all expected roles", () => {
    expect(STAFF_ROLES).toContain("owner");
    expect(STAFF_ROLES).toContain("manager");
    expect(STAFF_ROLES).toContain("receptionist");
    expect(STAFF_ROLES).toContain("housekeeping");
    expect(STAFF_ROLES).toContain("maintenance");
    expect(STAFF_ROLES).toContain("admin");
  });

  it("has exactly 6 roles", () => {
    expect(STAFF_ROLES.length).toBe(6);
  });
});

describe("BOOKING_STATUSES constant", () => {
  it("contains all expected statuses", () => {
    expect(BOOKING_STATUSES).toContain("pending");
    expect(BOOKING_STATUSES).toContain("confirmed");
    expect(BOOKING_STATUSES).toContain("checked_in");
    expect(BOOKING_STATUSES).toContain("checked_out");
    expect(BOOKING_STATUSES).toContain("cancelled");
    expect(BOOKING_STATUSES).toContain("no_show");
  });

  it("has exactly 6 statuses", () => {
    expect(BOOKING_STATUSES.length).toBe(6);
  });
});

describe("APARTMENT_STATUSES constant", () => {
  it("contains all expected statuses", () => {
    expect(APARTMENT_STATUSES).toContain("available");
    expect(APARTMENT_STATUSES).toContain("occupied");
    expect(APARTMENT_STATUSES).toContain("maintenance");
    expect(APARTMENT_STATUSES).toContain("cleaning");
    expect(APARTMENT_STATUSES).toContain("blocked");
    expect(APARTMENT_STATUSES).toContain("out_of_service");
  });

  it("has exactly 6 statuses", () => {
    expect(APARTMENT_STATUSES.length).toBe(6);
  });
});