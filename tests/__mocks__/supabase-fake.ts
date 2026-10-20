/**
 * In-memory stand-in for the Supabase client used by the engines.
 *
 * It implements the PostgREST builder surface the code base uses
 * (from/select/insert/update/upsert/delete, eq/neq/in/gte/lte/gt/lt/is/not,
 * order/limit/range/single/maybeSingle, count + head, rpc, auth.getUser) on
 * top of plain arrays, so engine logic can be exercised end to end without a
 * database. Unknown builder methods are tolerated as no-ops so a new filter
 * in an engine does not break every test.
 */
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Row = Record<string, unknown>;
export type FakeDb = Record<string, Row[]>;

interface Filter { kind: "eq" | "neq" | "in" | "gte" | "lte" | "gt" | "lt" | "is"; col: string; val: unknown }

interface State {
  table: string;
  columns?: string;
  op: "select" | "insert" | "update" | "upsert" | "delete";
  payload?: Row | Row[];
  filters: Filter[];
  single: boolean;
  maybeSingle: boolean;
  head: boolean;
  count: boolean;
  limit?: number;
  range?: [number, number];
  order?: { col: string; asc: boolean };
}

export interface FakeOptions {
  rpc?: Record<string, (args: Record<string, unknown>) => unknown>;
  user?: { id: string; email?: string } | null;
  aal?: { currentLevel: "aal1" | "aal2"; nextLevel: "aal1" | "aal2" };
  /** Make a table fail: { bookings: { message: "boom", code: "42501", op: "insert" } } (op optional: all ops) */
  errors?: Record<string, { message: string; code?: string; op?: State["op"] }>;
}

function cmp(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a) < String(b) ? -1 : 1;
}

function applyFilters(rows: Row[], filters: Filter[]): Row[] {
  return rows.filter((r) =>
    filters.every((f) => {
      const v = r[f.col];
      switch (f.kind) {
        case "eq": return v === f.val || String(v) === String(f.val);
        case "neq": return v !== f.val && String(v) !== String(f.val);
        case "in": return (f.val as unknown[]).some((x) => x === v || String(x) === String(v));
        case "gte": return cmp(v, f.val) >= 0;
        case "lte": return cmp(v, f.val) <= 0;
        case "gt": return cmp(v, f.val) > 0;
        case "lt": return cmp(v, f.val) < 0;
        case "is": return f.val === null ? v === null || v === undefined : v === f.val;
      }
    })
  );
}

/** Apply a PostgREST column list ("a, b, alias:c, rel:table(x, y)") to a row. */
function project(row: Row, columns?: string): Row {
  if (!columns || columns.trim() === "*" || columns.includes("*,") || columns.trim().startsWith("*")) return row;
  const out: Row = {};
  let depth = 0, token = "";
  const tokens: string[] = [];
  for (const ch of columns) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { tokens.push(token); token = ""; } else token += ch;
  }
  tokens.push(token);
  for (const raw of tokens) {
    const t = raw.trim();
    if (!t) continue;
    const head = t.split("(")[0];
    const [alias, source] = head.includes(":") ? head.split(":").map((x) => x.trim()) : [head.trim(), head.trim()];
    const key = source.replace(/!.*$/, "");
    if (row[key] !== undefined) out[alias] = row[key];
    else if (row[alias] !== undefined) out[alias] = row[alias];
  }
  return out;
}

export function createFakeSupabase(db: FakeDb, opts: FakeOptions = {}): SupabaseClient & { db: FakeDb; calls: string[] } {
  const calls: string[] = [];

  const makeBuilder = (table: string): unknown => {
    const st: State = { table, op: "select", filters: [], single: false, maybeSingle: false, head: false, count: false };

    const exec = async () => {
      calls.push(`${st.op}:${table}`);
      const err = opts.errors?.[table];
      if (err && (!err.op || err.op === st.op)) return { data: null, error: { message: err.message, code: err.code }, count: null };
      db[table] = db[table] || [];
      let rows = db[table];

      if (st.op === "insert" || st.op === "upsert") {
        const list = Array.isArray(st.payload) ? st.payload : [st.payload || {}];
        const DEFAULTS: Record<string, Row> = {
          workflows: { version: 0, status: "pending", current_step: 0 },
          notifications: { read: false, type: "info" },
          housekeeping_tasks: { status: "pending", priority: "normal" },
          maintenance_requests: { status: "open", priority: "normal" },
          bookings: { status: "pending", discount_percentage: 0 },
          system_events: { processed: false },
        };
        const inserted = list.map((p) => ({ id: randomUUID(), created_at: new Date().toISOString(), ...(DEFAULTS[table] || {}), ...p }));
        if (st.op === "upsert") {
          for (const row of inserted) {
            const idx = rows.findIndex((r) => r.id === row.id);
            if (idx >= 0) rows[idx] = { ...rows[idx], ...row }; else rows.push(row);
          }
        } else rows.push(...inserted);
        const data = st.single || st.maybeSingle ? inserted[0] ?? null : inserted;
        return { data, error: null, count: inserted.length };
      }
      if (st.op === "update") {
        const targets = applyFilters(rows, st.filters);
        for (const t of targets) {
          Object.assign(t, st.payload as Row, { updated_at: new Date().toISOString() });
          if (typeof t.version === "number") t.version = (t.version as number) + 1; // emulates trg_workflows_version
        }
        const data = st.single || st.maybeSingle ? targets[0] ?? null : targets;
        if (st.single && !targets[0]) return { data: null, error: { code: "PGRST116", message: "no rows" }, count: 0 };
        return { data, error: null, count: targets.length };
      }
      if (st.op === "delete") {
        const targets = applyFilters(rows, st.filters);
        db[table] = rows.filter((r) => !targets.includes(r));
        return { data: targets, error: null, count: targets.length };
      }
      // select
      rows = applyFilters(rows, st.filters);
      if (st.order) rows = [...rows].sort((a, b) => (st.order!.asc ? 1 : -1) * cmp(a[st.order!.col], b[st.order!.col]));
      const total = rows.length;
      if (st.range) rows = rows.slice(st.range[0], st.range[1] + 1);
      if (st.limit !== undefined) rows = rows.slice(0, st.limit);
      if (st.head) return { data: null, error: null, count: total };
      rows = rows.map((r) => project(r, st.columns));
      if (st.single) return rows[0] ? { data: rows[0], error: null, count: 1 } : { data: null, error: { code: "PGRST116", message: "no rows" }, count: 0 };
      if (st.maybeSingle) return { data: rows[0] ?? null, error: null, count: rows.length ? 1 : 0 };
      return { data: rows, error: null, count: st.count ? total : null };
    };

    const handler: ProxyHandler<object> = {
      get(_t, prop: string | symbol) {
        if (prop === "then") return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => exec().then(res, rej);
        switch (prop) {
          case "select": return (cols?: string, o?: { count?: string; head?: boolean }) => { st.columns = cols; st.count = !!o?.count; st.head = !!o?.head; return proxy; };
          case "insert": return (p: Row | Row[]) => { st.op = "insert"; st.payload = p; return proxy; };
          case "upsert": return (p: Row | Row[]) => { st.op = "upsert"; st.payload = p; return proxy; };
          case "update": return (p: Row) => { st.op = "update"; st.payload = p; return proxy; };
          case "delete": return () => { st.op = "delete"; return proxy; };
          case "eq": return (c: string, v: unknown) => { st.filters.push({ kind: "eq", col: c, val: v }); return proxy; };
          case "neq": return (c: string, v: unknown) => { st.filters.push({ kind: "neq", col: c, val: v }); return proxy; };
          case "in": return (c: string, v: unknown[]) => { st.filters.push({ kind: "in", col: c, val: v }); return proxy; };
          case "gte": return (c: string, v: unknown) => { st.filters.push({ kind: "gte", col: c, val: v }); return proxy; };
          case "lte": return (c: string, v: unknown) => { st.filters.push({ kind: "lte", col: c, val: v }); return proxy; };
          case "gt": return (c: string, v: unknown) => { st.filters.push({ kind: "gt", col: c, val: v }); return proxy; };
          case "lt": return (c: string, v: unknown) => { st.filters.push({ kind: "lt", col: c, val: v }); return proxy; };
          case "is": return (c: string, v: unknown) => { st.filters.push({ kind: "is", col: c, val: v }); return proxy; };
          case "order": return (c: string, o?: { ascending?: boolean }) => { st.order = { col: c, asc: o?.ascending !== false }; return proxy; };
          case "limit": return (n: number) => { st.limit = n; return proxy; };
          case "range": return (a: number, b: number) => { st.range = [a, b]; return proxy; };
          case "single": return () => { st.single = true; return proxy; };
          case "maybeSingle": return () => { st.maybeSingle = true; return proxy; };
          default: return (..._args: unknown[]) => proxy; // not, or, ilike, like, filter, contains, textSearch, ...
        }
      },
    };
    const proxy: unknown = new Proxy({}, handler);
    return proxy;
  };

  const client = {
    db,
    calls,
    from: (table: string) => makeBuilder(table),
    rpc: (name: string, args: Record<string, unknown> = {}) => {
      calls.push(`rpc:${name}`);
      const fn = opts.rpc?.[name];
      const result = fn ? fn(args) : null;
      const thenable = {
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve({ data: result, error: null }).then(res, rej),
        single: () => thenable,
        maybeSingle: () => thenable,
      };
      return thenable;
    },
    auth: {
      getUser: async () => ({ data: { user: opts.user === undefined ? { id: "user-1", email: "owner@test.local" } : opts.user }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({ data: opts.aal ?? { currentLevel: "aal1", nextLevel: "aal1" }, error: null }),
        listFactors: async () => ({ data: { all: [], totp: [] }, error: null }),
      },
    },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
    removeChannel: () => {},
  };
  return client as unknown as SupabaseClient & { db: FakeDb; calls: string[] };
}

// ---------------------------------------------------------------------------
// Representative hotel data
// ---------------------------------------------------------------------------
const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

export function seedDb(): FakeDb {
  const property_id = "11111111-1111-4111-8111-111111111111";
  const building_id = "22222222-2222-4222-8222-222222222222";
  const typeStudio = "33333333-3333-4333-8333-333333333331";
  const type1bed = "33333333-3333-4333-8333-333333333332";
  const direct = "44444444-4444-4444-8444-444444444441";
  const bcom = "44444444-4444-4444-8444-444444444442";
  const staffIds = ["55555555-5555-4555-8555-555555555551", "55555555-5555-4555-8555-555555555552", "55555555-5555-4555-8555-555555555553"];
  const guestIds = Array.from({ length: 6 }, (_, i) => `66666666-6666-4666-8666-66666666666${i}`);
  const aptIds = Array.from({ length: 12 }, (_, i) => `77777777-7777-4777-8777-7777777777${String(i).padStart(2, "0")}`);
  const statuses = ["occupied", "occupied", "occupied", "available", "available", "cleaning", "maintenance", "available", "occupied", "available", "available", "out_of_service"];

  const apartments = aptIds.map((id, i) => ({
    id, property_id, building_id, number: `${Math.floor(i / 4) + 1}0${(i % 4) + 1}`, floor: Math.floor(i / 4) + 1,
    apartment_type_id: i % 3 === 0 ? type1bed : typeStudio, status: statuses[i], is_accessible: false,
    buildings: { id: building_id, name: "Bastet A", code: "A" }, apartment_types: { id: i % 3 === 0 ? type1bed : typeStudio, name: i % 3 === 0 ? "One bedroom" : "Studio", bedrooms: i % 3 === 0 ? 1 : 0 },
  }));
  const guests = guestIds.map((id, i) => ({
    id, property_id, first_name: ["Ada", "Ben", "Chen", "Dina", "Eli", "Fay"][i], last_name: "Guest", email: `g${i}@test.local`,
    nationality: ["GB", "DE", "EG", "GB", "RU", "DE"][i], loyalty_tier: ["bronze", "silver", "gold", "bronze", "platinum", "bronze"][i],
    loyalty_points: [100, 1500, 6000, 0, 20000, 50][i], total_stays: [1, 3, 6, 0, 12, 1][i], total_nights: [3, 12, 40, 0, 90, 2][i],
    total_spend_gbp: [300, 1500, 5200, 0, 12000, 150][i], vip_status: i === 4, created_at: new Date(Date.now() - (400 - i * 40) * 86400000).toISOString(),
    preferred_currency: "GBP", language: "en", marketing_consent: i % 2 === 0, passport_number: i === 0 ? "P1234567" : null,
  }));
  const mk = (i: number, apt: number, guest: number, status: string, ci: number, co: number, rate: number, channel = direct) => ({
    id: `88888888-8888-4888-8888-8888888888${String(i).padStart(2, "0")}`, property_id, apartment_id: aptIds[apt], guest_id: guestIds[guest],
    channel_id: channel, reference: `BAS-HRG-2600${String(i).padStart(2, "0")}`, status, check_in: day(ci), check_out: day(co), nights: co - ci,
    adults: 2, children: 0, rate_per_night_gbp: rate, discount_percentage: 0, total_amount_gbp: rate * (co - ci), guest_currency: "GBP",
    created_at: new Date(Date.now() - (30 - i) * 86400000).toISOString(),
    apartments: apartments[apt], guests: guests[guest], booking_channels: { id: channel, name: channel === direct ? "Direct" : "Booking.com", code: channel === direct ? "direct" : "booking_com", commission_rate: channel === direct ? 0 : 15 },
    apartment: apartments[apt], guest: guests[guest], channel: { id: channel, name: channel === direct ? "Direct" : "Booking.com", code: channel === direct ? "direct" : "booking_com", commission_rate: channel === direct ? 0 : 15 },
  });
  const bookings = [
    mk(1, 0, 0, "checked_in", -2, 2, 45), mk(2, 1, 1, "checked_in", -1, 5, 60, bcom), mk(3, 2, 2, "checked_in", -5, 1, 80, bcom),
    mk(4, 8, 4, "checked_in", 0, 7, 150), mk(5, 3, 3, "confirmed", 0, 3, 45), mk(6, 4, 5, "confirmed", 1, 4, 45, bcom),
    mk(7, 7, 0, "confirmed", 3, 10, 60), mk(8, 9, 1, "pending", 5, 8, 45), mk(9, 10, 2, "checked_out", -10, -5, 60, bcom),
    mk(10, 0, 3, "checked_out", -20, -14, 45), mk(11, 1, 4, "checked_out", -40, -33, 150), mk(12, 2, 5, "cancelled", -3, 2, 45),
    mk(13, 3, 0, "no_show", -8, -6, 45), mk(14, 4, 1, "checked_out", -60, -53, 60, bcom), mk(15, 5, 2, "checked_out", -90, -80, 80),
  ];
  const housekeeping_tasks = [
    { id: "99999999-9999-4999-8999-999999999991", property_id, apartment_id: aptIds[5], type: "checkout_clean", status: "pending", priority: "high", scheduled_date: day(0), apartments: apartments[5], apartment: apartments[5] },
    { id: "99999999-9999-4999-8999-999999999992", property_id, apartment_id: aptIds[0], type: "midstay_clean", status: "in_progress", priority: "normal", scheduled_date: day(0), assigned_to: staffIds[2], apartments: apartments[0], apartment: apartments[0], staff: { first_name: "Fatma", last_name: "Ali" } },
    { id: "99999999-9999-4999-8999-999999999993", property_id, apartment_id: aptIds[1], type: "inspection", status: "completed", priority: "low", scheduled_date: day(-1), completed_at: new Date().toISOString(), apartments: apartments[1], apartment: apartments[1] },
  ];
  const maintenance_requests = [
    { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", property_id, apartment_id: aptIds[6], title: "AC not cooling", category: "hvac", priority: "urgent", status: "open", created_at: new Date().toISOString(), apartments: apartments[6], apartment: apartments[6] },
    { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", property_id, apartment_id: aptIds[2], title: "Dripping tap", category: "plumbing", priority: "low", status: "in_progress", assigned_to: staffIds[2], created_at: new Date().toISOString(), apartments: apartments[2], apartment: apartments[2], staff: { first_name: "Hassan", last_name: "M" } },
    { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3", property_id, apartment_id: aptIds[3], title: "Bulb", category: "electrical", priority: "normal", status: "completed", completed_at: new Date().toISOString(), created_at: new Date(Date.now() - 3 * 86400000).toISOString(), apartments: apartments[3], apartment: apartments[3] },
  ];
  const invoices = [
    { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1", property_id, booking_id: bookings[8].id, guest_id: guestIds[2], invoice_number: "INV-260001", status: "paid", subtotal_gbp: 300, tax_amount_gbp: 42, total_gbp: 342, due_date: day(-3), created_at: new Date().toISOString(), paid_at: new Date().toISOString(), line_items: [] },
    { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2", property_id, booking_id: bookings[9].id, guest_id: guestIds[3], invoice_number: "INV-260002", status: "sent", subtotal_gbp: 270, tax_amount_gbp: 37.8, total_gbp: 307.8, due_date: day(-10), created_at: new Date().toISOString(), line_items: [] },
    { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3", property_id, booking_id: null, guest_id: guestIds[4], invoice_number: "INV-260003", status: "partially_paid", subtotal_gbp: 1000, tax_amount_gbp: 140, total_gbp: 1140, due_date: day(5), created_at: new Date().toISOString(), line_items: [] },
  ];
  const payments = [
    { id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1", invoice_id: invoices[0].id, amount_gbp: 342, amount_original: 342, currency: "GBP", method: "card", status: "completed", received_at: new Date().toISOString() },
    { id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc2", invoice_id: invoices[2].id, amount_gbp: 500, amount_original: 500, currency: "GBP", method: "bank_transfer", status: "completed", received_at: new Date().toISOString() },
  ];
  const expenses = [
    { id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd1", property_id, category: "staff", description: "Payroll", amount_gbp: 9000, amount_egp: 540000, expense_date: day(-3), is_r_and_d: false, is_recurring: true, vendor: "Payroll" },
    { id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd2", property_id, category: "utilities", description: "Electricity", amount_gbp: 1200, amount_egp: 72000, expense_date: day(-5), is_r_and_d: false, is_recurring: true, vendor: "EEHC" },
    { id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd3", property_id, category: "software", description: "HospitAI R&D", amount_gbp: 800, amount_egp: 48000, expense_date: day(-1), is_r_and_d: true, is_recurring: false, vendor: "Internal" },
  ];
  const staff = [
    { id: staffIds[0], property_id, auth_user_id: "user-1", first_name: "Tariq", last_name: "Owner", email: "owner@test.local", role: "owner", is_active: true, department: "management" },
    { id: staffIds[1], property_id, auth_user_id: "user-2", first_name: "Nadia", last_name: "Manager", email: "manager@test.local", role: "manager", is_active: true, department: "management" },
    { id: staffIds[2], property_id, auth_user_id: "user-3", first_name: "Fatma", last_name: "HK", email: "hk@test.local", role: "housekeeping", is_active: true, department: "housekeeping" },
  ];
  return {
    properties: [{ id: property_id, name: "Bastet Aparthotels", slug: "bastet-hrg", city: "Hurghada", country: "EG", timezone: "Africa/Cairo", default_currency: "EGP", reporting_currency: "GBP", vat_rate_percent: 14, total_apartments: 12, status: "active" }],
    buildings: [{ id: building_id, property_id, name: "Bastet A", code: "A", floors: 3 }],
    apartment_types: [
      { id: typeStudio, property_id, name: "Studio", code: "STU", base_rate_gbp: 45, base_weekly_rate_gbp: 300, max_occupancy: 2, bedrooms: 0 },
      { id: type1bed, property_id, name: "One bedroom", code: "1BR", base_rate_gbp: 60, base_weekly_rate_gbp: 400, max_occupancy: 3, bedrooms: 1 },
    ],
    apartments, guests, bookings, housekeeping_tasks, maintenance_requests, invoices, payments, expenses, staff,
    booking_channels: [
      { id: direct, property_id, name: "Direct", code: "direct", commission_rate: 0, is_active: true },
      { id: bcom, property_id, name: "Booking.com", code: "booking_com", commission_rate: 15, is_active: true },
    ],
    rates: [
      { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1", property_id, apartment_type_id: typeStudio, season_name: "All year", start_date: day(-365), end_date: day(365), weekly_rate_gbp: 300, nightly_rate_gbp: 45, min_stay_nights: 1, is_active: true },
      { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2", property_id, apartment_type_id: type1bed, season_name: "All year", start_date: day(-365), end_date: day(365), weekly_rate_gbp: 400, nightly_rate_gbp: 60, min_stay_nights: 1, is_active: true },
    ],
    currency_rates: [{ id: "ffffffff-ffff-4fff-8fff-fffffffffff1", base_currency: "GBP", target_currency: "EGP", rate: 62.5, source: "manual", fetched_at: new Date().toISOString() }],
    brain_config: [{ id: 1, enabled: true, mode: "supervised", min_confidence: 0.6, max_decisions_per_cycle: 8, updated_at: new Date().toISOString() }],
    brain_decisions: [], pricing_decisions: [], workflows: [], system_events: [], notifications: [], audit_log: [], folios: [], folio_lines: [], daily_closes: [], department_budgets: [],
  };
}
