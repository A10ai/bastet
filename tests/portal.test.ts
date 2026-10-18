// @vitest-environment node
import { describe, it, expect } from "vitest";
import { generatePortalToken, hashPortalToken, isPlausiblePortalToken, portalExpiry, buildPortalUrl } from "@/lib/portal";
import { precheckinSchema } from "@/lib/validation";

describe("guest portal tokens", () => {
  it("generates unguessable 43-character tokens whose hash is what gets stored", () => {
    const a = generatePortalToken();
    const b = generatePortalToken();
    expect(a).not.toBe(b);
    expect(isPlausiblePortalToken(a)).toBe(true);
    expect(hashPortalToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashPortalToken(a)).toBe(hashPortalToken(a));
    expect(hashPortalToken(a)).not.toBe(hashPortalToken(b));
  });

  it("rejects shapes that cannot be a token before touching the database", () => {
    for (const bad of ["", "abc", "x".repeat(42), "x".repeat(44), "../../etc/passwd" + "a".repeat(27), "a".repeat(42) + "!"]) {
      expect(isPlausiblePortalToken(bad)).toBe(false);
    }
  });

  it("links expire a week after check-out and are built on the configured app URL", () => {
    expect(portalExpiry("2026-12-20").toISOString()).toBe("2026-12-27T00:00:00.000Z");
    const prev = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com/";
    expect(buildPortalUrl("tok", "http://localhost:3000")).toBe("https://app.example.com/stay/tok");
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(buildPortalUrl("tok", "http://localhost:3000")).toBe("http://localhost:3000/stay/tok");
    if (prev) process.env.NEXT_PUBLIC_APP_URL = prev;
  });
});

describe("pre-check-in form", () => {
  it("requires accepting the terms and a valid time", () => {
    expect(precheckinSchema.safeParse({ accept_terms: false }).success).toBe(false);
    expect(precheckinSchema.safeParse({ accept_terms: true, arrival_time: "25:00" }).success).toBe(false);
    const r = precheckinSchema.safeParse({ accept_terms: true, arrival_time: "14:30", adults: 2, special_requests: "cot please" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.marketing_consent).toBe(false);
  });
});
