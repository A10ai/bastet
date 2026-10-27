// Regression: /login?redirect= navigated to any absolute URL after sign-in (M3).
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { safeRedirectPath } from "@/lib/safe-redirect";

const push = vi.fn();
let search = "redirect=https://evil.example/fake-login";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
}));

describe("safeRedirectPath", () => {
  it("keeps same-origin paths", () => {
    expect(safeRedirectPath("/dashboard/bookings?x=1#a")).toBe("/dashboard/bookings?x=1#a");
    expect(safeRedirectPath(null)).toBe("/dashboard");
  });
  it("refuses absolute, protocol-relative, backslash and script targets", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "\\\\evil.example", "javascript:alert(1)", "/%0d%0a", "/a\nb", "dashboard"]) {
      const out = safeRedirectPath(bad);
      expect(out.startsWith("/")).toBe(true);
      expect(out.startsWith("//")).toBe(false);
      expect(out).not.toContain("evil");
    }
  });
});

describe("/login ?redirect=", () => {
  it("falls back to /dashboard for an external URL after a successful sign-in", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      if (String(u).includes("/auth/login")) return new Response(JSON.stringify({ data: {} }), { status: 200 });
      if (String(u).includes("/auth/mfa")) return new Response(JSON.stringify({ data: { verification_required: false } }), { status: 200 });
      return new Response("{}", { status: 200 });
    }));
    search = "redirect=https://evil.example/fake-login";
    const { default: LoginPage } = await import("@/app/login/page");
    const el = document.createElement("div");
    document.body.appendChild(el);
    await act(async () => { createRoot(el).render(React.createElement(LoginPage)); });
    const form = el.querySelector("form")!;
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(push).toHaveBeenCalledWith("/dashboard");
    expect(push).not.toHaveBeenCalledWith(expect.stringContaining("evil"));
  });
});
