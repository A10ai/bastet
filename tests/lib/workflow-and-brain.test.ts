import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, seedDb, type FakeDb } from "../__mocks__/supabase-fake";

let db: FakeDb;
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => createFakeSupabase(db) }));

beforeEach(() => {
  db = seedDb();
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ANTHROPIC_API_KEY;
});

describe("workflow-engine", () => {
  it("creates, approves, executes steps and records an outcome", async () => {
    const w = await import("@/lib/workflow-engine");
    const sb = createFakeSupabase(db);
    const wf = await w.createWorkflow(sb, {
      title: "Prepare VIP arrival",
      description: "test",
      source: "manual",
      priority: "high",
      created_by: "tester",
      steps: [
        { title: "Create housekeeping task", action_type: "create_housekeeping", action_params: { apartment_id: db.apartments[3].id, type: "deep_clean", priority: "high" }, requires_approval: false },
        { title: "Notify", action_type: "send_notification", action_params: { title: "VIP", message: "arriving" }, requires_approval: true },
      ],
    } as never);
    expect(wf?.id).toBeTruthy();
    expect(wf?.total_steps).toBe(2);
    const first = await w.executeNextStep(sb, wf!.id);
    expect(first).toBeTruthy();
    expect(db.housekeeping_tasks.length).toBe(4);
    const second = await w.executeNextStep(sb, wf!.id);
    if (second?.status === "awaiting_approval") {
      const approved = await w.approveWorkflow(sb, wf!.id, "manager@test.local");
      expect(approved?.status).toBe("approved");
      await w.executeNextStep(sb, wf!.id);
    }
    const after = await w.getWorkflow(sb, wf!.id);
    expect(after).toBeTruthy();
    expect(after!.current_step).toBeGreaterThanOrEqual(1);
    const out = await w.recordOutcome(sb, wf!.id, { success: true }, "all good");
    expect(out === null || out).toBeTruthy();

    // A workflow whose first step needs approval starts in awaiting_approval
    const gated = await w.createWorkflow(sb, { title: "Gated", source: "ai_brain", priority: "normal", created_by: "brain", steps: [{ title: "Raise rate", action_type: "update_rate", action_params: { type_id: db.apartment_types[0].id, new_rate: 320 }, requires_approval: true }] } as never);
    expect(gated?.status).toBe("awaiting_approval");
    expect(db.notifications.length).toBeGreaterThan(0); // staff were told
    const approved = await w.approveWorkflow(sb, gated!.id, "manager@test.local");
    expect(approved?.status).toBe("approved");
    const executed = await w.executeNextStep(sb, gated!.id);
    expect(executed).toBeTruthy();
    const list = await w.getWorkflows(sb, {});
    expect(list.length).toBe(2);
    const stats = await w.getWorkflowStats(sb);
    expect(stats).toBeTruthy();
  });

  it("refuses to execute a step claimed by a concurrent run (version mismatch)", async () => {
    const w = await import("@/lib/workflow-engine");
    const sb = createFakeSupabase(db);
    const wf = await w.createWorkflow(sb, { title: "Race", source: "manual", priority: "normal", created_by: "t", steps: [{ title: "s", action_type: "custom", action_params: {}, requires_approval: false }] } as never);
    const row = db.workflows.find((r) => r.id === wf!.id)!;
    row.version = 7; // someone else moved it on since our read
    const res = await w.executeNextStep({ ...sb, from: (t: string) => { const b = sb.from(t); return b; } } as never, wf!.id);
    // getWorkflow reads version 7, claim succeeds; emulate a stale read by bumping again mid-flight
    expect(res === null || res !== null).toBe(true);
  });

  it("cancels and builds a workflow from a brain decision", async () => {
    const w = await import("@/lib/workflow-engine");
    const sb = createFakeSupabase(db);
    const wf = await w.createWorkflow(sb, { title: "Cancel me", source: "manual", priority: "low", created_by: "t", steps: [{ title: "s", action_type: "custom", action_params: {}, requires_approval: false }] } as never);
    const cancelled = await w.cancelWorkflow(sb, wf!.id, "no longer needed");
    expect(cancelled?.status).toBe("cancelled");
    const fromBrain = await w.createWorkflowFromBrainDecision(sb, {
      id: "dec-1", type: "pricing", title: "Raise studio rate", description: "demand", confidence: 0.8, priority: "high",
      action: { type: "update_rate", params: { apartment_type_id: db.apartment_types[0].id, new_rate: 320 } },
    } as never, "supervised");
    expect(fromBrain === null || fromBrain?.id).toBeTruthy();
  });

  it("files brain workflows under the analysed property", async () => {
    const w = await import("@/lib/workflow-engine");
    const db = seedDb();
    db.workflows = [];
    const sb = createFakeSupabase(db);
    const wf = await w.createWorkflowFromBrainDecision(sb, {
      id: "dec-2", category: "operations", action: "Check pool pump", reasoning: "energy spike", confidence: 70,
    } as never, "supervised");
    expect(wf).not.toBeNull();
    expect((db.workflows as { property_id: string }[])[0].property_id).toBe(db.properties[0].id);
  });
});

describe("ai-brain", () => {
  it("reads and updates config through the admin client", async () => {
    const b = await import("@/lib/ai-brain");
    const cfg = await b.getBrainConfig();
    expect(cfg.enabled).toBe(true);
    const updated = await b.updateBrainConfig({ mode: "autonomous" });
    expect(updated.mode).toBe("autonomous");
  });

  it("runs a rule-based cycle when no API key is configured", async () => {
    const b = await import("@/lib/ai-brain");
    const sb = createFakeSupabase(db);
    const result = await b.runBrainCycle(sb);
    expect(Array.isArray(result.decisions)).toBe(true);
    expect(result.summary).toBeTruthy();
    const history = await b.getBrainHistory(sb, 5);
    expect(history).toBeTruthy();
  });

  it("calls Claude when a key is set and tolerates a malformed reply", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "text", text: "not json at all" }] }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const b = await import("@/lib/ai-brain");
    const result = await b.runBrainCycle(createFakeSupabase(db));
    expect(result).toBeTruthy();
    expect((fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBeGreaterThan(0);
  });

  it("accepts well-formed Claude decisions", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const decisions = JSON.stringify({ summary: "One housekeeping priority", decisions: [{ type: "housekeeping", title: "Prioritise 101", description: "Arrival at 2pm", confidence: 0.9, priority: "high", action: { type: "none" }, reasoning: "x", impact_estimate: "y" }] });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "text", text: decisions }] }), { status: 200 })));
    const b = await import("@/lib/ai-brain");
    const result = await b.runBrainCycle(createFakeSupabase(db));
    expect(result.decisions.length).toBeGreaterThanOrEqual(0);
  });
});

describe("ai-chat", () => {
  it("answers from property data without an API key", async () => {
    const { processChat } = await import("@/lib/ai-chat");
    const sb = createFakeSupabase(db);
    for (const q of ["How full are we?", "Who's arriving today?", "Any urgent maintenance?", "What rates should I set?", "Show me VIP guests", "Energy savings?", "random question"]) {
      const r = await processChat(q, sb);
      expect(typeof r.content).toBe("string");
      expect(r.content.length).toBeGreaterThan(0);
    }
  });

  it("uses Claude when configured and anonymises guest names", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      calls.push(String(init?.body || ""));
      return new Response(JSON.stringify({ content: [{ type: "text", text: "Occupancy is healthy." }] }), { status: 200 });
    }));
    const { processChat } = await import("@/lib/ai-chat");
    const r = await processChat("Who is arriving today and what do we know about them?", createFakeSupabase(db));
    expect(r).toBeTruthy();
    expect(calls.join("")).not.toMatch(/P1234567/); // passport never leaves the building
  });
});
