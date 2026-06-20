import { describe, it, expect, beforeEach } from "vitest";

// server-only is mocked via vitest config alias
import { rateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";

describe("rateLimit", () => {
  beforeEach(() => {
    // Reset the internal store by using a new identifier each test
    // The store is module-level, so we use unique IDs per test
  });

  it("allows first request within limit", () => {
    const id = `test-allow-${Date.now()}-${Math.random()}`;
    const result = rateLimit(id, { windowMs: 60000, max: 5 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("blocks request after exceeding max", () => {
    const id = `test-block-${Date.now()}-${Math.random()}`;
    const opts = { windowMs: 60000, max: 3 };

    rateLimit(id, opts); // 1
    rateLimit(id, opts); // 2
    rateLimit(id, opts); // 3
    const result = rateLimit(id, opts); // 4 - blocked

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("resets after window expires", async () => {
    const id = `test-reset-${Date.now()}-${Math.random()}`;
    const opts = { windowMs: 50, max: 1 }; // 50ms window

    const r1 = rateLimit(id, opts);
    expect(r1.allowed).toBe(true);

    // Wait for window to expire
    await new Promise((resolve) => setTimeout(resolve, 60));

    const r2 = rateLimit(id, opts);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(0);
  });

  it("counts remaining correctly", () => {
    const id = `test-count-${Date.now()}-${Math.random()}`;
    const opts = { windowMs: 60000, max: 5 };

    const r1 = rateLimit(id, opts);
    expect(r1.remaining).toBe(4);

    const r2 = rateLimit(id, opts);
    expect(r2.remaining).toBe(3);

    const r3 = rateLimit(id, opts);
    expect(r3.remaining).toBe(2);
  });

  it("handles different identifiers independently", () => {
    const id1 = `test-ind1-${Date.now()}-${Math.random()}`;
    const id2 = `test-ind2-${Date.now()}-${Math.random()}`;
    const opts = { windowMs: 60000, max: 2 };

    expect(rateLimit(id1, opts).allowed).toBe(true);
    expect(rateLimit(id2, opts).allowed).toBe(true);
    expect(rateLimit(id1, opts).allowed).toBe(true);
    expect(rateLimit(id2, opts).allowed).toBe(true);
    expect(rateLimit(id1, opts).allowed).toBe(false);
    expect(rateLimit(id2, opts).allowed).toBe(false);
  });
});

describe("getClientIp", () => {
  it("extracts IP from x-forwarded-for header", () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "192.168.1.1, 10.0.0.1" },
    });
    expect(getClientIp(req)).toBe("192.168.1.1");
  });

  it("extracts IP from x-real-ip header", () => {
    const req = new Request("https://example.com", {
      headers: { "x-real-ip": "10.0.0.5" },
    });
    expect(getClientIp(req)).toBe("10.0.0.5");
  });

  it("returns unknown when no IP headers present", () => {
    const req = new Request("https://example.com");
    expect(getClientIp(req)).toBe("unknown");
  });

  it("prefers x-forwarded-for over x-real-ip", () => {
    const req = new Request("https://example.com", {
      headers: {
        "x-forwarded-for": "192.168.1.1",
        "x-real-ip": "10.0.0.5",
      },
    });
    expect(getClientIp(req)).toBe("192.168.1.1");
  });
});

describe("RATE_LIMITS presets", () => {
  it("has LOGIN preset (5 per 15 min)", () => {
    expect(RATE_LIMITS.LOGIN.max).toBe(5);
    expect(RATE_LIMITS.LOGIN.windowMs).toBe(15 * 60 * 1000);
  });

  it("has PASSWORD_RESET preset (3 per hour)", () => {
    expect(RATE_LIMITS.PASSWORD_RESET.max).toBe(3);
    expect(RATE_LIMITS.PASSWORD_RESET.windowMs).toBe(60 * 60 * 1000);
  });

  it("has API_DEFAULT preset (100 per min)", () => {
    expect(RATE_LIMITS.API_DEFAULT.max).toBe(100);
    expect(RATE_LIMITS.API_DEFAULT.windowMs).toBe(60 * 1000);
  });

  it("has AI_ENDPOINT preset (10 per min)", () => {
    expect(RATE_LIMITS.AI_ENDPOINT.max).toBe(10);
    expect(RATE_LIMITS.AI_ENDPOINT.windowMs).toBe(60 * 1000);
  });

  it("has WRITE_OPERATION preset (30 per min)", () => {
    expect(RATE_LIMITS.WRITE_OPERATION.max).toBe(30);
    expect(RATE_LIMITS.WRITE_OPERATION.windowMs).toBe(60 * 1000);
  });
});