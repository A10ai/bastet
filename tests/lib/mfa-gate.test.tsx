import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

const replace = vi.fn();
let pathname = "/dashboard/briefing";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => pathname,
}));

import { MfaGate } from "@/components/auth/mfa-gate";

function mockStatus(status: number, data?: unknown) {
  globalThis.fetch = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ data }),
  })) as unknown as typeof fetch;
}

async function mount(): Promise<Root> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(MfaGate));
  });
  // let the fetch promise chain settle
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return root;
}

describe("MfaGate", () => {
  // React warns unless act() knows it is in a test environment
  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    replace.mockReset();
    pathname = "/dashboard/briefing";
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redirects an unenrolled owner to Settings > Security", async () => {
    mockStatus(200, { enrolled: false, enrolment_required: true, verification_required: false });
    const root = await mount();
    expect(replace).toHaveBeenCalledWith("/dashboard/settings/security");
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/v1/auth/mfa", expect.objectContaining({ credentials: "same-origin" }));
    root.unmount();
  });

  it("does not redirect from the enrolment page itself", async () => {
    pathname = "/dashboard/settings/security";
    mockStatus(200, { enrolled: false, enrolment_required: true, verification_required: false });
    const root = await mount();
    expect(replace).not.toHaveBeenCalled();
    root.unmount();
  });

  it("stays put for an enrolled user and when the status call fails", async () => {
    mockStatus(200, { enrolled: true, enrolment_required: true, verification_required: false });
    let root = await mount();
    expect(replace).not.toHaveBeenCalled();
    root.unmount();

    mockStatus(502);
    root = await mount();
    expect(replace).not.toHaveBeenCalled();
    root.unmount();
  });
});
