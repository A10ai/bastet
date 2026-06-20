import { describe, it, expect } from "vitest";
import {
  anonymizeName,
  anonymizeEmail,
  anonymizePhone,
  anonymizePassport,
  anonymizeSnapshot,
} from "@/lib/pii-anonymizer";

describe("anonymizeName", () => {
  it("anonymizes a full name to initials + hash", () => {
    const result = anonymizeName("John Smith");
    expect(result).toMatch(/^Guest J\.S\. \([a-f0-9]{4}\)$/);
  });

  it("handles single name", () => {
    const result = anonymizeName("John");
    expect(result).toBe("Guest J.");
  });

  it("handles empty string", () => {
    expect(anonymizeName("")).toBe("Unknown");
  });

  it("produces consistent hash for same name", () => {
    const r1 = anonymizeName("Ahmed Hassan");
    const r2 = anonymizeName("Ahmed Hassan");
    expect(r1).toBe(r2);
  });

  it("produces different hashes for different names", () => {
    const r1 = anonymizeName("John Smith");
    const r2 = anonymizeName("Jane Doe");
    expect(r1).not.toBe(r2);
  });

  it("handles names with multiple middle names", () => {
    const result = anonymizeName("John Michael David Smith");
    expect(result).toMatch(/^Guest J\.S\. \([a-f0-9]{4}\)$/);
  });

  it("handles names with extra whitespace", () => {
    const result = anonymizeName("  John   Smith  ");
    expect(result).toMatch(/^Guest J\.S\. \([a-f0-9]{4}\)$/);
  });
});

describe("anonymizeEmail", () => {
  it("masks the local part but keeps domain", () => {
    const result = anonymizeEmail("john.smith@example.com");
    expect(result).toBe("guest_***@example.com");
  });

  it("handles empty string", () => {
    expect(anonymizeEmail("")).toBe("[redacted]");
  });

  it("handles string without @", () => {
    expect(anonymizeEmail("notanemail")).toBe("[redacted]");
  });

  it("preserves domain for different emails", () => {
    expect(anonymizeEmail("test@hospitai.uk")).toBe("guest_***@hospitai.uk");
    expect(anonymizeEmail("user@gmail.com")).toBe("guest_***@gmail.com");
  });
});

describe("anonymizePhone", () => {
  it("masks middle of phone number", () => {
    const result = anonymizePhone("+447123456789");
    expect(result).toBe("+44***789");
  });

  it("handles empty string", () => {
    expect(anonymizePhone("")).toBe("[redacted]");
  });

  it("handles very short numbers (<=4 chars)", () => {
    expect(anonymizePhone("123")).toBe("***");
    expect(anonymizePhone("1234")).toBe("***");
  });

  it("preserves first 3 and last 3 chars", () => {
    const result = anonymizePhone("ABCDEFGHIJ");
    expect(result).toBe("ABC***HIJ");
  });
});

describe("anonymizePassport", () => {
  it("redacts passport entirely but preserves length info", () => {
    const result = anonymizePassport("AB1234567");
    expect(result).toBe("[redacted:passport:9chars]");
  });

  it("handles empty string", () => {
    expect(anonymizePassport("")).toBe("[redacted]");
  });

  it("handles various passport formats", () => {
    expect(anonymizePassport("123456789")).toBe("[redacted:passport:9chars]");
    expect(anonymizePassport("K12345678")).toContain("[redacted:passport:9chars]");
  });
});

describe("anonymizeSnapshot", () => {
  it("strips guest PII from arrivals", () => {
    const snapshot = {
      arrivals: [
        { apartment_number: "101", guest_name: "John Smith", email: "john@example.com" },
        { apartment_number: "102", guest_name: "Jane Doe", email: "jane@example.com" },
      ],
    };
    const result = anonymizeSnapshot(snapshot) as Record<string, unknown>;
    expect(result.arrivals_count).toBe(2);
    const arrivals = result.arrivals as Array<Record<string, unknown>>;
    expect(arrivals[0].apartment_number).toBe("101");
    expect(arrivals[0].guest_name).toBeUndefined();
    expect(arrivals[0].email).toBeUndefined();
  });

  it("strips guest PII from departures", () => {
    const snapshot = {
      departures: [
        { apartment_number: "201", guest_name: "Bob" },
      ],
    };
    const result = anonymizeSnapshot(snapshot) as Record<string, unknown>;
    expect(result.departures_count).toBe(1);
    const departures = result.departures as Array<Record<string, unknown>>;
    expect(departures[0].apartment_number).toBe("201");
    expect(departures[0].guest_name).toBeUndefined();
  });

  it("aggregates guests without PII", () => {
    const snapshot = {
      guests: [
        { name: "John", email: "j@x.com", loyalty_tier: "gold" },
        { name: "Jane", email: "j@y.com", loyalty_tier: "gold" },
        { name: "Bob", email: "b@z.com", loyalty_tier: "standard" },
      ],
    };
    const result = anonymizeSnapshot(snapshot) as Record<string, unknown>;
    expect(result.guest_count).toBe(3);
    expect(result.guests).toBeUndefined(); // raw guests array should not be passed through
    const tiers = result.guest_loyalty_breakdown as Record<string, number>;
    expect(tiers.gold).toBe(2);
    expect(tiers.standard).toBe(1);
  });

  it("passes through non-PII keys unchanged", () => {
    const snapshot = {
      occupancy: 75,
      revenue: 5000,
      total_apartments: 270,
    };
    const result = anonymizeSnapshot(snapshot) as Record<string, unknown>;
    expect(result.occupancy).toBe(75);
    expect(result.revenue).toBe(5000);
    expect(result.total_apartments).toBe(270);
  });

  it("handles empty snapshot", () => {
    const result = anonymizeSnapshot({});
    expect(result).toEqual({});
  });

  it("handles arrivals with missing apartment_number", () => {
    const snapshot = {
      arrivals: [{ guest_name: "Test" }],
    };
    const result = anonymizeSnapshot(snapshot) as Record<string, unknown>;
    const arrivals = result.arrivals as Array<Record<string, unknown>>;
    expect(arrivals[0].apartment_number).toBe("TBD");
  });
});