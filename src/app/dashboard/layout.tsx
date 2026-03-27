export const dynamic = "force-dynamic";

import { AuthProvider } from "@/providers/auth-provider";
import { PropertyProvider } from "@/providers/property-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { DashboardShell } from "@/components/layout/dashboard-shell";

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
        </PropertyProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
