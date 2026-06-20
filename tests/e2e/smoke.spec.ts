import { test, expect } from "@playwright/test";

/**
 * Smoke tests — verify the app starts and key pages render without crashing.
 * These do NOT test authenticated flows (would need Supabase running).
 */

test("login page loads and shows login form", async ({ page }) => {
  await page.goto("/login");
  await expect(page).toHaveTitle(/HospitAI/i);
  // Should have an email input
  await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible({ timeout: 10_000 });
});

test("login page rejects empty form submission", async ({ page }) => {
  await page.goto("/login");
  // Click submit without filling in
  const submitBtn = page.locator('button[type="submit"]');
  if (await submitBtn.isVisible()) {
    await submitBtn.click();
    // Should show validation error or stay on page
    await expect(page).toHaveURL(/\/login/);
  }
});

test("unauthenticated dashboard redirects to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("404 page renders for unknown routes", async ({ page }) => {
  const response = await page.goto("/nonexistent-route-12345");
  // Next.js should return 404
  expect(response?.status()).toBe(404);
});

test("API routes return 401 without auth", async ({ request }) => {
  const response = await request.get("/api/v1/guests");
  expect(response.status()).toBe(401);
});

test("API health or properties endpoint returns expected status", async ({ request }) => {
  // Without auth, should be 401 (not 500 — proves the server is running and routes work)
  const response = await request.get("/api/v1/properties");
  expect(response.status()).toBe(401);
});