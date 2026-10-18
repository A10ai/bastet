import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

function fakeClient(currentLevel: "aal1" | "aal2", nextLevel: "aal1" | "aal2") {
  return {
    auth: { mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel, nextLevel } }) } },
  } as unknown as SupabaseClient;
}

async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return import("@/lib/mfa");
}

describe("checkMfa", () => {
  afterEach(() => {
    delete process.env.MFA_ENFORCE;
    delete process.env.MFA_REQUIRED_ROLES;
  });

  it("requires verification when a factor is enrolled but the session is aal1", async () => {
    const { checkMfa } = await load({ MFA_ENFORCE: "false" });
    const r = await checkMfa(fakeClient("aal1", "aal2"), "receptionist");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("MFA_REQUIRED");
  });

  it("passes an aal2 session", async () => {
    const { checkMfa } = await load({});
    const r = await checkMfa(fakeClient("aal2", "aal2"), "owner");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.level).toBe("aal2");
  });

  it("requires enrolment for owner and admin by default", async () => {
    const { checkMfa } = await load({});
    const owner = await checkMfa(fakeClient("aal1", "aal1"), "owner");
    const admin = await checkMfa(fakeClient("aal1", "aal1"), "admin");
    const manager = await checkMfa(fakeClient("aal1", "aal1"), "manager");
    expect(owner.ok).toBe(false);
    if (!owner.ok) expect(owner.code).toBe("MFA_ENROLMENT_REQUIRED");
    expect(admin.ok).toBe(false);
    expect(manager.ok).toBe(true);
  });

  it("makes enrolment optional when MFA_ENFORCE=false", async () => {
    const { checkMfa } = await load({ MFA_ENFORCE: "false" });
    const r = await checkMfa(fakeClient("aal1", "aal1"), "owner");
    expect(r.ok).toBe(true);
  });

  it("honours MFA_REQUIRED_ROLES", async () => {
    const { checkMfa } = await load({ MFA_REQUIRED_ROLES: "manager" });
    expect((await checkMfa(fakeClient("aal1", "aal1"), "manager")).ok).toBe(false);
    expect((await checkMfa(fakeClient("aal1", "aal1"), "owner")).ok).toBe(true);
  });

  it("treats an unreachable auth server as aal1 without factors", async () => {
    const { checkMfa } = await load({ MFA_ENFORCE: "false" });
    const broken = { auth: { mfa: { getAuthenticatorAssuranceLevel: async () => { throw new Error("down"); } } } } as unknown as SupabaseClient;
    expect((await checkMfa(broken, "receptionist")).ok).toBe(true);
  });
});
