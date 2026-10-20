// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BASE = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-anon-key-anon-key-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-key-service-key-service-key",
};

async function loadEnv(overrides: Record<string, string | undefined>) {
  vi.resetModules();
  for (const k of ["VERCEL", "VERCEL_ENV", "PII_ENCRYPTION_KEY", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) delete process.env[k];
  Object.assign(process.env, BASE);
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const mod = await import("@/lib/env");
  return mod.getEnv();
}

describe("hosted security configuration guard", () => {
  const saved = { ...process.env };
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    warn.mockRestore();
    process.env = { ...saved };
  });

  it("refuses to start a production deployment without the PII key and the shared rate limiter", async () => {
    await expect(loadEnv({ VERCEL: "1", VERCEL_ENV: "production" })).rejects.toThrow(/PII_ENCRYPTION_KEY, UPSTASH_REDIS_REST_URL/);
  });

  it("treats a Vercel deployment with no VERCEL_ENV as production", async () => {
    await expect(loadEnv({ VERCEL: "1" })).rejects.toThrow(/missing required security configuration/);
  });

  it("lets a preview (staging) deployment start and warns about what is missing", async () => {
    const env = await loadEnv({ VERCEL: "1", VERCEL_ENV: "preview", PII_ENCRYPTION_KEY: "a".repeat(64) });
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe(BASE.NEXT_PUBLIC_SUPABASE_URL);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/preview deployment is missing security configuration: UPSTASH_REDIS_REST_URL/));
  });

  it("starts production silently when everything is configured", async () => {
    await expect(
      loadEnv({ VERCEL: "1", VERCEL_ENV: "production", PII_ENCRYPTION_KEY: "a".repeat(64), UPSTASH_REDIS_REST_URL: "https://redis.example.upstash.io", UPSTASH_REDIS_REST_TOKEN: "t" }),
    ).resolves.toBeTruthy();
    expect(warn).not.toHaveBeenCalled();
  });

  it("does not apply off Vercel (self-hosted Edge Box)", async () => {
    await expect(loadEnv({ VERCEL: undefined })).resolves.toBeTruthy();
    expect(warn).not.toHaveBeenCalled();
  });
});
