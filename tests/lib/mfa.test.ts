import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const UID = "user-1";

/** Auth server stub: getUser(jwt) returns the user's real factor list. */
function authServer(factors: { status: string }[] | "down") {
  const getUser = vi.fn(async () => {
    if (factors === "down") throw new Error("down");
    return { data: { user: { id: UID, factors } }, error: null };
  });
  return { client: { auth: { getUser } } as unknown as SupabaseClient, getUser };
}

const VERIFIED = [{ status: "verified" }];

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

  it("requires verification when the auth server lists a factor but the token is aal1", async () => {
    const { checkMfa } = await load({ MFA_ENFORCE: "false" });
    const { client } = authServer(VERIFIED);
    const r = await checkMfa(client, "receptionist", { userId: UID, aal: "aal1", accessToken: "t" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("MFA_REQUIRED");
  });

  it("passes a verified aal2 token without asking the auth server", async () => {
    const { checkMfa } = await load({});
    const { client, getUser } = authServer(VERIFIED);
    const r = await checkMfa(client, "owner", { userId: UID, aal: "aal2", accessToken: "t" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.level).toBe("aal2");
    expect(getUser).not.toHaveBeenCalled();
  });

  it("requires enrolment for owner and admin by default", async () => {
    const { checkMfa } = await load({});
    const { client } = authServer([]);
    const owner = await checkMfa(client, "owner", { userId: UID, aal: "aal1", accessToken: "t" });
    const admin = await checkMfa(client, "admin", { userId: UID, aal: "aal1", hasVerifiedFactor: false });
    const manager = await checkMfa(client, "manager", { userId: UID, aal: "aal1", hasVerifiedFactor: false });
    expect(owner.ok).toBe(false);
    if (!owner.ok) expect(owner.code).toBe("MFA_ENROLMENT_REQUIRED");
    expect(admin.ok).toBe(false);
    expect(manager.ok).toBe(true);
  });

  it("makes enrolment optional when MFA_ENFORCE=false", async () => {
    const { checkMfa } = await load({ MFA_ENFORCE: "false" });
    const r = await checkMfa(authServer([]).client, "owner", { userId: UID, aal: "aal1", hasVerifiedFactor: false });
    expect(r.ok).toBe(true);
  });

  it("honours MFA_REQUIRED_ROLES", async () => {
    const { checkMfa } = await load({ MFA_REQUIRED_ROLES: "manager" });
    const c = authServer([]).client;
    expect((await checkMfa(c, "manager", { userId: UID, hasVerifiedFactor: false })).ok).toBe(false);
    expect((await checkMfa(c, "owner", { userId: UID, hasVerifiedFactor: false })).ok).toBe(true);
  });

  it("fails closed when the factor list cannot be read (auth server down)", async () => {
    const { checkMfa } = await load({ MFA_ENFORCE: "false" });
    const r = await checkMfa(authServer("down").client, "receptionist", { userId: UID, aal: "aal1", accessToken: "t" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("MFA_CHECK_UNAVAILABLE");
  });

  it("caches the factor lookup per user", async () => {
    const { checkMfa } = await load({});
    const { client, getUser } = authServer([]);
    await checkMfa(client, "manager", { userId: UID, aal: "aal1", accessToken: "t" });
    await checkMfa(client, "manager", { userId: UID, aal: "aal1", accessToken: "t" });
    expect(getUser).toHaveBeenCalledTimes(1);
  });
});
