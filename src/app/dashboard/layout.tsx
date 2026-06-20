export const dynamic = "force-dynamic";

import { AuthProvider } from "@/providers/auth-provider";
import { PropertyProvider } from "@/providers/property-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { CookieConsent } from "@/components/cookies/cookie-consent";
import { CSRFTokenProvider } from "@/components/CSRFTokenProvider";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <PropertyProvider>
          <CSRFTokenProvider>
            <DashboardShell>{children}</DashboardShell>
          </CSRFTokenProvider>
          <CookieConsent />
        </PropertyProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
