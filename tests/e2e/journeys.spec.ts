import { test, expect, type Browser, type BrowserContext } from "@playwright/test";

/**
 * Authenticated journeys. They run only when credentials are provided
 * (E2E_EMAIL / E2E_PASSWORD, a front-desk or above account on the target
 * environment) so the unauthenticated smoke suite stays runnable anywhere.
 *
 * The account signs in ONCE (beforeAll) and the session is shared: the login
 * endpoint locks an account after five attempts in fifteen minutes, so a
 * login per test would lock the test user out.
 */
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
test.skip(!email || !password, "E2E_EMAIL and E2E_PASSWORD not set");
test.describe.configure({ mode: "serial" });

let storageState: Awaited<ReturnType<BrowserContext["storageState"]>>;

async function signedInContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ storageState, viewport: { width: 1366, height: 900 } });
}

test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.fill("#email", email!);
  await page.fill("#password", password!);
  await page.click("button[type=submit]");
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
  storageState = await ctx.storageState();
  await ctx.close();
});

test("dashboard renders without page errors", async ({ browser }) => {
  const ctx = await signedInContext(browser);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/dashboard", { waitUntil: "networkidle" });
  await expect(page.locator("h1, h2").first()).toBeVisible();
  expect(errors).toEqual([]);
  await ctx.close();
});

test("bookings list opens a booking with its folio panel", async ({ browser }) => {
  const ctx = await signedInContext(browser);
  const page = await ctx.newPage();
  await page.goto("/dashboard/bookings", { waitUntil: "networkidle" });
  const firstLink = page.locator('a[href^="/dashboard/bookings/"]').filter({ hasNotText: /new booking|calendar/i }).first();
  await expect(firstLink).toBeVisible({ timeout: 15_000 });
  await firstLink.click();
  await page.waitForURL(/\/dashboard\/bookings\/[0-9a-f-]{36}/, { timeout: 20_000 });
  await expect(page.getByTestId("folio-panel")).toBeVisible({ timeout: 15_000 });
  await ctx.close();
});

test("security settings page shows two-factor status", async ({ browser }) => {
  const ctx = await signedInContext(browser);
  const page = await ctx.newPage();
  await page.goto("/dashboard/settings/security", { waitUntil: "networkidle" });
  await expect(page.getByTestId("mfa-status")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("mfa-status")).not.toHaveText(/Checking/, { timeout: 15_000 });
  await ctx.close();
});

test("demo-data screens carry a visible banner", async ({ browser }) => {
  const ctx = await signedInContext(browser);
  const page = await ctx.newPage();
  for (const path of ["/dashboard/fnb", "/dashboard/tour-operators", "/dashboard/marketplace"]) {
    await page.goto(path, { waitUntil: "networkidle" });
    await expect(page.locator('[role="note"][aria-label]').first()).toBeVisible({ timeout: 15_000 });
  }
  await ctx.close();
});

test("protected API answers for the signed-in session and refuses without it", async ({ browser, request }) => {
  const ctx = await signedInContext(browser);
  const ok = await ctx.request.get("/api/v1/bookings?limit=1");
  expect(ok.status()).toBe(200);
  const anon = await request.get("/api/v1/bookings?limit=1");
  expect(anon.status()).toBe(401);
  await ctx.close();
});

test("list pages on SWR render their data without page errors", async ({ browser }) => {
  const ctx = await signedInContext(browser);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const path of ["/dashboard/bookings", "/dashboard/guests", "/dashboard/apartments", "/dashboard/housekeeping", "/dashboard/maintenance", "/dashboard/staff", "/dashboard/finance/invoices", "/dashboard/finance/expenses"]) {
    await page.goto(path, { waitUntil: "networkidle" });
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
    // The loading spinner must give way to content (a table, a card grid or an empty-state message)
    await expect(page.locator("table, [data-testid=empty-state], a[href^='/dashboard/']").first()).toBeVisible({ timeout: 15_000 });
  }
  // Search box is debounced and re-queries through the cache: typing must not throw
  await page.goto("/dashboard/bookings", { waitUntil: "networkidle" });
  const search = page.locator('input[placeholder*="earch"]').first();
  if (await search.count()) {
    await search.fill("zzz-no-such-guest");
    await page.waitForTimeout(800);
    await search.fill("");
  }
  expect(errors).toEqual([]);
  await ctx.close();
});
