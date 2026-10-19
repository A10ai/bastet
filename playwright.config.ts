import { defineConfig, devices } from "@playwright/test";

/**
 * HospitAI Playwright Configuration
 *
 * E2E smoke tests that verify the app starts and key pages render.
 * These run against the production build (next build + next start).
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "html",
  timeout: 30_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    // Vercel preview deployments (staging) are behind Deployment Protection;
    // `vercel env run -- npx playwright test ...` exports a short-lived token
    // the platform accepts in this header.
    // x-vercel-skip-toolbar keeps Vercel's injected feedback toolbar out of the
    // page; it races React hydration and shows up as React error #418.
    extraHTTPHeaders: process.env.VERCEL_OIDC_TOKEN
      ? { "x-vercel-trusted-oidc-idp-token": process.env.VERCEL_OIDC_TOKEN, "x-vercel-skip-toolbar": "1" }
      : undefined,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // With PLAYWRIGHT_BASE_URL set the tests target a server that is already
  // running (local :3100, CI integration job, staging). Starting a web server
  // here would run `next build` into the same .next directory under that
  // server's feet with the placeholder values below, which silently broke the
  // middleware's Supabase URL on 18 Oct 2026.
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "test-anon-key",
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-key",
      PROPERTY_ID: process.env.PROPERTY_ID || "test-property-id",
    },
  },
});