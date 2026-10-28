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
// Vercel preview deployments sit behind Deployment Protection. The Vercel CLI
// issues a short-lived token (`vercel env run -- ...` exports VERCEL_OIDC_TOKEN)
// that the platform accepts in this header. It is only ever sent to BASE_URL,
// never to Supabase.
// x-vercel-skip-toolbar stops Vercel injecting its feedback toolbar script into
// the page for team members, which otherwise races React hydration (#418).
const EXTRA_HEADERS = process.env.VERCEL_OIDC_TOKEN ? { "x-vercel-trusted-oidc-idp-token": process.env.VERCEL_OIDC_TOKEN, "x-vercel-skip-toolbar": "1" } : {};
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
  const ctx = await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: EXTRA_HEADERS });
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
  const ctx = await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: EXTRA_HEADERS });
  const h = await ctx.get("/api/v1/health");
  rec("unauth", "health endpoint 200", h.status() === 200 ? "PASS" : "FAIL", h.status());
  const hb = await j(h);
  const stale = hb?.timestamp && (Date.now() - Date.parse(hb.timestamp)) > 3600_000;
  rec("unauth", "health timestamp is live (not prerendered)", stale ? "WARN" : "PASS", hb?.timestamp);
  rec("unauth", "health probes the database", hb?.checks?.database?.status === "ok" ? "PASS" : "FAIL", JSON.stringify(hb?.checks?.database));
  rec("unauth", "health probes the auth server", hb?.checks?.auth?.status === "ok" ? "PASS" : "FAIL", JSON.stringify(hb?.checks?.auth));
  rec("unauth", "health reports schema at expected migration level", hb?.checks?.database?.detail?.includes("missing") ? "FAIL" : "PASS", hb?.checks?.database?.detail || "ok");
  rec("unauth", "health leaks no stack traces or hostnames", /at .*\.js|postgres:\/\/|supabase\.co/i.test(JSON.stringify(hb)) ? "FAIL" : "PASS");
  rec("unauth", "health is not cached by proxies", /no-store/.test(h.headers()["cache-control"] || "") ? "PASS" : "FAIL", h.headers()["cache-control"]);
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
  const csp = hs["content-security-policy"] || "";
  const scriptSrc = (csp.match(/script-src[^;]*/) || [""])[0];
  rec("unauth", "CSP script-src uses a nonce and no unsafe-inline", /nonce-/.test(scriptSrc) && !/unsafe-inline/.test(scriptSrc) ? "PASS" : "FAIL", scriptSrc.slice(0, 120));
  rec("unauth", "CSP forbids framing and objects", /frame-ancestors 'none'/.test(csp) && /object-src 'none'/.test(csp) ? "PASS" : "FAIL", "");
  for (const k of ["strict-transport-security", "x-frame-options", "content-security-policy", "x-content-type-options"]) {
    rec("unauth", `security header ${k}`, hs[k] ? "PASS" : "WARN", hs[k] ? "present" : "missing");
  }
  await ctx.dispose();
}

// ---------------------------------------------------------------------------
// 2. Forged session cookie must not authenticate (gap 2)
// ---------------------------------------------------------------------------
function b64url(x) { return Buffer.from(typeof x === "string" ? x : JSON.stringify(x)).toString("base64url"); }
function hs256(payload, secret, header = { alg: "HS256", typ: "JWT" }) {
  const data = `${b64url(header)}.${b64url(payload)}`;
  const sig = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}
async function forgedCookieTest(ownerCtx) {
  const state = await ownerCtx.storageState();
  const authCookie = state.cookies.find((c) => c.name.includes("auth-token") && !c.name.endsWith(".1"));
  if (!authCookie) { rec("security", "locate session cookie", "WARN", "no auth-token cookie found"); return; }
  const cookieName = authCookie.name.replace(/\.0$/, "");
  const now = Math.floor(Date.now() / 1000);
  const claims = { sub: "00000000-0000-0000-0000-000000000001", aud: "authenticated", role: "authenticated", email: "owner@bastet.com", aal: "aal2", session_id: "11111111-1111-1111-1111-111111111111", iat: now, exp: now + 3600 };
  const variants = {
    "garbage token": "forged.jwt.token",
    "HS256 signed with the wrong secret": hs256(claims, "not-the-project-secret-but-long-enough-to-look-real"),
    "alg none": `${b64url({ alg: "none", typ: "JWT" })}.${b64url(claims)}.`,
    "service_role claim with wrong secret": hs256({ ...claims, role: "service_role" }, "x".repeat(40)),
  };
  if (process.env.SB_JWT_SECRET) {
    variants["expired token with the real secret"] = hs256({ ...claims, iat: now - 7200, exp: now - 3600 }, process.env.SB_JWT_SECRET);
    variants["real secret but role=anon"] = hs256({ ...claims, role: "anon" }, process.env.SB_JWT_SECRET);
  }
  for (const [label, token] of Object.entries(variants)) {
    const forged = { access_token: token, refresh_token: "x", expires_at: now + 3600, token_type: "bearer", user: { id: claims.sub, aud: "authenticated", role: "authenticated", email: claims.email } };
    const value = "base64-" + b64url(forged);
    const ctx = await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { ...EXTRA_HEADERS, cookie: `${cookieName}=${value}` } });
    for (const p of ["/api/v1/admin/users", "/api/v1/bookings"]) {
      const r = await ctx.get(p);
      rec("security", `forged session (${label}) GET ${p} rejected`, r.status() === 401 || r.status() === 403 ? "PASS" : "FAIL", r.status());
    }
    await ctx.dispose();
  }
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
  const context = await browser.newContext({ baseURL: BASE_URL, extraHTTPHeaders: EXTRA_HEADERS, storageState: await ownerCtx.storageState(), viewport: { width: 1366, height: 900 } });
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
    if (route === "/dashboard/bookings/new") {
      const optionCount = await page.locator("select").first().locator("option").count();
      const availableTotal = ((await j(await ownerCtx.get("/api/v1/apartments?status=available&limit=1000")))?.data || []).filter((a) => a.status === "available").length;
      rec("pages", "/dashboard/bookings/new lists every available room", optionCount - 1 >= availableTotal && availableTotal > 0 ? "PASS" : "FAIL", `${optionCount - 1} options for ${availableTotal} available rooms`);
    }
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
async function roleTests(hk, mgr, owner) {
  if (owner?.ok) {
    const foreign = await owner.ctx.get("/api/v1/briefing", { headers: { "X-Property-Id": "11111111-1111-1111-1111-111111111111" } });
    rec("roles", "owner X-Property-Id without membership is denied", [400, 401, 403, 404].includes(foreign.status()) ? "PASS" : "FAIL", foreign.status());
  }
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
    const guests = (await j(await mgr.ctx.get("/api/v1/guests")))?.data || [];
    if (guests[0]) {
      const exp = await mgr.ctx.get(`/api/v1/gdpr?action=export&guest_id=${guests[0].id}`);
      rec("roles", "manager GDPR export -> 403 (admin only)", exp.status() === 403 ? "PASS" : "FAIL", exp.status());
    }
  }
}

// ---------------------------------------------------------------------------
// 6. Transactions (full mode only, local DB)
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Broadcast notifications must reach OTHER staff (RLS + RETURNING regression)
// ---------------------------------------------------------------------------
async function notificationTests(owner, reception) {
  if (!reception?.ok) return;
  const title = `Deep test broadcast ${Date.now()}`;
  const before = (await j(await reception.ctx.get("/api/v1/notifications?unread_only=true&limit=50")))?.unread_count ?? 0;
  const post = await owner.ctx.post("/api/v1/notifications", { headers: H(owner.csrf), data: { action: "create", title, message: "If you can read this, broadcast works", type: "info", category: "system" } });
  const body = await j(post);
  rec("txn", "owner broadcasts a notification -> 201 with a count", post.status() === 201 && body?.data?.created > 1 ? "PASS" : "FAIL", `${post.status()} ${JSON.stringify(body)?.slice(0, 80)}`);
  const after = await j(await reception.ctx.get("/api/v1/notifications?unread_only=true&limit=50"));
  const seen = (after?.notifications || []).some((n) => n.title === title);
  rec("txn", "reception receives the broadcast in their unread list", seen ? "PASS" : "FAIL", `unread ${before} -> ${after?.unread_count}`);
  const ownSeen = ((await j(await owner.ctx.get("/api/v1/notifications?unread_only=true&limit=50")))?.notifications || []).some((n) => n.title === title);
  rec("txn", "owner receives their own copy of the broadcast", ownSeen ? "PASS" : "FAIL");
}

// ---------------------------------------------------------------------------
// Rate plans (00027): plans price stays; sold bookings keep their snapshot
// ---------------------------------------------------------------------------
async function ratePlanTests(owner, mgr, reception, hk) {
  const code = "DT" + Date.now().toString().slice(-6);
  if (hk?.ok) {
    const r = await hk.ctx.post("/api/v1/rate-plans", { headers: H(hk.csrf), data: { code, name: "Nope" } });
    rec("txn", "housekeeping cannot create rate plans -> 403", r.status() === 403 ? "PASS" : "FAIL", r.status());
  }
  const list = await j(await owner.ctx.get("/api/v1/rate-plans"));
  rec("txn", "rate plans list has a default plan", (list?.data || []).some((p) => p.is_default) ? "PASS" : "FAIL", (list?.data || []).map((p) => p.code).join(","));
  const create = await (mgr?.ok ? mgr : owner).ctx.post("/api/v1/rate-plans", { headers: H((mgr?.ok ? mgr : owner).csrf), data: { code, name: "Deep test non-refundable", pricing_mode: "percent_off", adjustment: 10, cancellation_policy: "non_refundable", free_cancellation_days: 0, min_nights: 2 } });
  const plan = (await j(create))?.data;
  rec("txn", "manager creates a 10% off plan with min 2 nights -> 201", create.status() === 201 && plan?.code === code ? "PASS" : "FAIL", `${create.status()} ${JSON.stringify(await j(create))?.slice(0, 80)}`);
  if (!plan) return;
  const bad = await (mgr?.ok ? mgr : owner).ctx.post("/api/v1/rate-plans", { headers: H((mgr?.ok ? mgr : owner).csrf), data: { code: "BAD1", name: "Too generous", pricing_mode: "percent_off", adjustment: 150 } });
  rec("txn", "150% discount rejected -> 400", bad.status() === 400 ? "PASS" : "FAIL", bad.status());

  const apts = (await j(await owner.ctx.get("/api/v1/apartments?status=available&limit=5")))?.data || [];
  const apt = apts.find((a) => a.status === "available");
  if (!apt) { rec("txn", "rate plan quote needs an available apartment", "WARN", "none"); return; }
  const ctx = reception?.ok ? reception : owner;
  const bar = await j(await ctx.ctx.get("/api/v1/bookings/quote?" + new URLSearchParams(Object.fromEntries(Object.entries({ apartment_id: apt.id, check_in: plus(40), check_out: plus(42) }).filter(([, v]) => v != null))).toString()));
  const q = await j(await ctx.ctx.get("/api/v1/bookings/quote?" + new URLSearchParams(Object.fromEntries(Object.entries({ apartment_id: apt.id, check_in: plus(40), check_out: plus(42), rate_plan_id: plan.id }).filter(([, v]) => v != null))).toString()));
  const expected = Math.round((bar?.data?.total_gbp || 0) * 0.9 * 100) / 100;
  rec("txn", "quote with the plan is 10% below the default quote", q?.data && Math.abs(q.data.total_gbp - expected) <= 0.02 && q.data.nights === 2 ? "PASS" : "FAIL", `default ${bar?.data?.total_gbp} plan ${q?.data?.total_gbp} expected ${expected}`);
  rec("txn", "quote lists one priced night per date", q?.data?.nightly?.length === 2 && q.data.nightly.every((n) => n.rate_gbp > 0) ? "PASS" : "FAIL", JSON.stringify(q?.data?.nightly)?.slice(0, 100));
  const short = await ctx.ctx.get("/api/v1/bookings/quote?" + new URLSearchParams(Object.fromEntries(Object.entries({ apartment_id: apt.id, check_in: plus(40), check_out: plus(41), rate_plan_id: plan.id }).filter(([, v]) => v != null))).toString());
  const shortBody = await j(short);
  rec("txn", "one-night quote on a 2-night-minimum plan -> 400 MIN_NIGHTS", short.status() === 400 && JSON.stringify(shortBody).includes("MIN_NIGHTS") ? "PASS" : "FAIL", `${short.status()} ${JSON.stringify(shortBody)?.slice(0, 80)}`);

  const guests = (await j(await owner.ctx.get("/api/v1/guests?limit=1")))?.data || [];
  if (!guests[0]) return;
  const bk = await ctx.ctx.post("/api/v1/bookings", { headers: H(ctx.csrf), data: { apartment_id: apt.id, guest_id: guests[0].id, check_in: plus(40), check_out: plus(42), adults: 1, rate_plan_id: plan.id } });
  const booking = (await j(bk))?.data;
  rec("txn", "booking priced by the plan matches the quote and stores the snapshot", bk.status() === 201 && booking && Math.abs(booking.total_amount_gbp - q.data.total_gbp) <= 0.01 && booking.rate_plan_snapshot?.code === code ? "PASS" : "FAIL", `${bk.status()} total ${booking?.total_amount_gbp} snapshot ${booking?.rate_plan_snapshot?.code}`);
  if (booking?.id) {
    // Retiring or editing the plan must not change the sold booking
    const retire = await (mgr?.ok ? mgr : owner).ctx.delete(`/api/v1/rate-plans/${plan.id}`, { headers: H((mgr?.ok ? mgr : owner).csrf) });
    rec("txn", "plan retired after sale -> 200", retire.status() === 200 ? "PASS" : "FAIL", retire.status());
    const again = await j(await owner.ctx.get(`/api/v1/bookings/${booking.id}`));
    rec("txn", "sold booking keeps its price and snapshot after the plan is retired", again?.data?.total_amount_gbp === booking.total_amount_gbp && again?.data?.rate_plan_snapshot?.code === code ? "PASS" : "FAIL");
    const retiredQuote = await ctx.ctx.get("/api/v1/bookings/quote?" + new URLSearchParams(Object.fromEntries(Object.entries({ apartment_id: apt.id, check_in: plus(50), check_out: plus(52), rate_plan_id: plan.id }).filter(([, v]) => v != null))).toString());
    rec("txn", "retired plan can no longer price a stay -> 409", retiredQuote.status() === 409 ? "PASS" : "FAIL", retiredQuote.status());
    await ctx.ctx.post(`/api/v1/bookings/${booking.id}/cancel`, { headers: H(ctx.csrf), data: { reason: "deep test cleanup" } });
  }
}

// ---------------------------------------------------------------------------
// Group bookings (00028): atomic room blocks, statement, shared payment, cancel
// ---------------------------------------------------------------------------
async function groupTests(owner, reception, hk) {
  const ctx = reception?.ok ? reception : owner;
  const apts = ((await j(await owner.ctx.get("/api/v1/apartments?status=available&limit=50")))?.data || []).filter((a) => a.status === "available");
  if (apts.length < 3) { rec("txn", "group tests need 3 available apartments", "WARN", apts.length); return; }
  const plans = (await j(await owner.ctx.get("/api/v1/rate-plans")))?.data || [];
  const nrf = plans.find((p) => p.code === "NRF");
  if (hk?.ok) {
    const r = await hk.ctx.post("/api/v1/groups", { headers: H(hk.csrf), data: { name: "Nope", check_in: plus(80), check_out: plus(82) } });
    rec("txn", "housekeeping cannot create groups -> 403", r.status() === 403 ? "PASS" : "FAIL", r.status());
  }
  const bad = await ctx.ctx.post("/api/v1/groups", { headers: H(ctx.csrf), data: { name: "Bad dates", check_in: plus(82), check_out: plus(80) } });
  rec("txn", "group with check_out before check_in -> 400", bad.status() === 400 ? "PASS" : "FAIL", bad.status());

  const create = await ctx.ctx.post("/api/v1/groups", { headers: H(ctx.csrf), data: { name: "Deep test tour group", organiser_name: "Tour Co", check_in: plus(80), check_out: plus(82), rooms_requested: 2, rate_plan_id: nrf?.id ?? null, status: "confirmed", apartment_ids: [apts[0].id, apts[1].id], adults: 2 } });
  const group = (await j(create))?.data;
  rec("txn", "create a confirmed group with 2 rooms -> 201", create.status() === 201 && group?.reference?.startsWith("GRP-") && group?.rooms?.rooms_added === 2 ? "PASS" : "FAIL", `${create.status()} ${JSON.stringify(await j(create))?.slice(0, 100)}`);
  if (!group?.id) return;

  const st = (await j(await ctx.ctx.get(`/api/v1/groups/${group.id}`)))?.data;
  const sumRooms = (st?.rooms || []).reduce((s, r) => s + Number(r.contract_total_gbp), 0);
  rec("txn", "group statement lists 2 confirmed rooms priced by the group plan", st?.room_count === 2 && st.rooms.every((r) => r.status === "confirmed") && Math.abs(st.contract_total_gbp - sumRooms) < 0.01 && st.contract_total_gbp > 0 ? "PASS" : "FAIL", JSON.stringify({ rooms: st?.room_count, total: st?.contract_total_gbp, statuses: st?.rooms?.map((r) => r.status) }));
  const snapshotOk = nrf ? (await j(await owner.ctx.get(`/api/v1/bookings/${st.rooms[0].booking_id}`)))?.data?.rate_plan_snapshot?.code === "NRF" : true;
  rec("txn", "group rooms carry the group's rate plan snapshot", snapshotOk ? "PASS" : "FAIL");

  // Atomic add: one room already blocked by this group, one new -> nothing is added
  const atomic = await ctx.ctx.post(`/api/v1/groups/${group.id}/rooms`, { headers: H(ctx.csrf), data: { apartment_ids: [apts[2].id, apts[0].id] } });
  const after = (await j(await ctx.ctx.get(`/api/v1/groups/${group.id}`)))?.data;
  rec("txn", "adding a room set with a conflict -> 409 and no room is added", atomic.status() === 409 && after?.room_count === 2 ? "PASS" : "FAIL", `${atomic.status()} rooms=${after?.room_count}`);
  const add = await ctx.ctx.post(`/api/v1/groups/${group.id}/rooms`, { headers: H(ctx.csrf), data: { apartment_ids: [apts[2].id] } });
  rec("txn", "adding a free room -> 201", add.status() === 201 ? "PASS" : "FAIL", add.status());

  // One organiser payment allocated across rooms (deposit before arrival)
  const pay = await ctx.ctx.post(`/api/v1/groups/${group.id}/payments`, { headers: H(ctx.csrf), data: { amount_gbp: 40, method: "bank_transfer", reference: "DT-GROUP" } });
  const payBody = await j(pay);
  const paid = (await j(await ctx.ctx.get(`/api/v1/groups/${group.id}`)))?.data;
  rec("txn", "group payment of 40 is allocated to room folios and shows on the statement", pay.status() === 201 && (payBody?.data?.allocations || []).reduce((s, a) => s + Number(a.amount_gbp), 0) === 40 && Math.abs((paid?.paid_gbp || 0) - 40) < 0.01 ? "PASS" : "FAIL", `${pay.status()} paid=${paid?.paid_gbp} alloc=${JSON.stringify(payBody?.data?.allocations)?.slice(0, 80)}`);
  const over = await ctx.ctx.post(`/api/v1/groups/${group.id}/payments`, { headers: H(ctx.csrf), data: { amount_gbp: 999999, method: "cash" } });
  rec("txn", "payment above what the rooms owe -> 400 OVERPAYMENT", over.status() === 400 ? "PASS" : "FAIL", over.status());

  // Dates are locked while rooms are blocked
  const move = await ctx.ctx.patch(`/api/v1/groups/${group.id}`, { headers: H(ctx.csrf), data: { check_in: plus(81) } });
  rec("txn", "changing group dates with rooms blocked -> 409", move.status() === 409 ? "PASS" : "FAIL", move.status());

  // Cancel the group: all rooms released
  const cancel = await ctx.ctx.delete(`/api/v1/groups/${group.id}`, { headers: H(ctx.csrf), data: { reason: "deep test cleanup" } });
  const gone = (await j(await ctx.ctx.get(`/api/v1/groups/${group.id}`)))?.data;
  rec("txn", "cancelling the group cancels its rooms", cancel.status() === 200 && gone?.group?.status === "cancelled" && gone?.room_count === 0 ? "PASS" : "FAIL", `${cancel.status()} status=${gone?.group?.status} rooms=${gone?.room_count}`);
  const firstRoom = (await j(await owner.ctx.get(`/api/v1/bookings/${st.rooms[0].booking_id}`)))?.data;
  rec("txn", "cancelled group rooms are released (booking cancelled)", firstRoom?.status === "cancelled" ? "PASS" : "FAIL", firstRoom?.status);
}

// ---------------------------------------------------------------------------
// Guest portal (00029): tokenised link, public stay view, pre-check-in, revoke
// ---------------------------------------------------------------------------

// An available apartment and a guest, with the raw responses described when
// either is missing so a rate limit, an expired session or an empty seed is
// told apart from a real availability problem.
async function preconditions(ctx) {
  const ar = await ctx.get("/api/v1/apartments?status=available&limit=50");
  const gr = await ctx.get("/api/v1/guests?limit=1");
  const aj = await j(ar);
  let gj = await j(gr);
  if (gr.ok() && (gj?.data || []).length === 0) {
    // Nothing visible yet: make one so the sections that need a guest can run.
    const csrf = (await j(await ctx.get("/api/v1/csrf")))?.data?.token;
    await ctx.post("/api/v1/guests", { headers: H(csrf), data: { first_name: "Deep", last_name: "Precondition", email: `deep.pre.${Date.now()}@example.com`, nationality: "GB" } });
    gj = await j(await ctx.get("/api/v1/guests?limit=1"));
  }
  const apt = (aj?.data || []).find((a) => a.status === "available");
  const guest = (gj?.data || [])[0];
  const detail = `apartments ${ar.status()} n=${(aj?.data || []).length} ${JSON.stringify(aj?.error || "").slice(0, 120)}; guests ${gr.status()} n=${(gj?.data || []).length} ${JSON.stringify(gj?.error || "").slice(0, 120)}`;
  return { apt, guest, detail };
}
async function portalTests(owner, reception, hk) {
  const ctx = reception?.ok ? reception : owner;
  // Make our own upcoming confirmed stay so the test does not depend on seed dates
  const pre = await preconditions(owner.ctx);
  const { apt, guest } = pre;
  if (!apt || !guest) { rec("txn", "portal tests need an available apartment and a guest", "FAIL", pre.detail); return; }
  const made = await ctx.ctx.post("/api/v1/bookings", { headers: H(ctx.csrf), data: { apartment_id: apt.id, guest_id: guest.id, check_in: plus(30), check_out: plus(32), adults: 2 } });
  let upcoming = (await j(made))?.data;
  if (!upcoming?.id) { rec("txn", "portal tests could not create a booking", "FAIL", `${made.status()} ${(await made.text()).slice(0, 80)}`); return; }
  await ctx.ctx.patch(`/api/v1/bookings/${upcoming.id}`, { headers: H(ctx.csrf), data: { status: "confirmed" } });
  upcoming = (await j(await owner.ctx.get(`/api/v1/bookings/${upcoming.id}`)))?.data || upcoming;
  if (hk?.ok) {
    const r = await hk.ctx.post(`/api/v1/bookings/${upcoming.id}/portal-link`, { headers: H(hk.csrf) });
    rec("txn", "housekeeping cannot create portal links -> 403", r.status() === 403 ? "PASS" : "FAIL", r.status());
  }
  const create = await ctx.ctx.post(`/api/v1/bookings/${upcoming.id}/portal-link`, { headers: H(ctx.csrf) });
  const link = (await j(create))?.data;
  rec("txn", "front desk creates a portal link -> 201 with a /stay URL", create.status() === 201 && /\/stay\/[A-Za-z0-9_-]{43}$/.test(link?.url || "") ? "PASS" : "FAIL", `${create.status()} ${link?.url}`);
  if (!link?.url) return;
  const token = link.url.split("/stay/")[1];
  const pub = await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: EXTRA_HEADERS });   // no cookies at all
  const stayRes = await pub.get(`/api/v1/portal/${token}`);
  const stay = (await j(stayRes))?.data;
  rec("txn", "public portal returns the stay for the token (no session)", stayRes.status() === 200 && stay?.booking?.reference === upcoming.reference ? "PASS" : "FAIL", `${stayRes.status()} ${stay?.booking?.reference}`);
  const raw = JSON.stringify(stay || {});
  rec("txn", "portal payload has no passport, internal notes, guest email/phone or other bookings", !/passport|internal_notes|"email":"[^"]*@|"phone":"\+?\d/.test(raw.replace(JSON.stringify(stay?.property || {}), "")) ? "PASS" : "FAIL");
  rec("txn", "portal payload shows the rate plan terms when the booking has a plan", !upcoming.rate_plan_id || stay?.booking?.rate_plan?.cancellation ? "PASS" : "FAIL");
  const bad = await pub.get(`/api/v1/portal/${"A".repeat(43)}`);
  rec("txn", "unknown token -> 404", bad.status() === 404 ? "PASS" : "FAIL", bad.status());
  const malformed = await pub.get(`/api/v1/portal/not-a-token`);
  rec("txn", "malformed token -> 404", malformed.status() === 404 ? "PASS" : "FAIL", malformed.status());
  const noTerms = await pub.post(`/api/v1/portal/${token}/precheckin`, { headers: { "Content-Type": "application/json" }, data: { accept_terms: false, arrival_time: "15:00" } });
  rec("txn", "pre-check-in without accepting terms -> 400", noTerms.status() === 400 ? "PASS" : "FAIL", noTerms.status());
  const pc = await pub.post(`/api/v1/portal/${token}/precheckin`, { headers: { "Content-Type": "application/json" }, data: { accept_terms: true, arrival_time: "15:30", special_requests: "Deep test: cot please", adults: upcoming.adults || 1 } });
  const after = (await j(await owner.ctx.get(`/api/v1/bookings/${upcoming.id}`)))?.data;
  rec("txn", "pre-check-in stores answers on the booking and marks it completed", pc.status() === 201 && after?.precheckin_completed_at && after?.precheckin?.arrival_time === "15:30" && /cot please/.test(after?.special_requests || "") ? "PASS" : "FAIL", `${pc.status()} completed=${after?.precheckin_completed_at}`);
  const notif = ((await j(await ctx.ctx.get("/api/v1/notifications?unread_only=true&limit=50")))?.notifications || []).some((n) => n.title === `Online check-in: ${upcoming.reference}`);
  rec("txn", "front desk is notified of the online check-in", notif ? "PASS" : "FAIL");
  const revoke = await ctx.ctx.delete(`/api/v1/bookings/${upcoming.id}/portal-link`, { headers: H(ctx.csrf) });
  const gone = await pub.get(`/api/v1/portal/${token}`);
  rec("txn", "revoked link -> 404", revoke.status() === 200 && gone.status() === 404 ? "PASS" : "FAIL", `${revoke.status()} ${gone.status()}`);
  await pub.dispose();
  await ctx.ctx.post(`/api/v1/bookings/${upcoming.id}/cancel`, { headers: H(ctx.csrf), data: { reason: "deep test cleanup" } });
}

// ---------------------------------------------------------------------------
// Point of sale (00030): outlet charges land on the in-house folio
// ---------------------------------------------------------------------------
async function posTests(owner, mgr, reception, hk) {
  const ctx = reception?.ok ? reception : owner;
  const m = mgr?.ok ? mgr : owner;
  const outlets = (await j(await owner.ctx.get("/api/v1/pos/outlets")))?.data || [];
  const bar = outlets.find((o) => o.code === "POOL") || outlets[0];
  rec("txn", "POS outlets are listed with their catalogue", outlets.length >= 1 && (bar?.items || []).length >= 1 ? "PASS" : "FAIL", `${outlets.length} outlets, ${bar?.items?.length} items`);
  if (!bar) return;
  if (hk?.ok) {
    const r = await hk.ctx.post("/api/v1/pos/outlets", { headers: H(hk.csrf), data: { code: "HKX", name: "Nope" } });
    rec("txn", "housekeeping cannot create outlets -> 403", r.status() === 403 ? "PASS" : "FAIL", r.status());
  }
  // Make an in-house stay for today
  const pre = await preconditions(owner.ctx);
  const { apt, guest } = pre;
  if (!apt || !guest) { rec("txn", "POS tests need an available apartment and a guest", "FAIL", pre.detail); return; }
  const made = await ctx.ctx.post("/api/v1/bookings", { headers: H(ctx.csrf), data: { apartment_id: apt.id, guest_id: guest.id, check_in: today, check_out: plus(2), adults: 1 } });
  const booking = (await j(made))?.data;
  if (!booking?.id) { rec("txn", "POS tests could not create a booking", "FAIL", `${made.status()}`); return; }
  await ctx.ctx.patch(`/api/v1/bookings/${booking.id}`, { headers: H(ctx.csrf), data: { status: "confirmed" } });
  const notYet = await ctx.ctx.post("/api/v1/pos/tickets", { headers: H(ctx.csrf), data: { outlet_id: bar.id, booking_id: booking.id, items: [{ item_id: bar.items[0].id, quantity: 1 }] } });
  rec("txn", "charging a guest who is not in house -> 409 NOT_IN_HOUSE", notYet.status() === 409 ? "PASS" : "FAIL", notYet.status());
  const ci = await ctx.ctx.post(`/api/v1/bookings/${booking.id}/checkin`, { headers: H(ctx.csrf), data: {} });
  if (ci.status() !== 200) { rec("txn", "POS tests need a check-in", "WARN", `${ci.status()} ${(await ci.text()).slice(0, 80)}`); await ctx.ctx.post(`/api/v1/bookings/${booking.id}/cancel`, { headers: H(ctx.csrf), data: { reason: "deep test cleanup" } }); return; }

  const who = await j(await ctx.ctx.get(`/api/v1/pos/in-house?room=${encodeURIComponent(apt.number)}`));
  rec("txn", "till finds the in-house guest by room number", who?.data?.booking_id === booking.id ? "PASS" : "FAIL", JSON.stringify(who?.data || who)?.slice(0, 100));
  const before = (await j(await ctx.ctx.get(`/api/v1/bookings/${booking.id}/folio`)))?.data;
  const item = bar.items[0];
  const post = await ctx.ctx.post("/api/v1/pos/tickets", { headers: H(ctx.csrf), data: { outlet_id: bar.id, room_number: apt.number, ticket_reference: "DT-1", items: [{ item_id: item.id, quantity: 2 }, { name: "Service", unit_price_gbp: 1.5, tax_rate_percent: 0 }] } });
  const ticket = (await j(post))?.data;
  const expectedNet = Math.round((2 * Number(item.unit_price_gbp) + 1.5) * 100) / 100;
  rec("txn", "ticket by room number posts to the folio with catalogue prices", post.status() === 201 && Math.abs(Number(ticket?.subtotal_gbp) - expectedNet) < 0.01 && ticket?.items?.length === 2 ? "PASS" : "FAIL", `${post.status()} subtotal=${ticket?.subtotal_gbp} expected=${expectedNet}`);
  const after = (await j(await ctx.ctx.get(`/api/v1/bookings/${booking.id}/folio`)))?.data;
  const delta = Number(after?.balance_gbp ?? after?.balance ?? 0) - Number(before?.balance_gbp ?? before?.balance ?? 0);
  rec("txn", "folio balance rises by the ticket total (net plus VAT)", Math.abs(delta - Number(ticket?.total_gbp)) < 0.01 ? "PASS" : "FAIL", `delta=${delta} total=${ticket?.total_gbp}`);
  const fake = await ctx.ctx.post("/api/v1/pos/tickets", { headers: H(ctx.csrf), data: { outlet_id: bar.id, booking_id: booking.id, items: [{ item_id: "6f1c2a3e-1b2c-4d5e-8f90-123456789001", quantity: 1 }] } });
  rec("txn", "unknown catalogue item -> 404", fake.status() === 404 ? "PASS" : "FAIL", fake.status());
  const noReason = await m.ctx.delete(`/api/v1/pos/tickets/${ticket?.ticket_id}`, { headers: H(m.csrf), data: {} });
  rec("txn", "void without a reason -> 400", noReason.status() === 400 ? "PASS" : "FAIL", noReason.status());
  if (reception?.ok) {
    const recVoid = await reception.ctx.delete(`/api/v1/pos/tickets/${ticket?.ticket_id}`, { headers: H(reception.csrf), data: { reason: "not allowed" } });
    rec("txn", "reception cannot void a ticket -> 403", recVoid.status() === 403 ? "PASS" : "FAIL", recVoid.status());
  }
  const voided = await m.ctx.delete(`/api/v1/pos/tickets/${ticket?.ticket_id}`, { headers: H(m.csrf), data: { reason: "deep test void" } });
  const afterVoid = (await j(await ctx.ctx.get(`/api/v1/bookings/${booking.id}/folio`)))?.data;
  const back = Number(afterVoid?.balance_gbp ?? afterVoid?.balance ?? 0) - Number(before?.balance_gbp ?? before?.balance ?? 0);
  rec("txn", "manager void reverses every line and the balance returns", voided.status() === 200 && Math.abs(back) < 0.01 ? "PASS" : "FAIL", `${voided.status()} residual=${back}`);
  const tix = (await j(await owner.ctx.get(`/api/v1/pos/tickets?booking_id=${booking.id}`)))?.data || [];
  rec("txn", "ticket history shows the voided ticket", tix.some((t) => t.id === ticket?.ticket_id && t.status === "voided") ? "PASS" : "FAIL");
  // Cleanup: settle anything and check out, or cancel
  await ctx.ctx.post(`/api/v1/bookings/${booking.id}/checkout`, { headers: H(ctx.csrf), data: { allow_outstanding_balance: true } }).catch(() => null);
}

// ---------------------------------------------------------------------------
// Accounting export (00031): balanced journal from the folio ledger
// ---------------------------------------------------------------------------
async function exportTests(owner, mgr, reception) {
  const m = mgr?.ok ? mgr : owner;
  const from = plus(-60), to = plus(1);
  if (reception?.ok) {
    const r = await reception.ctx.get(`/api/v1/finance/export?from=${from}&to=${to}`);
    rec("finance", "reception cannot download the accounting export -> 403", r.status() === 403 ? "PASS" : "FAIL", r.status());
  }
  const bad = await m.ctx.get(`/api/v1/finance/export?from=${to}&to=${from}`);
  rec("finance", "export with from after to -> 400", bad.status() === 400 ? "PASS" : "FAIL", bad.status());
  const res = await m.ctx.get(`/api/v1/finance/export?from=${from}&to=${to}&type=journal&format=json`);
  const body = (await j(res))?.data;
  rec("finance", "journal export returns entries for the period", res.status() === 200 && Array.isArray(body?.entries) && body.entries.length > 0 ? "PASS" : "FAIL", `${res.status()} entries=${body?.entries?.length}`);
  rec("finance", "journal debits equal credits (balanced)", body?.check?.balanced === true && body.check.total_debit === body.check.total_credit ? "PASS" : "FAIL", JSON.stringify(body?.check));
  const perEntry = (body?.entries || []).every((e) => Math.abs((e.legs[0].debit + e.legs[1].debit) - (e.legs[0].credit + e.legs[1].credit)) < 0.005 && e.legs.every((l) => l.account_code));
  rec("finance", "every journal entry is balanced and mapped to an account", perEntry ? "PASS" : "FAIL");
  const types = new Set((body?.entries || []).map((e) => e.type));
  rec("finance", "journal covers room charges, tax and payments", ["room", "tax", "payment"].every((t) => types.has(t)) ? "PASS" : "WARN", [...types].join(","));
  const sum = (await j(await m.ctx.get(`/api/v1/finance/export?from=${from}&to=${to}&type=summary`)))?.data;
  const guest = (sum?.accounts || []).find((a) => a.account_key === "guest_ledger");
  rec("finance", "summary lists the guest ledger control account with totals", guest && guest.debit > 0 ? "PASS" : "FAIL", JSON.stringify(guest));
  const csv = await m.ctx.get(`/api/v1/finance/export?from=${from}&to=${to}&format=csv`);
  const text = await csv.text();
  rec("finance", "CSV download has a filename, a header row and the balanced flag", csv.status() === 200 && /attachment; filename=/.test(csv.headers()["content-disposition"] || "") && text.startsWith("date,entry_id,type,booking,folio,account_code") && csv.headers()["x-journal-balanced"] === "true" ? "PASS" : "FAIL", `${csv.status()} ${csv.headers()["content-disposition"]}`);
  const accounts = (await j(await m.ctx.get("/api/v1/finance/accounts")))?.data || [];
  rec("finance", "chart of accounts has the eleven default accounts", accounts.length >= 11 && accounts.some((a) => a.key === "room_revenue") ? "PASS" : "FAIL", accounts.length);
  const renamed = await m.ctx.put("/api/v1/finance/accounts", { headers: H(m.csrf), data: { accounts: [{ key: "room_revenue", code: "4000", name: "Room revenue" }] } });
  rec("finance", "manager can update account codes", renamed.status() === 200 ? "PASS" : "FAIL", renamed.status());
}

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
  if (SUPABASE_URL && SUPABASE_SERVICE) {
    const raw = await (await request.newContext()).get(`${SUPABASE_URL}/rest/v1/guests?id=eq.${guest.id}&select=passport_number`, { headers: { apikey: SUPABASE_SERVICE, Authorization: `Bearer ${SUPABASE_SERVICE}` } });
    const stored = (await j(raw))?.[0]?.passport_number || "";
    rec("txn", "passport number encrypted at rest", stored.startsWith("enc:v1:") ? "PASS" : "FAIL", stored.slice(0, 24));
  }
  const listRow = ((await j(await ctx.get("/api/v1/guests")))?.data || []).find((x) => x.id === guest.id);
  rec("txn", "passport number absent from guest list payload", listRow && !("passport_number" in listRow) ? "PASS" : "FAIL", listRow ? Object.keys(listRow).includes("passport_number") ? "present" : "absent" : "row not found");
  const detail = (await j(await ctx.get(`/api/v1/guests/${guest.id}`)))?.data;
  rec("txn", "passport number decrypted on guest detail for front desk", detail?.passport_number === "P1234567" ? "PASS" : "FAIL", detail?.passport_number);

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

  // The stay's room nights live on the folio (migration 00026); settle it before departure.
  const preCo = await reception.ctx.post(`/api/v1/bookings/${booking.id}/checkout`, { headers: H(reception.csrf), data: {} });
  rec("txn", "check-out refused while the folio (room night + VAT) is unpaid", preCo.status() === 402 ? "PASS" : "FAIL", `${preCo.status()} ${(await preCo.text()).slice(0, 80)}`);
  const fol = await j(await ctx.get(`/api/v1/bookings/${booking.id}/folio`));
  const owed = Number(fol?.data?.balance_gbp || 0);
  rec("txn", "folio shows the room night after the refused check-out", (fol?.data?.lines || []).some((l) => l.type === "room") && owed > 0 ? "PASS" : "FAIL", `balance=${owed}`);
  if (owed > 0) await ctx.post(`/api/v1/bookings/${booking.id}/folio`, { headers: H(csrf), data: { action: "post_payment", amount_gbp: owed, method: "cash" } });
  const co = await reception.ctx.post(`/api/v1/bookings/${booking.id}/checkout`, { headers: H(reception.csrf), data: { notes: "deep test out" } });
  const coBody = await j(co);
  rec("txn", "check-out via checkout_booking() as receptionist", co.status() === 200 ? "PASS" : "FAIL", `${co.status()} ${JSON.stringify(coBody?.meta || coBody).slice(0, 100)}`);
  const hkAfter = ((await j(await ctx.get(`/api/v1/housekeeping?apartment_id=${aptA.id}`)))?.data || []).filter((t) => t.type === "checkout_clean").length;
  rec("txn", "exactly one checkout_clean task created", hkAfter - hkBefore === 1 ? "PASS" : "FAIL", `before=${hkBefore} after=${hkAfter}`);
  const aptAfterCo = (await j(await ctx.get(`/api/v1/apartments/${aptA.id}`)))?.data;
  rec("txn", "apartment set to cleaning after check-out", aptAfterCo?.status === "cleaning" ? "PASS" : "FAIL", aptAfterCo?.status);
  const guestAfter = (await j(await ctx.get(`/api/v1/guests/${guest.id}`)))?.data;
  rec("txn", "loyalty points and stay count posted to guest", guestAfter && guestAfter.total_stays === 1 && guestAfter.loyalty_points > 0 ? "PASS" : "FAIL", `stays=${guestAfter?.total_stays} points=${guestAfter?.loyalty_points} tier=${guestAfter?.loyalty_tier}`);

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

  // Data integrity: concurrency, pagination, schema-aligned validation, night audit
  await integrityTests(ctx, csrf, guest, direct, available);
  // Finance: folio ledger, refunds, voids, invoice from folio, budgets, revenue by stay date
  await financeTests(ctx, csrf, reception, guest, direct, available);

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
// TOTP (RFC 6238) for the MFA journey — base32 secret, SHA-1, 30 s, 6 digits
// ---------------------------------------------------------------------------
import { createHmac } from "node:crypto";
function base32Decode(str) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "", out = [];
  for (const ch of str.replace(/=+$/, "").toUpperCase()) {
    const v = alphabet.indexOf(ch); if (v < 0) continue;
    bits += v.toString(2).padStart(5, "0");
  }
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}
function totp(secret, at = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
  const h = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  const code = ((h[o] & 0x7f) << 24 | h[o + 1] << 16 | h[o + 2] << 8 | h[o + 3]) % 1_000_000;
  return String(code).padStart(6, "0");
}

// ---------------------------------------------------------------------------
// 7. MFA journey (manager account): enrol in the browser, then prove an aal1
//    session is refused and the login MFA step upgrades it.
// ---------------------------------------------------------------------------
async function mfaTests(account) {
  if (!account) return;
  // 1. Enrol through the API with a password-only session.
  const s1 = await login(account.email, account.password);
  if (!s1.ok) { rec("mfa", "login for enrolment", "FAIL", s1.status); return; }
  const before = await j(await s1.ctx.get("/api/v1/auth/mfa"));
  rec("mfa", "MFA status readable, not yet enrolled", before?.data && before.data.enrolled === false ? "PASS" : "WARN", JSON.stringify(before?.data || {}).slice(0, 100));
  const enr = await s1.ctx.post("/api/v1/auth/mfa", { headers: H(s1.csrf), data: { action: "enroll" } });
  const enrBody = await j(enr);
  const factorId = enrBody?.data?.factor_id, secret = enrBody?.data?.secret;
  rec("mfa", "TOTP enrolment returns factor, QR and secret", enr.status() === 200 && factorId && secret ? "PASS" : "FAIL", `${enr.status()} ${JSON.stringify(enrBody).slice(0, 100)}`);
  if (!secret) { await s1.ctx.dispose(); return; }
  const wrong = await s1.ctx.post("/api/v1/auth/mfa", { headers: H(s1.csrf), data: { action: "verify", factor_id: factorId, code: "000000" } });
  rec("mfa", "wrong code rejected", wrong.status() === 401 ? "PASS" : "FAIL", wrong.status());
  const ver = await s1.ctx.post("/api/v1/auth/mfa", { headers: H(s1.csrf), data: { action: "verify", factor_id: factorId, code: totp(secret) } });
  rec("mfa", "correct code verifies and upgrades the session to aal2", ver.status() === 200 ? "PASS" : "FAIL", `${ver.status()} ${(await ver.text()).slice(0, 80)}`);
  const after = await j(await s1.ctx.get("/api/v1/auth/mfa"));
  rec("mfa", "status shows enrolled and aal2", after?.data?.enrolled && after?.data?.current_level === "aal2" ? "PASS" : "FAIL", JSON.stringify(after?.data || {}).slice(0, 100));
  const okApi = await s1.ctx.get("/api/v1/staff");
  rec("mfa", "aal2 session reaches a protected API", okApi.status() === 200 ? "PASS" : "FAIL", okApi.status());

  // 2. A fresh password-only session must now be refused and redirected.
  const aal1 = await login(account.email, account.password);
  const refused = await aal1.ctx.get("/api/v1/staff");
  const body = await refused.text();
  rec("mfa", "password-only (aal1) session refused with MFA_REQUIRED", refused.status() === 403 && /MFA_REQUIRED/.test(body) ? "PASS" : "FAIL", `${refused.status()} ${body.slice(0, 80)}`);
  const dash = await aal1.ctx.get("/dashboard", { maxRedirects: 0 });
  rec("mfa", "dashboard redirects aal1 session to the MFA step", dash.status() >= 300 && /step=mfa/.test(dash.headers().location || "") ? "PASS" : "FAIL", `${dash.status()} ${dash.headers().location || ""}`);
  await aal1.ctx.dispose();

  // 3. Browser journey: password, then the authenticator step, then dashboard.
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: BASE_URL, extraHTTPHeaders: EXTRA_HEADERS, viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  try {
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.fill("#email", account.email);
    await page.fill("#password", account.password);
    await page.click("button[type=submit]");
    await page.waitForSelector("#totp", { timeout: 20000 });
    rec("mfa", "login shows the authenticator step for an enrolled user", "PASS", "");
    await page.fill("#totp", totp(secret));
    await page.click("button[type=submit]");
    await page.waitForURL(/\/dashboard/, { timeout: 20000 });
    const api = await context.request.get("/api/v1/staff");
    rec("mfa", "after the code the browser session is aal2 and protected APIs respond", api.status() === 200 ? "PASS" : "FAIL", api.status());
    await page.goto("/dashboard/settings/security", { waitUntil: "networkidle" });
    await page.waitForSelector("[data-testid=mfa-status]", { timeout: 15000 });
    const text = await page.locator("[data-testid=mfa-status]").innerText();
    rec("mfa", "security page shows the factor as enabled and verified", /Enabled/.test(text) && /verified/.test(text) && !/not yet/.test(text) ? "PASS" : "FAIL", text);
  } catch (e) {
    rec("mfa", "browser login-with-code journey", "FAIL", e.message.split("\n")[0]);
  }
  await browser.close();

  // 4. Clean up so later runs start unenrolled (needs the aal2 API session).
  const rm = await s1.ctx.post("/api/v1/auth/mfa", { headers: H(s1.csrf), data: { action: "unenroll", factor_id: factorId } });
  rec("mfa", "factor removed after test", rm.status() === 200 ? "PASS" : "WARN", rm.status());
  await s1.ctx.dispose();
}

// ---------------------------------------------------------------------------
// 6b. Data integrity
// ---------------------------------------------------------------------------
async function integrityTests(ctx, csrf, guest, direct, available) {
  // Five simultaneous bookings for the same room and nights: exactly one wins.
  const apt = available[2] || available[1];
  if (apt) {
    const payload = { apartment_id: apt.id, guest_id: guest.id, channel_id: direct?.id, check_in: plus(10), check_out: plus(12), adults: 1 };
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => ctx.post("/api/v1/bookings", { headers: H(csrf), data: payload })));
    const codes = results.map((r) => r.status());
    const wins = codes.filter((c) => c === 201 || c === 200).length;
    const rejected = codes.filter((c) => c === 409 || c === 400).length;
    rec("integrity", "5 concurrent bookings for one room: exactly one succeeds", wins === 1 && rejected === 4 ? "PASS" : "FAIL", codes.join(","));
  }
  // Pagination metadata and limits
  const page = await j(await ctx.get("/api/v1/bookings?limit=2&offset=0"));
  rec("integrity", "list endpoints paginate with meta.total", page?.meta && typeof page.meta.total === "number" && (page.data || []).length <= 2 ? "PASS" : "FAIL", JSON.stringify(page?.meta));
  const page2 = await j(await ctx.get("/api/v1/bookings?limit=2&offset=2"));
  rec("integrity", "offset returns the next page", page2?.data && page?.data && page2.data[0]?.id !== page.data[0]?.id ? "PASS" : "FAIL", "");
  const big = await j(await ctx.get("/api/v1/guests?limit=999999"));
  rec("integrity", "limit is capped", big?.meta?.limit <= 1000 ? "PASS" : "FAIL", `limit=${big?.meta?.limit}`);
  // Validation enums match the database
  const hkBad = await ctx.post("/api/v1/housekeeping", { headers: H(csrf), data: { apartment_id: apt?.id || available[0].id, type: "turnover", scheduled_date: today } });
  rec("integrity", "housekeeping type not in schema is rejected (400, not 500)", hkBad.status() === 400 ? "PASS" : "FAIL", hkBad.status());
  const hkOk = await ctx.post("/api/v1/housekeeping", { headers: H(csrf), data: { apartment_id: apt?.id || available[0].id, type: "turndown", scheduled_date: today, priority: "low" } });
  rec("integrity", "housekeeping type from the schema is accepted", hkOk.status() < 300 ? "PASS" : "FAIL", `${hkOk.status()} ${(await hkOk.text()).slice(0, 80)}`);
  const mtOk = await ctx.post("/api/v1/maintenance", { headers: H(csrf), data: { apartment_id: apt?.id || available[0].id, title: "Water leak", description: "deep test", category: "plumbing", priority: "urgent" } });
  rec("integrity", "maintenance category from the schema is accepted", mtOk.status() < 300 ? "PASS" : "FAIL", `${mtOk.status()} ${(await mtOk.text()).slice(0, 80)}`);
  // A room under maintenance is not sellable
  const mtBody = await j(mtOk);
  if (mtBody?.data?.apartment_id) {
    const blocked = await ctx.post("/api/v1/bookings", { headers: H(csrf), data: { apartment_id: mtBody.data.apartment_id, guest_id: guest.id, channel_id: direct?.id, check_in: plus(20), check_out: plus(21), adults: 1 } });
    rec("integrity", "room taken out of service by an urgent maintenance request cannot be booked", blocked.status() === 409 || blocked.status() === 400 ? "PASS" : "FAIL", `${blocked.status()} ${(await blocked.text()).slice(0, 80)}`);
  }
  // Night audit via the cron secret, idempotent
  const cron = await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { ...EXTRA_HEADERS, Authorization: `Bearer ${process.env.CRON_SECRET || ""}` } });
  const na1 = await cron.post("/api/v1/cron/night-audit", { data: { business_date: plus(-1) } });
  const na1b = await j(na1);
  rec("integrity", "night audit runs with the cron secret", na1.status() === 200 && na1b?.data?.closes?.length >= 1 ? "PASS" : "FAIL", `${na1.status()} ${JSON.stringify(na1b).slice(0, 100)}`);
  const na2 = await j(await cron.post("/api/v1/cron/night-audit", { data: { business_date: plus(-1) } }));
  rec("integrity", "night audit is idempotent for the same date", na2?.data?.closes?.[0]?.already_closed === true ? "PASS" : "FAIL", JSON.stringify(na2?.data?.closes?.[0] || {}).slice(0, 80));
  const noSecret = await (await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: EXTRA_HEADERS })).post("/api/v1/cron/night-audit", { data: {} });
  rec("integrity", "cron endpoint refuses without secret or admin session", noSecret.status() === 401 || noSecret.status() === 403 ? "PASS" : "FAIL", noSecret.status());
  const cyc = await cron.post("/api/v1/cron/automations", { data: {} });
  rec("integrity", "automation cycle runs from cron (no timers)", cyc.status() === 200 ? "PASS" : "FAIL", `${cyc.status()} ${(await cyc.text()).slice(0, 100)}`);
  await cron.dispose();
}

// ---------------------------------------------------------------------------
// 6c. Finance: folio and ledger
// ---------------------------------------------------------------------------
async function financeTests(ctx, csrf, reception, guest, direct, available) {
  const apt = available[3] || available[0];
  const b = (await j(await ctx.post("/api/v1/bookings", { headers: H(csrf), data: { apartment_id: apt.id, guest_id: guest.id, channel_id: direct?.id, check_in: today, check_out: plus(1), adults: 1 } })))?.data;
  if (!b?.id) { rec("finance", "booking for folio test", "FAIL", "could not create"); return; }
  await ctx.patch(`/api/v1/bookings/${b.id}`, { headers: H(csrf), data: { status: "confirmed" } });
  const none = await j(await ctx.get(`/api/v1/bookings/${b.id}/folio`));
  rec("finance", "no folio before check-in", none?.data === null ? "PASS" : "FAIL", JSON.stringify(none).slice(0, 80));
  // Deposit before arrival opens the folio with a credit balance
  const dep = await ctx.post(`/api/v1/bookings/${b.id}/folio`, { headers: H(csrf), data: { action: "post_payment", amount_gbp: 20, method: "card", reference: "DEP-1" } });
  const depBody = await j(dep);
  rec("finance", "deposit before arrival opens the folio with a credit", dep.status() === 201 && depBody?.folio?.balance_gbp === -20 ? "PASS" : "FAIL", `${dep.status()} balance=${depBody?.folio?.balance_gbp}`);
  const ci = await ctx.post(`/api/v1/bookings/${b.id}/checkin`, { headers: H(csrf), data: {} });
  rec("finance", "check-in returns the folio id", ci.status() === 200 && (await j(ci))?.data?.folio_id ? "PASS" : "FAIL", ci.status());
  // Extra charge with VAT 14%
  const ch = await ctx.post(`/api/v1/bookings/${b.id}/folio`, { headers: H(csrf), data: { action: "post_charge", type: "fnb", description: "Room service dinner", quantity: 2, unit_amount_gbp: 25 } });
  const chBody = await j(ch);
  const vatLine = (chBody?.folio?.lines || []).find((l) => l.type === "tax");
  rec("finance", "charge posts net line plus VAT line at the property rate", ch.status() === 201 && Number(vatLine?.debit_gbp) === 7 ? "PASS" : "FAIL", `${ch.status()} vat=${vatLine?.debit_gbp} balance=${chBody?.folio?.balance_gbp}`);
  // Ledger is append-only
  if (SUPABASE_URL && SUPABASE_SERVICE && vatLine) {
    const tamper = await (await request.newContext()).patch(`${SUPABASE_URL}/rest/v1/folio_lines?id=eq.${vatLine.id}`, { headers: { apikey: SUPABASE_SERVICE, Authorization: `Bearer ${SUPABASE_SERVICE}`, "Content-Type": "application/json", Prefer: "return=minimal" }, data: { debit_gbp: 0 } });
    rec("finance", "ledger lines cannot be edited even with the service role", tamper.status() >= 400 && /LEDGER_IMMUTABLE/.test(await tamper.text()) ? "PASS" : "FAIL", tamper.status());
  }
  // Void the charge (manager), reversal lines appear and balance returns
  const chargeLine = (chBody?.folio?.lines || []).find((l) => l.type === "fnb");
  const voidAsReception = await reception.ctx.post(`/api/v1/bookings/${b.id}/folio`, { headers: H(reception.csrf), data: { action: "void_line", line_id: chargeLine.id, reason: "testing" } });
  rec("finance", "receptionist cannot void a charge", voidAsReception.status() === 403 ? "PASS" : "FAIL", voidAsReception.status());
  const vd = await j(await ctx.post(`/api/v1/bookings/${b.id}/folio`, { headers: H(csrf), data: { action: "void_line", line_id: chargeLine.id, reason: "posted to wrong room" } }));
  const reversals = (vd?.folio?.lines || []).filter((l) => l.type === "reversal").length;
  rec("finance", "void posts reversals for the charge and its VAT; balance back to the deposit credit", reversals === 2 && vd?.folio?.balance_gbp === -20 ? "PASS" : "FAIL", `reversals=${reversals} balance=${vd?.folio?.balance_gbp}`);
  const again = await ctx.post(`/api/v1/bookings/${b.id}/folio`, { headers: H(csrf), data: { action: "void_line", line_id: chargeLine.id, reason: "twice" } });
  rec("finance", "a line cannot be voided twice", again.status() === 400 || again.status() === 409 ? "PASS" : "FAIL", again.status());
  // Check-out posts the room night, then balance = room + VAT - deposit
  const coBlocked = await ctx.post(`/api/v1/bookings/${b.id}/checkout`, { headers: H(csrf), data: {} });
  const coBody = await j(coBlocked);
  const fol = await j(await ctx.get(`/api/v1/bookings/${b.id}/folio`));
  const roomLine = (fol?.data?.lines || []).find((l) => l.type === "room");
  rec("finance", "check-out posts the room night with VAT to the folio", roomLine && Number(roomLine.debit_gbp) > 0 ? "PASS" : "FAIL", `room=${roomLine?.debit_gbp} balance=${fol?.data?.balance_gbp}`);
  rec("finance", "check-out blocked while the folio balance is unpaid", coBlocked.status() === 402 ? "PASS" : "FAIL", `${coBlocked.status()} ${JSON.stringify(coBody).slice(0, 80)}`);
  const owed = Number(fol?.data?.balance_gbp || 0);
  const over = await ctx.post(`/api/v1/bookings/${b.id}/folio`, { headers: H(csrf), data: { action: "post_payment", amount_gbp: owed + 100, method: "cash" } });
  rec("finance", "folio overpayment rejected", over.status() === 400 ? "PASS" : "FAIL", over.status());
  const settle = await ctx.post(`/api/v1/bookings/${b.id}/folio`, { headers: H(csrf), data: { action: "post_payment", amount_gbp: owed, method: "cash" } });
  const settleBody = await j(settle);
  rec("finance", "settling payment brings the balance to zero", settle.status() === 201 && Math.abs(Number(settleBody?.folio?.balance_gbp)) < 0.005 ? "PASS" : "FAIL", `balance=${settleBody?.folio?.balance_gbp}`);
  // Invoice issued from the folio, frozen
  const inv = await j(await ctx.post(`/api/v1/bookings/${b.id}/folio`, { headers: H(csrf), data: { action: "issue_invoice" } }));
  const invoice = inv?.data?.invoice;
  rec("finance", "invoice issued from the folio with ledger totals and paid status", invoice && Number(invoice.total_gbp) === Math.round((owed + 20) * 100) / 100 && invoice.status === "paid" ? "PASS" : "FAIL", `total=${invoice?.total_gbp} status=${invoice?.status} expected=${owed + 20}`);
  if (invoice?.id) {
    const freeze = await ctx.patch(`/api/v1/invoices/${invoice.id}`, { headers: H(csrf), data: { line_items: [{ description: "tamper", quantity: 1, unit_price_gbp: 1 }] } });
    const ftxt = await freeze.text();
    rec("finance", "issued invoice cannot be altered", freeze.status() >= 400 && (/INVOICE_IMMUTABLE/.test(ftxt) || freeze.status() === 409 || freeze.status() === 400) ? "PASS" : "FAIL", `${freeze.status()} ${ftxt.slice(0, 80)}`);
    const twice = await j(await ctx.post(`/api/v1/bookings/${b.id}/folio`, { headers: H(csrf), data: { action: "issue_invoice" } }));
    rec("finance", "issuing again returns the same invoice", twice?.data?.already_issued === true && twice?.data?.invoice?.id === invoice.id ? "PASS" : "FAIL", "");
  }
  const co = await ctx.post(`/api/v1/bookings/${b.id}/checkout`, { headers: H(csrf), data: {} });
  const final = await j(await ctx.get(`/api/v1/bookings/${b.id}/folio`));
  rec("finance", "check-out succeeds at zero balance and closes the folio", co.status() === 200 && final?.data?.folio?.status === "closed" ? "PASS" : "FAIL", `${co.status()} folio=${final?.data?.folio?.status}`);
  // Refund of the settled payment (manager), with reason, capped
  const pay = (final?.data?.payments || []).find((p) => Number(p.amount_gbp) === owed) || (final?.data?.payments || [])[0];
  if (pay) {
    const overRefund = await ctx.post(`/api/v1/bookings/${b.id}/folio`, { headers: H(csrf), data: { action: "refund", payment_id: pay.id, amount_gbp: Number(pay.amount_gbp) + 1, reason: "too much" } });
    rec("finance", "refund above the payment is rejected", overRefund.status() === 400 ? "PASS" : "FAIL", overRefund.status());
    const rf = await ctx.post(`/api/v1/bookings/${b.id}/folio`, { headers: H(csrf), data: { action: "refund", payment_id: pay.id, amount_gbp: 10, reason: "goodwill for noise complaint" } });
    const rfBody = await j(rf);
    rec("finance", "partial refund recorded with reason; folio shows the debit", rf.status() === 201 && Number(rfBody?.folio?.totals?.refunds) === 10 ? "PASS" : "FAIL", `${rf.status()} ${JSON.stringify(rfBody?.folio?.totals)}`);
  }
  // Budgets table and stay-date revenue
  const month = today.slice(0, 7);
  const put = await ctx.put("/api/v1/finance/budgets", { headers: H(csrf), data: { month, budgets: [{ department: "Energy", budget_gbp: 1200 }, { department: "Personnel", budget_gbp: 9000 }] } });
  rec("finance", "department budgets saved", put.status() === 200 ? "PASS" : "FAIL", `${put.status()} ${(await put.text()).slice(0, 80)}`);
  const summary = await j(await ctx.get("/api/v1/finance/summary"));
  rec("finance", "finance summary uses stay-date revenue and real budgets", summary?.data?.revenue_basis === "stay_date" && summary?.data?.budget_source === "department_budgets" ? "PASS" : "FAIL", `basis=${summary?.data?.revenue_basis} budgets=${summary?.data?.budget_source}`);
  const rev = await j(await ctx.get(`/api/v1/finance/revenue?from=${plus(-7)}&to=${today}`));
  rec("finance", "revenue by stay date reports room-nights, ADR and RevPAR", rev?.data && typeof rev.data.adr_gbp === "number" && Array.isArray(rev.data.by_day) && rev.data.by_day.length === 8 ? "PASS" : "FAIL", JSON.stringify(rev?.data || {}).slice(0, 120));
  const hkBad = await reception.ctx.get("/api/v1/finance/revenue");
  rec("finance", "revenue report requires manager", hkBad.status() === 403 ? "PASS" : "FAIL", hkBad.status());
  // FX feed (network dependent)
  const cron = await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { ...EXTRA_HEADERS, Authorization: `Bearer ${process.env.CRON_SECRET || ""}` } });
  const fx = await cron.post("/api/v1/cron/fx", { data: {} });
  const fxBody = await j(fx);
  rec("finance", "FX rates refreshed from the provider", fx.status() === 200 ? "PASS" : fx.status() === 502 ? "WARN" : "FAIL", `${fx.status()} ${JSON.stringify(fxBody?.data?.rates || fxBody?.error || {}).slice(0, 80)}`);
  await cron.dispose();
}

// ---------------------------------------------------------------------------
// A section that throws must not hide the sections after it: record and continue.
async function safe(section, fn) {
  try { await fn(); } catch (e) { rec(section, "section crashed", "FAIL", (e && e.message ? e.message : String(e)).split("\n")[0].slice(0, 200)); }
}

async function main() {
  console.log(`Deep test: ${BASE_URL} mode=${MODE}`);
  await unauthTests();
  const owner = ACCOUNTS.owner ? await login(ACCOUNTS.owner.email, ACCOUNTS.owner.password) : null;
  rec("auth", "owner login", owner?.ok ? "PASS" : "FAIL", owner?.ok ? `role=${owner.staff?.role}` : `${owner?.status} ${owner?.body?.slice(0, 80)}`);
  if (!owner?.ok) { finish(); return; }
  await safe("security", () => forgedCookieTest(owner.ctx));

  const hk = ACCOUNTS.housekeeping ? await login(ACCOUNTS.housekeeping.email, ACCOUNTS.housekeeping.password) : null;
  const mgr = ACCOUNTS.manager ? await login(ACCOUNTS.manager.email, ACCOUNTS.manager.password) : null;
  const rec_ = ACCOUNTS.reception ? await login(ACCOUNTS.reception.email, ACCOUNTS.reception.password) : null;
  if (hk) rec("auth", "housekeeping login", hk.ok ? "PASS" : "FAIL", hk.ok ? "" : hk.status);
  if (mgr) rec("auth", "manager login", mgr.ok ? "PASS" : "FAIL", mgr.ok ? "" : mgr.status);
  if (rec_) rec("auth", "reception login", rec_.ok ? "PASS" : "FAIL", rec_.ok ? "" : rec_.status);
  const bad = ACCOUNTS.owner ? await login(ACCOUNTS.owner.email, "wrong-password") : null;
  rec("auth", "wrong password rejected", bad && !bad.ok && bad.status === 401 ? "PASS" : "FAIL", bad?.status);

  await safe("api:owner", () => apiTests(owner.ctx, "owner"));
  await safe("roles", () => roleTests(hk, mgr, owner));
  if (MODE === "full") await safe("txn", () => notificationTests(owner, rec_));
  if (MODE === "full") await safe("txn", () => ratePlanTests(owner, mgr, rec_, hk));
  if (MODE === "full") await safe("txn", () => groupTests(owner, rec_, hk));
  if (MODE === "full") await safe("txn", () => portalTests(owner, rec_, hk));
  if (MODE === "full") await safe("txn", () => posTests(owner, mgr, rec_, hk));
  await safe("finance", () => exportTests(owner, mgr, rec_));

  let ids = {};
  if (MODE === "full" && rec_?.ok) { try { ids = await transactionTests(owner, rec_); } catch (e) { rec("txn", "section crashed", "FAIL", String(e && e.message || e).split("\n")[0].slice(0, 200)); } }
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
  await safe("pages", () => pageTests(owner.ctx, ids));
  if (MODE === "full") await safe("mfa", () => mfaTests(ACCOUNTS.manager));
  // Last: brute-force protection counts FAILED attempts per account (5 per
  // 15 min); successful sign-ins never count, so a correct password is not
  // locked out by earlier logins. Five wrong passwords are allowed, the sixth
  // attempt is refused, and the housekeeping account is unaffected.
  if (ACCOUNTS.owner) {
    let last = null;
    for (let i = 0; i < 6; i++) last = await login(ACCOUNTS.owner.email, "wrong-password");
    if (last && last.status !== 429) {
      // Without a shared limiter (Upstash) each serverless instance counts on
      // its own, so the lockout cannot be observed from outside. The health
      // endpoint already reports that state; say so instead of a bare failure.
      const h = await j(await (await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: EXTRA_HEADERS })).get("/api/v1/health"));
      const perInstance = /per instance/i.test(h?.checks?.rate_limiter?.detail || "");
      rec("auth", "account locked after five failed attempts (429)", perInstance ? "WARN" : "FAIL", perInstance ? `${last.status}: rate limiter is per instance on this platform; set UPSTASH_REDIS_REST_URL/TOKEN` : last.status);
    } else {
      rec("auth", "account locked after five failed attempts (429)", last && last.status === 429 ? "PASS" : "FAIL", last?.status);
    }
    if (ACCOUNTS.housekeeping) {
      const other = await login(ACCOUNTS.housekeeping.email, ACCOUNTS.housekeeping.password);
      rec("auth", "lockout is per account, other staff on the same network still sign in", other.ok ? "PASS" : "FAIL", other.ok ? "" : other.status);
    }
  }
  finish();
}
function finish() {
  const summary = { base: BASE_URL, mode: MODE, pass, fail, warn, total: pass + fail + warn, results };
  fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
  console.log(`\nTOTAL pass=${pass} fail=${fail} warn=${warn} of ${pass + fail + warn}`);
}
main().catch((e) => { console.error("FATAL", e); finish(); process.exit(1); });
