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

  // App
  PROPERTY_ID: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),

  // AI
  ANTHROPIC_API_KEY: z.string().optional(),

  // Integrations (all optional — only needed if feature is active)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  OPEN_EXCHANGE_RATES_APP_ID: z.string().optional(),

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

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Environment variable validation failed:\n${errors}\n\n` +
        `Check .env.local or your deployment environment configuration.`
    );
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