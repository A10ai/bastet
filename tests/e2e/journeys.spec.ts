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
  // Fail fast with a useful message when the account is locked by the login limiter
  // (5 attempts per 15 minutes): retrying would only deepen the lockout.
  const lockout = page.getByText(/too many login attempts/i);
  await Promise.race([
    page.waitForURL(/\/dashboard/, { timeout: 20_000 }),
    lockout.waitFor({ timeout: 20_000 }).then(() => { throw new Error(`E2E account ${email} is locked out by the login rate limit; restart the server or wait 15 minutes`); }),
  ]);
  // Answer the cookie banner the privacy-preserving way, as a real first-time
  // user would; the choice lives in localStorage and travels with storageState.
  const reject = page.getByTestId("cookie-reject");
  if (await reject.isVisible({ timeout: 3_000 }).catch(() => false)) await reject.click();
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
  // A booking row link ends in the booking id; the header buttons (groups, calendar, new) do not.
  const firstLink = page.locator('a[href^="/dashboard/bookings/"]:not([href$="/groups"]):not([href$="/calendar"]):not([href$="/new"])').first();
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

test("new booking form prices the stay through the quote endpoint and offers rate plans", async ({ browser }) => {
  const ctx = await signedInContext(browser);
  const page = await ctx.newPage();
  await page.goto("/dashboard/bookings/new", { waitUntil: "networkidle" });
  const plus = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
  await page.fill("#checkIn", plus(60));
  await page.fill("#checkOut", plus(62));
  const apartmentSelect = page.locator("select").first();
  // Options arrive from three parallel fetches; wait for them rather than reading once
  await expect.poll(async () => apartmentSelect.locator("option").count(), { timeout: 15_000 }).toBeGreaterThan(1);
  await apartmentSelect.selectOption({ index: 1 });
  await expect(page.getByTestId("quote-total")).toBeVisible({ timeout: 15_000 });
  const defaultTotal = await page.getByTestId("quote-total").textContent();
  const planSelect = page.getByTestId("rate-plan-select");
  await expect(planSelect).toBeVisible();
  const planOptions = await planSelect.locator("option").count();
  if (planOptions > 1) {
    await planSelect.selectOption({ index: 1 });
    await expect(page.getByTestId("quote-total")).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => page.getByTestId("quote-total").textContent(), { timeout: 15_000 }).not.toBe(defaultTotal);
  }
  const quotedTotal = (await page.getByTestId("quote-total").textContent()) || "";

  // Submit the form: this is a real browser mutation, so it proves the CSRF
  // header is attached by the client and the booking is priced by the quote.
  await page.click("button[type=submit]");
  await page.waitForURL(/\/dashboard\/bookings\/[0-9a-f-]{36}/, { timeout: 20_000 });
  const bookingId = page.url().match(/bookings\/([0-9a-f-]{36})/)![1];
  const detail = await (await ctx.request.get(`/api/v1/bookings/${bookingId}`)).json();
  expect(detail.data.rate_plan_snapshot).toBeTruthy();
  expect(quotedTotal.replace(/[^0-9.]/g, "")).toBe(Number(detail.data.total_amount_gbp).toFixed(2));

  // Clean up through the API with the session's CSRF token
  const csrf = (await (await ctx.request.get("/api/v1/csrf")).json()).data.token;
  const cancel = await ctx.request.post(`/api/v1/bookings/${bookingId}/cancel`, { headers: { "X-CSRF-Token": csrf }, data: { reason: "journey cleanup" } });
  expect(cancel.status()).toBe(200);
  await ctx.close();
});

test("group booking: create, block a room, take an organiser payment, cancel", async ({ browser }) => {
  const ctx = await signedInContext(browser);
  const page = await ctx.newPage();
  const plus = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
  await page.goto("/dashboard/bookings/groups", { waitUntil: "networkidle" });
  await page.getByTestId("group-new").click();
  const form = page.getByTestId("group-form");
  await form.locator("input").first().fill(`Journey group ${Date.now()}`);
  await form.locator('input[type="date"]').nth(0).fill(plus(90));
  await form.locator('input[type="date"]').nth(1).fill(plus(92));
  await page.getByTestId("group-save").click();
  // Creating a group lands on its page
  await page.waitForURL(/\/dashboard\/bookings\/groups\/[0-9a-f-]{36}/, { timeout: 20_000 });
  const groupId = page.url().match(/groups\/([0-9a-f-]{36})/)![1];

  // Block the first free room
  const firstFree = page.locator('[data-testid="free-rooms"] input[type="checkbox"]').first();
  await expect(firstFree).toBeVisible({ timeout: 15_000 });
  await firstFree.check();
  await page.getByTestId("group-add-rooms").click();
  await expect(page.getByTestId("group-message")).toHaveText(/1 room\(s\) blocked/, { timeout: 15_000 });
  await expect.poll(async () => page.getByTestId("group-rooms").locator("tbody tr").count(), { timeout: 15_000 }).toBe(1);

  // Organiser deposit
  await page.getByTestId("group-payment-amount").fill("25");
  await page.getByTestId("group-pay").click();
  await expect(page.getByTestId("group-message")).toHaveText(/Payment of/, { timeout: 15_000 });
  await expect.poll(async () => page.getByTestId("group-paid").textContent(), { timeout: 15_000 }).toMatch(/25/);

  // Cancel with a reason (inline, no browser dialog)
  await page.getByTestId("group-cancel").click();
  await page.getByTestId("group-cancel-reason").fill("journey cleanup");
  await page.getByTestId("group-cancel-confirm").click();
  await expect(page.getByTestId("group-message")).toHaveText(/cancelled/i, { timeout: 15_000 });
  const statement = await (await ctx.request.get(`/api/v1/groups/${groupId}`)).json();
  expect(statement.data.group.status).toBe("cancelled");
  expect(statement.data.room_count).toBe(0);
  await ctx.close();
});

test("guest portal: staff creates a link, the guest opens it without logging in and checks in online", async ({ browser }) => {
  const ctx = await signedInContext(browser);
  const page = await ctx.newPage();
  // Find an upcoming confirmed booking with a guest through the API, then open its page
  const plus = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
  const csrf = (await (await ctx.request.get("/api/v1/csrf")).json()).data.token as string;
  const apts = await (await ctx.request.get("/api/v1/apartments?status=available&limit=50")).json();
  const guests = await (await ctx.request.get("/api/v1/guests?limit=1")).json();
  const apt = (apts.data as Array<{ id: string; status: string }>).find((a) => a.status === "available");
  const made = await ctx.request.post("/api/v1/bookings", { headers: { "X-CSRF-Token": csrf }, data: { apartment_id: apt!.id, guest_id: guests.data[0].id, check_in: plus(35), check_out: plus(37), adults: 2 } });
  expect(made.status()).toBe(201);
  const booking = (await made.json()).data as { id: string; reference: string };
  await ctx.request.patch(`/api/v1/bookings/${booking.id}`, { headers: { "X-CSRF-Token": csrf }, data: { status: "confirmed" } });
  await page.goto(`/dashboard/bookings/${booking!.id}`, { waitUntil: "networkidle" });
  await page.getByTestId("portal-link-create").click();
  const url = (await page.getByTestId("portal-link-url").textContent({ timeout: 15_000 }))!.trim();
  expect(url).toMatch(/\/stay\/[A-Za-z0-9_-]{43}$/);
  await ctx.close();

  // Fresh browser context: no cookies, no session
  const guest = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const gp = await guest.newPage();
  await gp.goto(url, { waitUntil: "networkidle" });
  await expect(gp.getByTestId("portal-reference")).toHaveText(booking!.reference, { timeout: 15_000 });
  await gp.getByTestId("pc-arrival").fill("16:00");
  await gp.getByTestId("pc-terms").check();
  await gp.getByTestId("pc-submit").click();
  await expect(gp.getByTestId("portal-precheckin-done")).toBeVisible({ timeout: 15_000 });
  // The guest page must never be reachable as a dashboard page
  const anon = await guest.request.get("/api/v1/bookings?limit=1");
  expect(anon.status()).toBe(401);
  await guest.close();
  const cleanup = await browser.newContext({ storageState });
  const csrf2 = (await (await cleanup.request.get("/api/v1/csrf")).json()).data.token as string;
  await cleanup.request.post(`/api/v1/bookings/${booking.id}/cancel`, { headers: { "X-CSRF-Token": csrf2 }, data: { reason: "journey cleanup" } });
  await cleanup.close();
});

test("point of sale: a ticket is charged to an in-house room from the till", async ({ browser }) => {
  const ctx = await signedInContext(browser);
  const csrf = (await (await ctx.request.get("/api/v1/csrf")).json()).data.token as string;
  const today = new Date().toISOString().slice(0, 10);
  const plus = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
  const apts = await (await ctx.request.get("/api/v1/apartments?status=available&limit=50")).json();
  const guests = await (await ctx.request.get("/api/v1/guests?limit=1")).json();
  const apt = (apts.data as Array<{ id: string; number: string; status: string }>).find((a) => a.status === "available")!;
  const made = await ctx.request.post("/api/v1/bookings", { headers: { "X-CSRF-Token": csrf }, data: { apartment_id: apt.id, guest_id: guests.data[0].id, check_in: today, check_out: plus(1), adults: 1 } });
  expect(made.status()).toBe(201);
  const booking = (await made.json()).data as { id: string };
  await ctx.request.patch(`/api/v1/bookings/${booking.id}`, { headers: { "X-CSRF-Token": csrf }, data: { status: "confirmed" } });
  const ci = await ctx.request.post(`/api/v1/bookings/${booking.id}/checkin`, { headers: { "X-CSRF-Token": csrf }, data: {} });
  expect(ci.status()).toBe(200);

  const page = await ctx.newPage();
  await page.goto("/dashboard/pos", { waitUntil: "networkidle" });
  await page.getByTestId("pos-room").fill(apt.number);
  await page.getByTestId("pos-lookup").click();
  await expect(page.getByTestId("pos-stay")).toContainText(`Room ${apt.number}`, { timeout: 15_000 });
  await page.getByTestId("pos-item").first().click();
  await page.getByTestId("pos-item").first().click();
  await expect(page.getByTestId("pos-lines").locator("li")).toHaveCount(1);
  await page.getByTestId("pos-post").click();
  await expect(page.getByTestId("pos-result")).toContainText("Posted", { timeout: 15_000 });

  const folio = await (await ctx.request.get(`/api/v1/bookings/${booking.id}/folio`)).json();
  expect(Number(folio.data.balance_gbp)).toBeGreaterThan(0);
  // Cleanup: check out with the balance left open (manager override), so the room is free again
  await ctx.request.post(`/api/v1/bookings/${booking.id}/checkout`, { headers: { "X-CSRF-Token": csrf }, data: { allow_outstanding_balance: true } });
  await ctx.close();
});
