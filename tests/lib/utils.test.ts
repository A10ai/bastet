import { describe, it, expect } from "vitest";
import {
  getLengthOfStayDiscount,
  generateBookingRef,
  generateInvoiceNumber,
  formatCurrency,
  cn,
  getStatusColor,
  getStatusBgColor,
} from "@/lib/utils";

describe("getLengthOfStayDiscount", () => {
  it("returns 0 for short stays (1-6 nights)", () => {
    expect(getLengthOfStayDiscount(1)).toBe(0);
    expect(getLengthOfStayDiscount(3)).toBe(0);
    expect(getLengthOfStayDiscount(6)).toBe(0);
  });

  it("returns 5% for 7-13 nights", () => {
    expect(getLengthOfStayDiscount(7)).toBe(0.05);
    expect(getLengthOfStayDiscount(10)).toBe(0.05);
    expect(getLengthOfStayDiscount(13)).toBe(0.05);
  });

  it("returns 10% for 14-20 nights", () => {
    expect(getLengthOfStayDiscount(14)).toBe(0.1);
    expect(getLengthOfStayDiscount(18)).toBe(0.1);
    expect(getLengthOfStayDiscount(20)).toBe(0.1);
  });

  it("returns 15% for 21-27 nights", () => {
    expect(getLengthOfStayDiscount(21)).toBe(0.15);
    expect(getLengthOfStayDiscount(25)).toBe(0.15);
    expect(getLengthOfStayDiscount(27)).toBe(0.15);
  });

  it("returns 20% for 28+ nights", () => {
    expect(getLengthOfStayDiscount(28)).toBe(0.2);
    expect(getLengthOfStayDiscount(30)).toBe(0.2);
    expect(getLengthOfStayDiscount(60)).toBe(0.2);
  });

  it("returns 0 for 0 or negative nights", () => {
    expect(getLengthOfStayDiscount(0)).toBe(0);
    expect(getLengthOfStayDiscount(-1)).toBe(0);
    expect(getLengthOfStayDiscount(-5)).toBe(0);
  });
});

describe("generateBookingRef", () => {
  it("generates a ref with correct format BAS-HRG-YYNNNN", () => {
    const ref = generateBookingRef(1);
    const year = new Date().getFullYear().toString().slice(-2);
    expect(ref).toBe(`BAS-HRG-${year}0001`);
  });

  it("pads sequence to 4 digits", () => {
    const ref = generateBookingRef(42);
    const year = new Date().getFullYear().toString().slice(-2);
    expect(ref).toBe(`BAS-HRG-${year}0042`);
  });

  it("handles large sequence numbers", () => {
    const ref = generateBookingRef(9999);
    const year = new Date().getFullYear().toString().slice(-2);
    expect(ref).toBe(`BAS-HRG-${year}9999`);
  });
});

describe("generateInvoiceNumber", () => {
  it("generates a number with correct format INV-HRG-YYNNNN", () => {
    const num = generateInvoiceNumber(1);
    const year = new Date().getFullYear().toString().slice(-2);
    expect(num).toBe(`INV-HRG-${year}0001`);
  });

  it("pads sequence to 4 digits", () => {
    const num = generateInvoiceNumber(123);
    const year = new Date().getFullYear().toString().slice(-2);
    expect(num).toBe(`INV-HRG-${year}0123`);
  });
});

describe("formatCurrency", () => {
  it("formats GBP by default", () => {
    const result = formatCurrency(100);
    expect(result).toContain("£");
    expect(result).toContain("100.00");
  });

  it("formats USD", () => {
    const result = formatCurrency(50, "USD");
    expect(result).toContain("$");
    expect(result).toContain("50.00");
  });

  it("formats EUR", () => {
    const result = formatCurrency(75, "EUR");
    expect(result).toContain("€");
  });

  it("handles zero", () => {
    const result = formatCurrency(0);
    expect(result).toContain("0.00");
  });

  it("handles negative amounts", () => {
    const result = formatCurrency(-25);
    expect(result).toContain("25.00");
  });
});

describe("cn (className merge)", () => {
  it("joins class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });

  it("handles undefined and null", () => {
    expect(cn("base", undefined, null, "end")).toBe("base end");
  });

  it("handles empty input", () => {
    expect(cn()).toBe("");
  });
});

describe("getStatusColor", () => {
  it("returns correct color class for known statuses", () => {
    expect(getStatusColor("available")).toBe("text-status-success");
    expect(getStatusColor("occupied")).toBe("text-bastet-gold");
    expect(getStatusColor("maintenance")).toBe("text-status-warning");
    expect(getStatusColor("cancelled")).toBe("text-status-error");
    expect(getStatusColor("checked_in")).toBe("text-status-success");
  });

  it("returns default for unknown status", () => {
    expect(getStatusColor("unknown")).toBe("text-text-secondary");
  });

  it("returns default for empty string", () => {
    expect(getStatusColor("")).toBe("text-text-secondary");
  });
});

describe("getStatusBgColor", () => {
  it("returns correct bg class for known statuses", () => {
    expect(getStatusBgColor("available")).toContain("bg-status-success");
    expect(getStatusBgColor("occupied")).toContain("bg-bastet-gold");
    expect(getStatusBgColor("urgent")).toContain("bg-status-error");
  });

  it("returns default for unknown status", () => {
    expect(getStatusBgColor("nonexistent")).toContain("bg-text-secondary");
  });
});