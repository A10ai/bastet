import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, seedDb } from "../__mocks__/supabase-fake";

const today = new Date().toISOString().slice(0, 10);
const plus = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

describe("booking-engine", () => {
  it("calculates a rate from the seasonal table and totals with length-of-stay discounts", async () => {
    const { calculateRate, calculateBookingTotal, calculateNights } = await import("@/lib/booking-engine");
    const db = seedDb();
    const sb = createFakeSupabase(db);
    const info = await calculateRate(db.apartment_types[0].id as string, today, plus(3), sb);
    expect(info?.nightly_rate_gbp).toBe(45);
    expect(calculateNights(today, plus(3))).toBe(3);
    const total = calculateBookingTotal(45, 7);
    expect(total.total).toBeLessThan(45 * 7); // 7+ nights earn a discount
    expect(total.discount_percentage).toBeGreaterThan(0);
  });

  it("refuses rooms that are out of service, blocked or under maintenance", async () => {
    const { checkAvailability } = await import("@/lib/booking-engine");
    const db = seedDb();
    const sb = createFakeSupabase(db);
    const maint = db.apartments.find((a) => a.status === "maintenance")!;
    const r = await checkAvailability(maint.id as string, plus(30), plus(32), sb);
    expect(r.available).toBe(false);
    expect(r.reason).toMatch(/maintenance/);
    const oos = db.apartments.find((a) => a.status === "out_of_service")!;
    expect((await checkAvailability(oos.id as string, plus(30), plus(32), sb)).available).toBe(false);
  });

  it("detects overlapping active bookings and ignores cancelled ones", async () => {
    const { checkAvailability } = await import("@/lib/booking-engine");
    const db = seedDb();
    const sb = createFakeSupabase(db);
    const occupied = db.bookings[0]; // checked_in, apt 0, -2..+2
    const clash = await checkAvailability(occupied.apartment_id as string, today, plus(1), sb);
    expect(clash.available).toBe(false);
    expect(clash.reason).toMatch(/Conflicts/);
    const free = await checkAvailability(occupied.apartment_id as string, plus(40), plus(42), sb);
    expect(free.available).toBe(true);
  });

  it("uses the database sequence for references and falls back safely", async () => {
    const { getNextBookingReference } = await import("@/lib/booking-engine");
    const withRpc = createFakeSupabase(seedDb(), { rpc: { next_booking_reference: () => "BAS-HRG-260099" } });
    expect(await getNextBookingReference(withRpc)).toBe("BAS-HRG-260099");
    const noRpc = createFakeSupabase(seedDb());
    const ref = await getNextBookingReference(noRpc);
    expect(ref).toMatch(/^BAS-HRG-\d{6}$/);
  });

  it("converts currency with the latest stored rate", async () => {
    const { convertCurrency } = await import("@/lib/booking-engine");
    const sb = createFakeSupabase(seedDb());
    const out = await convertCurrency(100, "EGP", sb);
    expect(out?.amount).toBe(6250);
    expect(await convertCurrency(100, "XXX", sb)).toBeNull();
  });
});

describe("finance-engine", () => {
  it("determines invoice status from payments and issues invoice numbers", async () => {
    const { getInvoicePaymentStatus, getNextInvoiceNumber } = await import("@/lib/finance-engine");
    expect(getInvoicePaymentStatus(100, 100)).toBe("paid");
    expect(getInvoicePaymentStatus(100, 40)).toBe("partially_paid");
    expect(getInvoicePaymentStatus(100, 0)).toBe("sent");
    const sb = createFakeSupabase(seedDb(), { rpc: { next_invoice_number: () => "INV-260042" } });
    expect(await getNextInvoiceNumber(sb)).toBe("INV-260042");
    const fallback = await getNextInvoiceNumber(createFakeSupabase(seedDb()));
    expect(fallback).toMatch(/^INV-/);
  });
});

describe("event-bus", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("stores the event, runs handlers and records results", async () => {
    const { emitEvent, getRegisteredEventTypes } = await import("@/lib/event-bus");
    expect(getRegisteredEventTypes().length).toBeGreaterThan(5);
    const db = seedDb();
    const sb = createFakeSupabase(db);
    const booking = db.bookings[0];
    const result = await emitEvent("booking.checked_in", "bookings", { booking_id: booking.id, apartment_id: booking.apartment_id, guest_id: booking.guest_id }, sb);
    expect(result.event_id).toBeTruthy();
    expect(db.system_events.length).toBeGreaterThanOrEqual(1);
    expect(db.system_events[0].processed).toBe(true);
    expect(Array.isArray(result.results)).toBe(true);
  });

  it("scopes event broadcasts to the apartment's property", async () => {
    const { emitEvent } = await import("@/lib/event-bus");
    const db = seedDb();
    const otherProperty = "22222222-2222-4222-8222-222222222222";
    db.staff.push({ id: "77777777-7777-4777-8777-777777777799", property_id: otherProperty, auth_user_id: "user-x", first_name: "Other", last_name: "Hotel", email: "x@test.local", role: "manager", is_active: true });
    db.staff_properties = [];
    db.notifications = [];
    const sb = createFakeSupabase(db);
    const booking = db.bookings[0];
    await emitEvent("booking.checked_out", "bookings", { booking_id: booking.id, apartment_id: booking.apartment_id }, sb, { idempotencyKey: null });
    const recipients = new Set((db.notifications as { staff_id: string }[]).map((n) => n.staff_id));
    expect(recipients.size).toBeGreaterThan(0);
    expect(recipients.has("77777777-7777-4777-8777-777777777799")).toBe(false);
  });

  it("derives an idempotency key and treats a repeat as a duplicate", async () => {
    const { emitEvent } = await import("@/lib/event-bus");
    const db = seedDb();
    const sb = createFakeSupabase(db);
    const payload = { booking_id: db.bookings[1].id, apartment_id: db.bookings[1].apartment_id, guest_id: db.bookings[1].guest_id };
    const first = await emitEvent("booking.checked_out", "bookings", payload, sb);
    expect(db.system_events[0].idempotency_key).toBe(`booking.checked_out:${payload.booking_id}`);
    // Simulate the unique index: second insert fails with 23505
    const dupSb = createFakeSupabase(db, { errors: { system_events: { message: "duplicate key", code: "23505", op: "insert" } } });
    const second = await emitEvent("booking.checked_out", "bookings", payload, dupSb);
    expect(second.duplicate).toBe(true);
    expect(second.event_id).toBe(first.event_id);
  });

  it("treats a duplicate whose original row is invisible (another user's event, RLS) as already processed", async () => {
    const { emitEvent } = await import("@/lib/event-bus");
    const db = seedDb();
    db.system_events = [];
    const sb = createFakeSupabase(db, { errors: { system_events: { message: "duplicate key", code: "23505", op: "insert" } } });
    const r = await emitEvent("booking.checked_out", "bookings", { booking_id: db.bookings[1].id, apartment_id: db.bookings[1].apartment_id }, sb);
    expect(r).toEqual({ event_id: "", results: [], duplicate: true });
  });

  it("returns the stable id of a hidden duplicate from the property-scoped lookup", async () => {
    const { emitEvent } = await import("@/lib/event-bus");
    const db = seedDb();
    db.system_events = [];
    const sb = createFakeSupabase(db, {
      errors: { system_events: { message: "duplicate key", code: "23505", op: "insert" } },
      rpc: { system_event_id_by_key: (args) => (args.p_key === `booking.checked_out:${db.bookings[1].id}` ? "evt-original" : null) },
    });
    const r = await emitEvent("booking.checked_out", "bookings", { booking_id: db.bookings[1].id, apartment_id: db.bookings[1].apartment_id }, sb);
    expect(r).toEqual({ event_id: "evt-original", results: [], duplicate: true });
    expect(sb.calls).toContain("rpc:system_event_id_by_key");
  });

  it("runs every registered handler type without throwing", async () => {
    const { emitEvent, getRegisteredEventTypes } = await import("@/lib/event-bus");
    const db = seedDb();
    const sb = createFakeSupabase(db);
    for (const type of getRegisteredEventTypes()) {
      const r = await emitEvent(type, "test", { booking_id: db.bookings[2].id, apartment_id: db.bookings[2].apartment_id, guest_id: db.bookings[2].guest_id, task_id: db.housekeeping_tasks[0].id, request_id: db.maintenance_requests[0].id, occupancy: 92, waste_kwh: 40 }, sb, { idempotencyKey: null });
      expect(r.event_id).toBeTruthy();
    }
  });
});

describe("automations-engine", () => {
  it("lists automations and runs each one against live-looking data", async () => {
    const { getAutomations, runAutomation, runAllAutomations } = await import("@/lib/automations-engine");
    const defs = getAutomations();
    expect(defs.length).toBeGreaterThanOrEqual(5);
    const db = seedDb();
    const sb = createFakeSupabase(db);
    for (const d of defs) {
      const r = await runAutomation(d.id, sb);
      expect(Array.isArray(r)).toBe(true);
    }
    const all = await runAllAutomations(sb);
    expect(all.length).toBe(defs.length);
  });

  it("does not change rates while AUTO_PRICING_ENABLED is off", async () => {
    const { runAutomation } = await import("@/lib/automations-engine");
    const db = seedDb();
    const before = db.apartment_types.map((t) => t.base_weekly_rate_gbp);
    const r = await runAutomation("auto_pricing", createFakeSupabase(db));
    expect(r.some((x) => x.action === "pricing_disabled")).toBe(true);
    expect(db.apartment_types.map((t) => t.base_weekly_rate_gbp)).toEqual(before);
  });

  it("throws for an unknown automation", async () => {
    const { runAutomation } = await import("@/lib/automations-engine");
    await expect(runAutomation("does_not_exist", createFakeSupabase(seedDb()))).rejects.toThrow(/Unknown automation/);
  });
});

describe("notifications", () => {
  it("creates one notification per active staff member when no recipient is given", async () => {
    const n = await import("@/lib/notifications");
    const db = seedDb();
    const sb = createFakeSupabase(db);
    const created = await n.createNotification(sb, { title: "Hello", message: "World", type: "info", category: "system" });
    expect(created).toBe(db.staff.length);
    expect(db.notifications.filter((r) => r.title === "Hello").length).toBe(db.staff.length);
    const one = await n.createNotification(sb, { staff_id: db.staff[0].id as string, title: "Direct", message: "Only you" });
    expect(one).toBe(1);
    const list = await n.getNotifications(sb, db.staff[0].id as string, { limit: 10 });
    expect(list.length).toBeGreaterThan(0);
    expect(await n.getUnreadCount(sb, db.staff[0].id as string)).toBeGreaterThan(0);
    await n.markRead(sb, list[0].id);
    await n.markAllRead(sb, db.staff[0].id as string);
    expect(await n.getUnreadCount(sb, db.staff[0].id as string)).toBe(0);
  });
});

describe("audit", () => {
  it("writes the acting user and redacts secrets", async () => {
    const { logAudit, logAuditBatch, getAuditLog, getAuditStats, redactAuditData } = await import("@/lib/audit");
    const db = seedDb();
    const sb = createFakeSupabase(db, { user: { id: "user-1", email: "owner@test.local" } });
    await logAudit(sb, { action: "guest.create", category: "guest", description: "x", new_data: { passport_number: "P1", password: "s3cret", first_name: "Ada" } });
    expect(db.audit_log.length).toBe(1);
    expect(db.audit_log[0].user_email).toBe("owner@test.local");
    expect((db.audit_log[0].new_data as Record<string, unknown>).passport_number).toBe("[REDACTED]");
    expect((db.audit_log[0].new_data as Record<string, unknown>).first_name).toBe("Ada");
    await logAuditBatch(sb, [{ action: "a", category: "system", description: "1" }, { action: "b", category: "system", description: "2" }]);
    expect(db.audit_log.length).toBe(3);
    const log = await getAuditLog(sb, { limit: 2 });
    expect(log.entries.length).toBe(2);
    expect(log.total).toBe(3);
    const stats = await getAuditStats(sb);
    expect(stats.total_entries).toBe(3);
    expect(redactAuditData(undefined)).toBeNull();
  });

  it("falls back to system when there is no session", async () => {
    const { logAudit } = await import("@/lib/audit");
    const db = seedDb();
    await logAudit(createFakeSupabase(db, { user: null }), { action: "cron", category: "system", description: "nightly" });
    expect(db.audit_log[0].user_id).toBe("system");
  });

  it("records the signed-in user even when an entry names someone else (00033 insert policy)", async () => {
    const { logAudit, logAuditBatch } = await import("@/lib/audit");
    const db = seedDb();
    const sb = createFakeSupabase(db, { user: { id: "user-2", email: "manager@test.local" } });
    await logAudit(sb, { user_id: "user-1", action: "x", category: "system", description: "forged" });
    await logAuditBatch(sb, [{ user_id: "system", action: "y", category: "system", description: "batch" }]);
    expect(db.audit_log.map((r) => r.user_id)).toEqual(["user-2", "user-2"]);
    // Without a session (service role) the entry may name the actor
    const svc = createFakeSupabase(db, { user: null });
    await logAudit(svc, { user_id: "cron-job", action: "z", category: "system", description: "svc" });
    expect(db.audit_log[2].user_id).toBe("cron-job");
  });
});
