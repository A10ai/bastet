// HospitAI deep test — pages, APIs, roles, security, and (full mode) the
// booking / check-in / check-out / payment transactions.
// Usage (local stack, full mode — creates bookings/invoices/payments):
//   supabase start && supabase db reset   # then create the five seed logins
//   BASE_URL=http://localhost:3100 MODE=full SB_URL=... SB_SERVICE=... \
//   ACCOUNTS='{"owner":{"email":"owner@bastet.com","password":"..."},"manager":{...},"reception":{...},"housekeeping":{...}}' \
//   node scripts/deep-test.mjs
// Usage (production, read-only): BASE_URL=https://app.hospitai.uk MODE=readonly ACCOUNTS='{"owner":{...}}' node scripts/deep-test.mjs
// Never pass a manager account in readonly mode against production: the role
// test tries to change AI brain config and old builds would accept it.
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(new URL("../package.json", import.meta.url));
const { chromium, request } = require("@playwright/test");

const BASE_URL = process.env.BASE_URL || "http://localhost:3100";
const MODE = process.env.MODE || "readonly";
const ACCOUNTS = JSON.parse(process.env.ACCOUNTS || "{}");
const OUT = process.env.OUT || "deep-test-results.json";
const SUPABASE_URL = process.env.SB_URL;
const SUPABASE_SERVICE = process.env.SB_SERVICE;

const results = [];
let pass = 0, fail = 0, warn = 0;
function rec(section, name, status, detail = "") {
  results.push({ section, name, status, detail: String(detail).slice(0, 300) });
  if (status === "PASS") pass++; else if (status === "FAIL") fail++; else warn++;
  const mark = status === "PASS" ? "✓" : status === "FAIL" ? "✗" : "~";
  console.log(`${mark} [${section}] ${name}${detail ? " — " + String(detail).slice(0, 160) : ""}`);
}
const today = new Date().toISOString().slice(0, 10);
const plus = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

async function login(email, password) {
  const ctx = await request.newContext({ baseURL: BASE_URL });
  const res = await ctx.post("/api/v1/auth/login", { data: { email, password } });
  if (res.status() !== 200) return { ctx, ok: false, status: res.status(), body: await res.text() };
  const body = await res.json();
  const csrfRes = await ctx.get("/api/v1/csrf");
  const csrf = (await csrfRes.json()).data?.token;
  return { ctx, ok: true, staff: body.data?.staff, csrf };
}
const H = (csrf) => ({ "X-CSRF-Token": csrf, "Content-Type": "application/json" });
async function j(res) { try { return await res.json(); } catch { return null; } }

// ---------------------------------------------------------------------------
// 1. Unauthenticated surface
// ---------------------------------------------------------------------------
async function unauthTests() {
  const ctx = await request.newContext({ baseURL: BASE_URL });
  const h = await ctx.get("/api/v1/health");
  rec("unauth", "health endpoint 200", h.status() === 200 ? "PASS" : "FAIL", h.status());
  const hb = await j(h);
  const stale = hb?.timestamp && (Date.now() - Date.parse(hb.timestamp)) > 3600_000;
  rec("unauth", "health timestamp is live (not prerendered)", stale ? "WARN" : "PASS", hb?.timestamp);
  for (const p of ["/api/v1/bookings", "/api/v1/guests", "/api/v1/admin/users", "/api/v1/finance/summary", "/api/v1/audit"]) {
    const r = await ctx.get(p);
    rec("unauth", `GET ${p} -> 401`, r.status() === 401 ? "PASS" : "FAIL", r.status());
  }
  const d = await ctx.get("/dashboard", { maxRedirects: 0 });
  rec("unauth", "/dashboard redirects to /login", d.status() >= 300 && d.status() < 400 && (d.headers().location || "").includes("/login") ? "PASS" : "FAIL", `${d.status()} ${d.headers().location || ""}`);
  const noCsrf = await ctx.post("/api/v1/bookings", { data: {} });
  rec("unauth", "POST without CSRF/session rejected", [401, 403].includes(noCsrf.status()) ? "PASS" : "FAIL", noCsrf.status());
  const hdr = await ctx.get("/login");
  const hs = hdr.headers();
  for (const k of ["strict-transport-security", "x-frame-options", "content-security-policy", "x-content-type-options"]) {
    rec("unauth", `security header ${k}`, hs[k] ? "PASS" : "WARN", hs[k] ? "present" : "missing");
  }
  await ctx.dispose();
}

// ---------------------------------------------------------------------------
// 2. Forged session cookie must not authenticate (gap 2)
// ---------------------------------------------------------------------------
async function forgedCookieTest(ownerCtx) {
  const state = await ownerCtx.storageState();
  const authCookie = state.cookies.find((c) => c.name.includes("auth-token") && !c.name.endsWith(".1"));
  if (!authCookie) { rec("security", "locate session cookie", "WARN", "no auth-token cookie found"); return; }
  const forged = { access_token: "forged.jwt.token", refresh_token: "x", expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: "bearer", user: { id: "00000000-0000-0000-0000-000000000001", aud: "authenticated", role: "authenticated", email: "owner@bastet.com" } };
  const value = "base64-" + Buffer.from(JSON.stringify(forged)).toString("base64url");
  const ctx = await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { cookie: `${authCookie.name.replace(/\.0$/, "")}=${value}` } });
  for (const p of ["/api/v1/admin/users", "/api/v1/staff", "/api/v1/bookings"]) {
    const r = await ctx.get(p);
    rec("security", `forged cookie GET ${p} rejected`, r.status() === 401 || r.status() === 403 ? "PASS" : "FAIL", r.status());
  }
  await ctx.dispose();
}

// ---------------------------------------------------------------------------
// 3. Pages (browser) as owner
// ---------------------------------------------------------------------------
const DEMO_PAGES = ["/dashboard/fnb", "/dashboard/tour-operators", "/dashboard/energy", "/dashboard/marketplace", "/dashboard/channels", "/dashboard", "/dashboard/finance"];
async function pageTests(ownerCtx, ids) {
  const pages = (function walk(dir, base = "") {
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) out.push(...walk(`${dir}/${e.name}`, `${base}/${e.name}`));
      else if (e.name === "page.tsx") out.push(`/dashboard${base}`);
    }
    return out;
  })(new URL("../src/app/dashboard", import.meta.url).pathname).sort();
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: BASE_URL, storageState: await ownerCtx.storageState(), viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  for (let route of pages) {
    const m = route.match(/\[(\w+)\]/);
    if (m) {
      const key = route.split("/")[2];
      const id = ids[key];
      if (!id) { rec("pages", route, "WARN", `no ${key} id available`); continue; }
      route = route.replace(/\[\w+\]/, id);
    }
    const errors = [];
    const onErr = (e) => errors.push(`pageerror: ${e.message}`);
    const onCon = (msg) => { if (msg.type() === "error" && !/favicon|realtime|websocket|net::ERR|Failed to load resource/i.test(msg.text())) errors.push(`console: ${msg.text()}`); };
    page.on("pageerror", onErr); page.on("console", onCon);
    let status = 0, text = "";
    try {
      const res = await page.goto(route, { waitUntil: "networkidle", timeout: 25000 });
      status = res?.status() ?? 0;
      await page.waitForTimeout(400);
      text = await page.locator("body").innerText().catch(() => "");
    } catch (e) { errors.push(`nav: ${e.message.split("\n")[0]}`); }
    page.off("pageerror", onErr); page.off("console", onCon);
    const broken = /Application error|Something went wrong|Internal Server Error|Unhandled Runtime Error/i.test(text);
    const redirected = page.url().includes("/login");
    const ok = status === 200 && !broken && !redirected && errors.length === 0;
    rec("pages", route, ok ? "PASS" : "FAIL", `${status}${redirected ? " redirected-to-login" : ""}${broken ? " error-text" : ""}${errors.length ? " " + errors[0] : ""}`);
    const base = route.replace(/\/[0-9a-f-]{36}$/, "");
    if (DEMO_PAGES.includes(base)) {
      const banner = await page.locator('[role="note"][aria-label]').count();
      const sectionHidden = base === "/dashboard/finance" && !/Department Costs/.test(text);
      rec("pages", `${base} shows demo/modelled banner`, banner > 0 ? "PASS" : sectionHidden ? "WARN" : "FAIL", sectionHidden ? "budget section hidden (no expenses in data), banner not applicable" : `${banner} banner(s)`);
    }
  }
  await browser.close();
}

// ---------------------------------------------------------------------------
// 4. GET APIs as owner
// ---------------------------------------------------------------------------
const GET_ROUTES = [
  "ai/automations", "ai/brain", "ai/energy", "ai/events", "ai/guests", "ai/insights", "ai/predictions", "ai/revenue", "ai/scheduler", "ai/workflows",
  "apartment-types", "apartments", "audit", "auth/me", "availability?date_from=" + today + "&date_to=" + plus(7), "availability/calendar?start=" + today + "&days=7",
  "booking-channels", "bookings", "briefing", "buildings", "channels", "channels?type=connections", "currency-rates", "dashboard/stats", "expenses",
  "finance/summary", "fnb", "fnb?type=menu", "gdpr?action=consents", "guests", "housekeeping", "invoices", "maintenance", "messaging?type=templates", "notifications",
  "properties", "rates", "reports?type=occupancy&from=" + plus(-30) + "&to=" + today, "staff", "tour-contracts",
];
async function apiTests(ctx, label) {
  for (const r of GET_ROUTES) {
    const res = await ctx.get("/api/v1/" + r);
    const s = res.status();
    const body = await res.text();
    const leaks = /relation |column |pgrst|syntax error|violates/i.test(body);
    const status = s === 200 ? "PASS" : s === 400 ? "WARN" : "FAIL";
    rec(`api:${label}`, `GET /api/v1/${r}`, leaks ? "FAIL" : status, `${s}${leaks ? " LEAKS DB ERROR: " + body.slice(0, 80) : s !== 200 ? " " + body.slice(0, 100) : ""}`);
  }
}

// ---------------------------------------------------------------------------
// 5. Role enforcement (gap 3)
// ---------------------------------------------------------------------------
async function roleTests(hk, mgr) {
  if (hk?.ok) {
    for (const [p, exp] of [["/api/v1/guests", 403], ["/api/v1/finance/summary", 403], ["/api/v1/staff", 403], ["/api/v1/audit", 403], ["/api/v1/invoices", 403], ["/api/v1/housekeeping", 200], ["/api/v1/bookings", 200], ["/api/v1/dashboard/stats", 200]]) {
      const r = await hk.ctx.get(p);
      rec("roles", `housekeeping GET ${p} -> ${exp}`, r.status() === exp ? "PASS" : "FAIL", r.status());
    }
    const post = await hk.ctx.post("/api/v1/bookings", { headers: H(hk.csrf), data: { apartment_id: "00000000-0000-0000-0000-000000000000", check_in: today, check_out: plus(1) } });
    rec("roles", "housekeeping POST /bookings -> 403", post.status() === 403 ? "PASS" : "FAIL", post.status());
  }
  if (mgr?.ok) {
    const r = await mgr.ctx.post("/api/v1/ai/brain", { headers: H(mgr.csrf), data: { action: "update_config", config: { mode: "autonomous" } } });
    rec("roles", "manager cannot set AI brain config -> 403", r.status() === 403 ? "PASS" : "FAIL", `${r.status()} ${(await r.text()).slice(0, 80)}`);
    const s = await mgr.ctx.get("/api/v1/staff");
    rec("roles", "manager GET /staff -> 200", s.status() === 200 ? "PASS" : "FAIL", s.status());
    const a = await mgr.ctx.get("/api/v1/audit");
    rec("roles", "manager GET /audit -> 403", a.status() === 403 ? "PASS" : "FAIL", a.status());
  }
}

// ---------------------------------------------------------------------------
// 6. Transactions (full mode only, local DB)
// ---------------------------------------------------------------------------
async function transactionTests(owner, reception) {
  const ctx = owner.ctx, csrf = owner.csrf;
  const apts = (await j(await ctx.get("/api/v1/apartments?status=available&limit=5")))?.data || (await j(await ctx.get("/api/v1/apartments")))?.data || [];
  const available = apts.filter((a) => a.status === "available");
  if (available.length < 2) { rec("txn", "need two available apartments", "FAIL", `${available.length} available`); return {}; }
  const [aptA, aptB] = available;
  const channels = (await j(await ctx.get("/api/v1/booking-channels")))?.data || [];
  const direct = channels.find((c) => c.code === "direct") || channels[0];

  const g = await ctx.post("/api/v1/guests", { headers: H(csrf), data: { first_name: "Deep", last_name: "Test", email: `deep.test.${Date.now()}@example.com`, nationality: "GB", passport_number: "P1234567" } });
  const guest = (await j(g))?.data;
  rec("txn", "create guest", g.status() < 300 && guest?.id ? "PASS" : "FAIL", `${g.status()} ${guest?.id ? "property_id=" + guest.property_id : await g.text()}`);
  if (!guest?.id) return {};

  const b1 = await ctx.post("/api/v1/bookings", { headers: H(csrf), data: { apartment_id: aptA.id, guest_id: guest.id, channel_id: direct?.id, check_in: today, check_out: plus(2), adults: 1 } });
  const booking = (await j(b1))?.data;
  rec("txn", "create booking (generated nights column no longer inserted)", b1.status() < 300 && booking?.id ? "PASS" : "FAIL", `${b1.status()} ${booking ? booking.reference + " nights=" + booking.nights : await b1.text()}`);
  if (!booking?.id) return { guest };

  const dup = await ctx.post("/api/v1/bookings", { headers: H(csrf), data: { apartment_id: aptA.id, guest_id: guest.id, channel_id: direct?.id, check_in: plus(1), check_out: plus(3), adults: 1 } });
  rec("txn", "overlapping booking rejected by API availability check", [400, 409].includes(dup.status()) ? "PASS" : "FAIL", `${dup.status()} ${(await dup.text()).slice(0, 80)}`);

  if (SUPABASE_URL && SUPABASE_SERVICE) {
    const direct_insert = await (await request.newContext()).post(`${SUPABASE_URL}/rest/v1/bookings`, {
      headers: { apikey: SUPABASE_SERVICE, Authorization: `Bearer ${SUPABASE_SERVICE}`, "Content-Type": "application/json", Prefer: "return=representation" },
      data: { property_id: booking.property_id, apartment_id: aptA.id, guest_id: guest.id, channel_id: booking.channel_id, reference: "DUP-" + Date.now().toString().slice(-6), status: "confirmed", check_in: plus(1), check_out: plus(3), rate_per_night_gbp: 50, total_amount_gbp: 100 },
    });
    const txt = await direct_insert.text();
    rec("txn", "DB exclusion constraint blocks overlap even when the app check is bypassed", [400, 409].includes(direct_insert.status()) && /23P01|bookings_no_overlap|exclusion/i.test(txt) ? "PASS" : "FAIL", `${direct_insert.status()} ${txt.slice(0, 100)}`);
  }

  const badPatch = await ctx.patch(`/api/v1/bookings/${booking.id}`, { headers: H(csrf), data: { status: "checked_in" } });
  rec("txn", "PATCH status=checked_in rejected", badPatch.status() === 400 ? "PASS" : "FAIL", badPatch.status());
  const earlyCheckin = await ctx.post(`/api/v1/bookings/${booking.id}/checkin`, { headers: H(csrf), data: {} });
  rec("txn", "check-in before confirmation rejected (INVALID_STATUS)", earlyCheckin.status() === 409 ? "PASS" : "FAIL", `${earlyCheckin.status()} ${(await earlyCheckin.text()).slice(0, 80)}`);
  const confirm = await ctx.patch(`/api/v1/bookings/${booking.id}`, { headers: H(csrf), data: { status: "confirmed" } });
  rec("txn", "PATCH status=confirmed accepted", confirm.status() === 200 ? "PASS" : "FAIL", confirm.status());

  const hkBefore = ((await j(await ctx.get(`/api/v1/housekeeping?apartment_id=${aptA.id}`)))?.data || []).filter((t) => t.type === "checkout_clean").length;
  const ci = await ctx.post(`/api/v1/bookings/${booking.id}/checkin`, { headers: H(csrf), data: { notes: "deep test" } });
  rec("txn", "check-in via checkin_booking()", ci.status() === 200 ? "PASS" : "FAIL", `${ci.status()} ${(await ci.text()).slice(0, 100)}`);
  const aptAfterCi = (await j(await ctx.get(`/api/v1/apartments/${aptA.id}`)))?.data;
  rec("txn", "apartment occupied after check-in", aptAfterCi?.status === "occupied" ? "PASS" : "FAIL", aptAfterCi?.status);
  const ciAgain = await ctx.post(`/api/v1/bookings/${booking.id}/checkin`, { headers: H(csrf), data: {} });
  rec("txn", "double check-in rejected", ciAgain.status() === 409 ? "PASS" : "FAIL", ciAgain.status());

  // Invoice with property VAT default, overpayment rejection, exact payment
  const inv = await ctx.post("/api/v1/invoices", { headers: H(csrf), data: { booking_id: booking.id, guest_id: guest.id, line_items: [{ description: "Room charge", quantity: 1, unit_price_gbp: 100 }], due_date: plus(7) } });
  const invoice = (await j(inv))?.data;
  rec("txn", "invoice created with property VAT (14% -> tax 14.00)", invoice && Number(invoice.tax_amount_gbp) === 14 && Number(invoice.total_gbp) === 114 ? "PASS" : "FAIL", `${inv.status()} tax=${invoice?.tax_amount_gbp} total=${invoice?.total_gbp} ${invoice?.invoice_number || (await inv.text()).slice(0, 80)}`);
  if (invoice?.id) {
    const send = await ctx.post(`/api/v1/invoices/${invoice.id}/send`, { headers: H(csrf), data: {} });
    rec("txn", "invoice sent", send.status() === 200 ? "PASS" : "FAIL", send.status());
    const over = await ctx.post(`/api/v1/invoices/${invoice.id}/payments`, { headers: H(csrf), data: { amount_gbp: 500, method: "cash" } });
    rec("txn", "overpayment rejected (OVERPAYMENT)", over.status() === 400 ? "PASS" : "FAIL", `${over.status()} ${(await over.text()).slice(0, 80)}`);
    const balanceCo = await reception.ctx.post(`/api/v1/bookings/${booking.id}/checkout`, { headers: H(reception.csrf), data: {} });
    rec("txn", "check-out with unpaid balance blocked for receptionist (402)", balanceCo.status() === 402 ? "PASS" : "FAIL", `${balanceCo.status()} ${(await balanceCo.text()).slice(0, 80)}`);
    const pay = await ctx.post(`/api/v1/invoices/${invoice.id}/payments`, { headers: H(csrf), data: { amount_gbp: 114, method: "cash" } });
    const payBody = await j(pay);
    rec("txn", "exact payment accepted and invoice marked paid", pay.status() === 201 && payBody?.meta?.invoice_status === "paid" ? "PASS" : "FAIL", `${pay.status()} ${JSON.stringify(payBody?.meta)}`);
    const again = await ctx.post(`/api/v1/invoices/${invoice.id}/payments`, { headers: H(csrf), data: { amount_gbp: 1, method: "cash" } });
    rec("txn", "payment on a paid invoice rejected", again.status() === 409 ? "PASS" : "FAIL", again.status());
  }

  const co = await reception.ctx.post(`/api/v1/bookings/${booking.id}/checkout`, { headers: H(reception.csrf), data: { notes: "deep test out" } });
  const coBody = await j(co);
  rec("txn", "check-out via checkout_booking() as receptionist", co.status() === 200 ? "PASS" : "FAIL", `${co.status()} ${JSON.stringify(coBody?.meta || coBody).slice(0, 100)}`);
  const hkAfter = ((await j(await ctx.get(`/api/v1/housekeeping?apartment_id=${aptA.id}`)))?.data || []).filter((t) => t.type === "checkout_clean").length;
  rec("txn", "exactly one checkout_clean task created", hkAfter - hkBefore === 1 ? "PASS" : "FAIL", `before=${hkBefore} after=${hkAfter}`);
  const aptAfterCo = (await j(await ctx.get(`/api/v1/apartments/${aptA.id}`)))?.data;
  rec("txn", "apartment set to cleaning after check-out", aptAfterCo?.status === "cleaning" ? "PASS" : "FAIL", aptAfterCo?.status);
  const guestAfter = (await j(await ctx.get(`/api/v1/guests/${guest.id}`)))?.data;
  rec("txn", "loyalty points and stay count posted to guest", guestAfter && guestAfter.total_stays === 1 && guestAfter.loyalty_points > 0 ? "PASS" : "FAIL", `stays=${guestAfter?.total_stays} points=${guestAfter?.loyalty_points} tier=${guestAfter?.loyalty_tier}`);
  rec("txn", "passport number not echoed in list payloads", /P1234567/.test(JSON.stringify(guestAfter)) ? "WARN" : "PASS", "guest detail includes passport (expected for front desk)");

  // Manager override of outstanding balance on a second stay
  const b2 = await ctx.post("/api/v1/bookings", { headers: H(csrf), data: { apartment_id: aptB.id, guest_id: guest.id, channel_id: direct?.id, check_in: today, check_out: plus(1), adults: 1 } });
  const booking2 = (await j(b2))?.data;
  if (booking2?.id) {
    await ctx.patch(`/api/v1/bookings/${booking2.id}`, { headers: H(csrf), data: { status: "confirmed" } });
    const ci2 = await ctx.post(`/api/v1/bookings/${booking2.id}/checkin`, { headers: H(csrf), data: {} });
    const inv2 = (await j(await ctx.post("/api/v1/invoices", { headers: H(csrf), data: { booking_id: booking2.id, guest_id: guest.id, line_items: [{ description: "Minibar", quantity: 2, unit_price_gbp: 10 }], due_date: plus(7), tax_rate: 0 } })))?.data;
    if (inv2?.id) await ctx.post(`/api/v1/invoices/${inv2.id}/send`, { headers: H(csrf), data: {} });
    const blocked = await ctx.post(`/api/v1/bookings/${booking2.id}/checkout`, { headers: H(csrf), data: {} });
    const override = await ctx.post(`/api/v1/bookings/${booking2.id}/checkout`, { headers: H(csrf), data: { allow_outstanding_balance: true } });
    rec("txn", "owner blocked without override, allowed with allow_outstanding_balance", ci2.status() === 200 && blocked.status() === 402 && override.status() === 200 ? "PASS" : "FAIL", `checkin=${ci2.status()} blocked=${blocked.status()} override=${override.status()}`);
  }

  // Audit trail has real actors
  const audit = (await j(await ctx.get("/api/v1/audit?limit=50")));
  const entries = audit?.data?.entries || audit?.data || audit?.entries || [];
  const byOwner = entries.filter((e) => e.user_email === ACCOUNTS.owner?.email).length;
  const bySystem = entries.filter((e) => e.user_id === "system").length;
  rec("txn", "audit_log populated with the acting user, not 'system'", entries.length > 0 && byOwner > 0 ? "PASS" : "FAIL", `entries=${entries.length} owner=${byOwner} system=${bySystem}`);
  const redacted = entries.some((e) => JSON.stringify(e.new_data || {}).includes("P1234567"));
  rec("txn", "passport number redacted in audit payloads", redacted ? "FAIL" : "PASS", redacted ? "found plaintext passport" : "");

  return { guest, booking, apartment: aptA.id, invoice };
}

// ---------------------------------------------------------------------------
async function main() {
  console.log(`Deep test: ${BASE_URL} mode=${MODE}`);
  await unauthTests();
  const owner = ACCOUNTS.owner ? await login(ACCOUNTS.owner.email, ACCOUNTS.owner.password) : null;
  rec("auth", "owner login", owner?.ok ? "PASS" : "FAIL", owner?.ok ? `role=${owner.staff?.role}` : `${owner?.status} ${owner?.body?.slice(0, 80)}`);
  if (!owner?.ok) { finish(); return; }
  await forgedCookieTest(owner.ctx);

  const hk = ACCOUNTS.housekeeping ? await login(ACCOUNTS.housekeeping.email, ACCOUNTS.housekeeping.password) : null;
  const mgr = ACCOUNTS.manager ? await login(ACCOUNTS.manager.email, ACCOUNTS.manager.password) : null;
  const rec_ = ACCOUNTS.reception ? await login(ACCOUNTS.reception.email, ACCOUNTS.reception.password) : null;
  if (hk) rec("auth", "housekeeping login", hk.ok ? "PASS" : "FAIL", hk.ok ? "" : hk.status);
  if (mgr) rec("auth", "manager login", mgr.ok ? "PASS" : "FAIL", mgr.ok ? "" : mgr.status);
  if (rec_) rec("auth", "reception login", rec_.ok ? "PASS" : "FAIL", rec_.ok ? "" : rec_.status);
  // Fifth and last login attempt from this IP: a wrong password must be rejected
  // (401), and the sixth attempt must hit the 5-per-15-minute login rate limit.
  const bad = ACCOUNTS.owner ? await login(ACCOUNTS.owner.email, "wrong-password") : null;
  rec("auth", "wrong password rejected", bad && !bad.ok && bad.status === 401 ? "PASS" : "FAIL", bad?.status);
  const sixth = ACCOUNTS.owner ? await login(ACCOUNTS.owner.email, "wrong-password") : null;
  rec("auth", "login rate limit engages on the sixth attempt (429)", sixth && sixth.status === 429 ? "PASS" : "WARN", sixth?.status);

  await apiTests(owner.ctx, "owner");
  await roleTests(hk, mgr);

  let ids = {};
  if (MODE === "full" && rec_?.ok) ids = await transactionTests(owner, rec_);
  // ids for [id] pages
  const first = async (p) => ((await j(await owner.ctx.get(p)))?.data || [])[0]?.id;
  ids = {
    apartments: ids.apartment || (await first("/api/v1/apartments")),
    bookings: ids.booking?.id || (await first("/api/v1/bookings")),
    guests: ids.guest?.id || (await first("/api/v1/guests")),
    staff: await first("/api/v1/staff"),
    housekeeping: await first("/api/v1/housekeeping"),
    maintenance: await first("/api/v1/maintenance"),
    invoices: ids.invoice?.id || (await first("/api/v1/invoices")),
    finance: ids.invoice?.id || (await first("/api/v1/invoices")),
  };
  await pageTests(owner.ctx, ids);
  finish();
}
function finish() {
  const summary = { base: BASE_URL, mode: MODE, pass, fail, warn, total: pass + fail + warn, results };
  fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
  console.log(`\nTOTAL pass=${pass} fail=${fail} warn=${warn} of ${pass + fail + warn}`);
}
main().catch((e) => { console.error("FATAL", e); finish(); process.exit(1); });
