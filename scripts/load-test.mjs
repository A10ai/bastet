#!/usr/bin/env node
/**
 * Dependency-free load test for the hot read paths and the booking write path.
 *
 * Usage:
 *   BASE_URL=http://localhost:3100 EMAIL=owner@bastet.com PASSWORD=... \
 *   USERS=50 DURATION=30 node scripts/load-test.mjs
 *
 * Signs in once, then runs USERS concurrent virtual users for DURATION
 * seconds. Each user loops over a weighted mix: dashboard stats,
 * availability for the next week, bookings list, guests list, a booking
 * detail, and (1 in 20) a booking creation + cancellation on a random
 * available room. Prints p50/p95/p99 latency, throughput and error rate per
 * endpoint, and exits 1 if the p95 of any read exceeds READ_P95_MS
 * (default 1500) or the error rate exceeds 1%.
 */
const BASE_URL = process.env.BASE_URL || "http://localhost:3100";
const USERS = Number(process.env.USERS || 50);
const DURATION = Number(process.env.DURATION || 30);
const READ_P95_MS = Number(process.env.READ_P95_MS || 1500);
const EMAIL = process.env.EMAIL, PASSWORD = process.env.PASSWORD;
if (!EMAIL || !PASSWORD) { console.error("EMAIL and PASSWORD are required"); process.exit(2); }

const plus = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

async function login() {
  const res = await fetch(`${BASE_URL}/api/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });
  if (!res.ok) throw new Error(`login failed ${res.status}`);
  // Later Set-Cookie values override earlier ones (the CSRF cookie is rotated).
  const jar = new Map();
  const absorb = (r) => { for (const c of r.headers.getSetCookie()) { const [kv] = c.split(";"); const i = kv.indexOf("="); jar.set(kv.slice(0, i), kv.slice(i + 1)); } };
  absorb(res);
  const csrfRes = await fetch(`${BASE_URL}/api/v1/csrf`, { headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } });
  absorb(csrfRes);
  const csrf = (await csrfRes.json()).data.token;
  return { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), csrf };
}

const stats = new Map();
const firstFailure = {};
let startedAt = Date.now();
function record(name, ms, ok, status) {
  const s = stats.get(name) || { lat: [], ok: 0, err: 0, statuses: {} };
  s.lat.push(ms); ok ? s.ok++ : s.err++;
  s.statuses[status] = (s.statuses[status] || 0) + 1;
  stats.set(name, s);
}
const pct = (arr, p) => { if (!arr.length) return 0; const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };

async function call(name, path, init = {}, session) {
  const start = performance.now();
  try {
    const res = await fetch(`${BASE_URL}${path}`, { ...init, headers: { cookie: session.cookie, "X-CSRF-Token": session.csrf, "Content-Type": "application/json", ...(init.headers || {}) } });
    // 4xx on a write is a test-script defect, not a server one, but it is
    // reported in the status column so it never passes silently.
    const ok = res.status < 400;
    const text = await res.text();
    record(name, performance.now() - start, ok, res.status);
    if (!ok && !firstFailure[name]) firstFailure[name] = { status: res.status, at: Math.round((Date.now() - startedAt) / 1000), body: text.slice(0, 200) };
    return { status: res.status, text };
  } catch {
    record(name, performance.now() - start, false, "ERR");
    return null;
  }
}

async function main() {
  const session = await login();
  const apts = await (await fetch(`${BASE_URL}/api/v1/apartments?status=available&limit=100`, { headers: { cookie: session.cookie } })).json();
  const available = (apts.data || []).filter((a) => a.status === "available");
  const bookings = await (await fetch(`${BASE_URL}/api/v1/bookings?limit=20`, { headers: { cookie: session.cookie } })).json();
  const bookingIds = (bookings.data || []).map((b) => b.id);
  const channels = await (await fetch(`${BASE_URL}/api/v1/booking-channels`, { headers: { cookie: session.cookie } })).json();
  const direct = (channels.data || []).find((c) => c.code === "direct")?.id;
  const guests = await (await fetch(`${BASE_URL}/api/v1/guests?limit=5`, { headers: { cookie: session.cookie } })).json();
  const guestId = (guests.data || [])[0]?.id;

  console.log(`load test: ${USERS} users × ${DURATION}s against ${BASE_URL}; ${available.length} available rooms`);
  startedAt = Date.now();
  const deadline = startedAt + DURATION * 1000;
  let writes = 0;

  async function user(i) {
    let n = i;
    while (Date.now() < deadline) {
      n++;
      await call("dashboard/stats", "/api/v1/dashboard/stats", {}, session);
      await call("availability", `/api/v1/availability?date_from=${plus(0)}&date_to=${plus(7)}`, {}, session);
      await call("bookings list", "/api/v1/bookings?limit=50", {}, session);
      if (n % 3 === 0) await call("guests list", "/api/v1/guests?limit=50", {}, session);
      if (bookingIds.length) await call("booking detail", `/api/v1/bookings/${bookingIds[n % bookingIds.length]}`, {}, session);
      if (n % 20 === 0 && available.length && guestId) {
        const apt = available[(n + i) % available.length];
        const day = 60 + ((n * 7 + i) % 300);
        const res = await call("booking create", "/api/v1/bookings", { method: "POST", body: JSON.stringify({ apartment_id: apt.id, guest_id: guestId, channel_id: direct, check_in: plus(day), check_out: plus(day + 1), adults: 1 }) }, session);
        if (res && res.status < 300) {
          writes++;
          let body = null; try { body = JSON.parse(res.text); } catch { /* ignore */ }
          if (body?.data?.id) await call("booking cancel", `/api/v1/bookings/${body.data.id}/cancel`, { method: "POST", body: JSON.stringify({ reason: "load test" }) }, session);
        }
      }
    }
  }
  await Promise.all(Array.from({ length: USERS }, (_, i) => user(i)));

  let failed = false;
  const total = [...stats.values()].reduce((s, v) => s + v.ok + v.err, 0);
  console.log(`\n${"endpoint".padEnd(18)} ${"reqs".padStart(6)} ${"p50".padStart(7)} ${"p95".padStart(7)} ${"p99".padStart(7)} ${"err%".padStart(6)}  statuses`);
  for (const [name, s] of [...stats.entries()].sort()) {
    const errPct = (s.err / (s.ok + s.err)) * 100;
    const p95 = pct(s.lat, 0.95);
    const read = !name.startsWith("booking c");
    const bad = errPct > 1 || (read && p95 > READ_P95_MS);
    if (bad) failed = true;
    console.log(`${name.padEnd(18)} ${String(s.ok + s.err).padStart(6)} ${pct(s.lat, 0.5).toFixed(0).padStart(6)}ms ${p95.toFixed(0).padStart(6)}ms ${pct(s.lat, 0.99).toFixed(0).padStart(6)}ms ${errPct.toFixed(2).padStart(5)}%  ${Object.entries(s.statuses).map(([k, v]) => `${k}×${v}`).join(" ")}${bad ? "  <-- over budget" : ""}`);
  }
  for (const [name, f] of Object.entries(firstFailure)) console.log(`first failure on ${name}: HTTP ${f.status} at t+${f.at}s ${f.body}`);
  console.log(`\n${total} requests, ${(total / DURATION).toFixed(1)} req/s, ${writes} bookings created and cancelled`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
