export const dynamic = "force-dynamic";

import { AuthProvider } from "@/providers/auth-provider";
import { PropertyProvider } from "@/providers/property-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { CookieConsent } from "@/components/cookies/cookie-consent";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <PropertyProvider>
          <DashboardShell>{children}</DashboardShell>
          <CookieConsent />
        </PropertyProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
