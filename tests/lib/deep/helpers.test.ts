import { describe, it, expect } from "vitest";
/** New helpers behind the deep-test fixes: calendar dates, CSV cells, PII scrubbing. */
import {
  addDays, businessDate, daysBetween, dayOfWeek, eachDate, isValidCalendarDate, monthEnd, monthStart,
  nightsInRange, daysInMonth,
} from "@/lib/business-date";
import { csvCell } from "@/lib/csv";
import { scrubPii } from "@/lib/pii-anonymizer";
import { BRAIN_EMITTABLE_EVENTS } from "@/lib/ai-brain";

describe("business-date", () => {
  it("does calendar arithmetic independent of TZ", () => {
    expect(daysBetween("2026-10-28", "2026-10-30")).toBe(2);
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(dayOfWeek("2026-10-30")).toBe(5);
    expect(eachDate("2026-04-22", "2026-04-26")).toHaveLength(5);
  });
  it("validates real calendar dates", () => {
    expect(isValidCalendarDate("2028-02-29")).toBe(true);
    expect(isValidCalendarDate("2026-02-29")).toBe(false);
    expect(isValidCalendarDate("2026-13-01")).toBe(false);
    expect(isValidCalendarDate("2026-1-01")).toBe(false);
  });
  it("finds month boundaries", () => {
    expect(monthStart("2026-10-15")).toBe("2026-10-01");
    expect(monthStart("2026-01-15", -1)).toBe("2025-12-01");
    expect(monthEnd("2026-02-10")).toBe("2026-02-28");
    expect(daysInMonth("2028-02-01")).toBe(29);
  });
  it("counts stay nights inside a range", () => {
    expect(nightsInRange("2026-09-27", "2026-10-07", "2026-10-01", "2026-10-31")).toBe(6);
    expect(nightsInRange("2026-09-27", "2026-10-07", "2026-09-01", "2026-09-30")).toBe(4);
    expect(nightsInRange("2026-09-25", "2026-10-01", "2026-10-01", "2026-10-31")).toBe(0);
  });
  it("gives the Cairo date when UTC is still on the previous day", () => {
    expect(businessDate("Africa/Cairo", new Date("2026-10-27T22:30:00Z"))).toBe("2026-10-28");
    expect(businessDate("UTC", new Date("2026-10-27T22:30:00Z"))).toBe("2026-10-27");
    expect(businessDate("Not/AZone", new Date("2026-10-27T22:30:00Z"))).toBe("2026-10-28");
  });
});

describe("csvCell", () => {
  it("neutralises formula-leading text but leaves numbers alone", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("-12.50")).toBe("-12.50");
    expect(csvCell(-3)).toBe("-3");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell(null)).toBe("");
  });
});

describe("scrubPii", () => {
  it("removes PII keys at any depth and keeps operational fields", () => {
    const out = scrubPii({ a: [{ guest: { first_name: "Ada", loyalty_tier: "gold" }, special_requests: "x", apartment: { number: "101" } }] });
    expect(out).toEqual({ a: [{ guest: { loyalty_tier: "gold" }, apartment: { number: "101" } }] });
  });
});

describe("ai-brain event allowlist", () => {
  it("lists exactly the events named in the prompt", () => {
    expect([...BRAIN_EMITTABLE_EVENTS].sort()).toEqual([
      "energy.waste_detected", "guest.vip_arriving", "maintenance.created", "occupancy.threshold_crossed", "pricing.rate_changed",
    ]);
  });
});
