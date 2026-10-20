import { describe, expect, it } from "vitest";
import { parsePagination, paginationMeta } from "@/lib/pagination";

const sp = (q: string) => new URLSearchParams(q);

describe("parsePagination", () => {
  it("defaults to 200 rows from the start", () => {
    expect(parsePagination(sp(""))).toEqual({ limit: 200, offset: 0 });
  });
  it("honours limit and offset", () => {
    expect(parsePagination(sp("limit=25&offset=50"))).toEqual({ limit: 25, offset: 50 });
  });
  it("caps the limit", () => {
    expect(parsePagination(sp("limit=999999")).limit).toBe(1000);
    expect(parsePagination(sp("limit=5"), { maxLimit: 3 }).limit).toBe(3);
  });
  it("ignores junk and negative values", () => {
    expect(parsePagination(sp("limit=abc&offset=-4"))).toEqual({ limit: 200, offset: 0 });
    expect(parsePagination(sp("limit=0"))).toEqual({ limit: 200, offset: 0 });
  });
  it("derives offset from page when offset is absent", () => {
    expect(parsePagination(sp("page=3&limit=10"))).toEqual({ limit: 10, offset: 20 });
    expect(parsePagination(sp("page=1&limit=10"))).toEqual({ limit: 10, offset: 0 });
  });
});

describe("paginationMeta", () => {
  it("reports has_more from the total", () => {
    expect(paginationMeta({ limit: 10, offset: 0 }, 25, 10)).toEqual({ total: 25, limit: 10, offset: 0, has_more: true });
    expect(paginationMeta({ limit: 10, offset: 20 }, 25, 5)).toEqual({ total: 25, limit: 10, offset: 20, has_more: false });
  });
  it("falls back to offset plus returned when no count is available", () => {
    expect(paginationMeta({ limit: 10, offset: 10 }, null, 4)).toEqual({ total: 14, limit: 10, offset: 10, has_more: false });
  });
});
