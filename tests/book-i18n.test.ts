// @vitest-environment node
import { describe, it, expect } from "vitest";
import { BOOK_LOCALES, BOOK_STRINGS, detectBookLocale, formatCountdown, formatMoney, nightsLabel } from "@/lib/book-i18n";

describe("booking page translations", () => {
  it("every locale carries every key, non-empty and not a copy of English unless identical by nature", () => {
    const keys = Object.keys(BOOK_STRINGS.en);
    for (const locale of BOOK_LOCALES) {
      const table = BOOK_STRINGS[locale] as Record<string, string>;
      expect(Object.keys(table).sort()).toEqual([...keys].sort());
      for (const k of keys) expect(table[k], `${locale}.${k}`).toMatch(/\S/);
    }
    // Spot checks that the non-English tables are translated
    expect(BOOK_STRINGS.de.search).not.toBe(BOOK_STRINGS.en.search);
    expect(BOOK_STRINGS.pl.checkIn).not.toBe(BOOK_STRINGS.en.checkIn);
    expect(BOOK_STRINGS.ru.total).not.toBe(BOOK_STRINGS.en.total);
    expect(BOOK_STRINGS.cs.adults).not.toBe(BOOK_STRINGS.en.adults);
  });

  it("detects the page language from the query, then the browser, then falls back to English", () => {
    expect(detectBookLocale("de", ["en-GB"])).toBe("de");
    expect(detectBookLocale("fr", ["pl-PL", "en"])).toBe("pl");
    expect(detectBookLocale(null, ["cs-CZ"])).toBe("cs");
    expect(detectBookLocale(null, ["fr-FR", "it"])).toBe("en");
    expect(detectBookLocale("RU", [])).toBe("en"); // case sensitive: codes are lower-case
  });

  it("formats money, nights and countdowns for each market", () => {
    expect(formatMoney(1234.5, "GBP", "en")).toBe("£1,234.50");
    expect(formatMoney(1234.5, "EUR", "de")).toMatch(/1\.234,50/);
    expect(formatMoney(99, "PLN", "pl")).toMatch(/99/);
    expect(formatMoney(10, "XYZ", "en")).toContain("10"); // unknown currency never throws
    expect(nightsLabel(1, BOOK_STRINGS.en)).toBe("1 night");
    expect(nightsLabel(7, BOOK_STRINGS.de)).toBe("7 Nächte");
    expect(formatCountdown(29 * 60_000 + 5_000)).toBe("29:05");
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(-5)).toBe("0:00");
  });
});
