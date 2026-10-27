// @vitest-environment node
// Regression: `cp .env.example .env.local` made the server fail validation,
// because blank optional variables were parsed as "" (Oct 2026 deep test).
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("env validation with .env.example's blank values", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    vi.resetModules();
  });

  it("accepts every blank optional variable from .env.example", async () => {
    const example = readFileSync(join(process.cwd(), ".env.example"), "utf8");
    for (const line of example.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) process.env[m[1]] = m[2];
    }
    // The only values a developer must fill in (README: "fill in Supabase keys").
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
    vi.resetModules();
    const { getEnv } = await import("@/lib/env");
    expect(() => getEnv()).not.toThrow();
  });

  it("still rejects a value that is present but malformed", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
    process.env.UPSTASH_REDIS_REST_URL = "not a url";
    vi.resetModules();
    const { getEnv } = await import("@/lib/env");
    expect(() => getEnv()).toThrow(/UPSTASH_REDIS_REST_URL/);
  });
});
