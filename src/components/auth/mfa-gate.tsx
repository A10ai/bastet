"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { mfaRedirectFor, type MfaStatusView } from "@/lib/mfa-client";

/**
 * Sends owners and admins who have not enrolled an authenticator to
 * Settings > Security instead of letting every page fail with 403
 * MFA_ENROLMENT_REQUIRED. Renders nothing; a failed status check is ignored
 * so an auth-server blip never locks anyone out of the shell.
 */
export function MfaGate() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v1/auth/mfa", { credentials: "same-origin", cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { data?: MfaStatusView };
        if (cancelled) return;
        const target = mfaRedirectFor(json.data, pathname);
        if (target) router.replace(target);
      } catch {
        // Status unavailable: leave the page alone.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  return null;
}
