import "server-only";
import { z } from "zod";

/**
 * Environment variable validation.
 * Validates all required environment variables at startup.
 * Throws a clear error if any are missing — fail fast, not fail silent.
 */

const envSchema = z.object({
  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  // Lets API routes verify session tokens locally instead of calling the auth
  // server per request (legacy HS256 projects and the local CLI stack).
  SUPABASE_JWT_SECRET: z.string().min(32).optional(),

  // App
  PROPERTY_ID: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),

  // AI
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().optional(),

  // Integrations (all optional — only needed if feature is active)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  OPEN_EXCHANGE_RATES_APP_ID: z.string().optional(),

  // Security
  PII_ENCRYPTION_KEY: z.string().min(16).optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // Wi-Fi credentials for messaging templates
  WIFI_SSID: z.string().optional(),
  WIFI_PASSWORD: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let validatedEnv: Env | null = null;

/**
 * Get validated environment variables. Validates once, caches result.
 * Throws on first call if validation fails.
 */
export function getEnv(): Env {
  if (validatedEnv) return validatedEnv;

  // A blank line in .env.local (`PII_ENCRYPTION_KEY=`, as in .env.example)
  // means "not set", not "set to the empty string": without this, copying
  // .env.example failed validation on every optional variable with a format.
  const provided = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined && v.trim() !== ""));
  const result = envSchema.safeParse(provided);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Environment variable validation failed:\n${errors}\n\n` +
        `Check .env.local or your deployment environment configuration.`
    );
  }

  // Hosted deployments must carry the security configuration. Production
  // refuses to start without it; a preview (staging) deployment starts but
  // says so loudly, and the health endpoint reports the gap as degraded.
  if (process.env.NODE_ENV === "production" && process.env.VERCEL) {
    const missing = ["PII_ENCRYPTION_KEY", "UPSTASH_REDIS_REST_URL"].filter((k) => !result.data[k as keyof Env]);
    if (missing.length) {
      const target = process.env.VERCEL_ENV || "production";
      if (target === "production") {
        throw new Error(`Production deployment is missing required security configuration: ${missing.join(", ")}`);
      }
      console.warn(`[env] ${target} deployment is missing security configuration: ${missing.join(", ")} (allowed outside production)`);
    }
  }

  validatedEnv = result.data;
  return validatedEnv;
}

/**
 * Get a single env var with type safety. Returns undefined for optional vars.
 */
export function env<K extends keyof Env>(key: K): Env[K] {
  return getEnv()[key];
}