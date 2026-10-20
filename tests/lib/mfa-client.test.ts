import { describe, expect, it } from "vitest";
import { mfaRedirectFor, MFA_SETTINGS_PATH } from "@/lib/mfa-client";

describe("mfaRedirectFor", () => {
  it("sends an unenrolled owner to Settings > Security", () => {
    expect(mfaRedirectFor({ enrolled: false, enrolment_required: true }, "/dashboard/briefing")).toBe(MFA_SETTINGS_PATH);
  });

  it("leaves them alone once they are on the enrolment page", () => {
    expect(mfaRedirectFor({ enrolled: false, enrolment_required: true }, MFA_SETTINGS_PATH)).toBeNull();
  });

  it("does nothing for roles that need not enrol, or once enrolled", () => {
    expect(mfaRedirectFor({ enrolled: false, enrolment_required: false }, "/dashboard")).toBeNull();
    expect(mfaRedirectFor({ enrolled: true, enrolment_required: true }, "/dashboard")).toBeNull();
    expect(mfaRedirectFor(null, "/dashboard")).toBeNull();
    expect(mfaRedirectFor(undefined, "/dashboard")).toBeNull();
  });

  it("sends a session that still needs its second factor back to the MFA step", () => {
    expect(mfaRedirectFor({ enrolled: true, verification_required: true }, "/dashboard/bookings")).toBe(
      "/login?step=mfa&redirect=%2Fdashboard%2Fbookings"
    );
  });
});
