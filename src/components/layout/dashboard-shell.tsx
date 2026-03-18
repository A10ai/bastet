"use client";

import { useState, useCallback } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { AIChatPanel } from "@/components/ai/chat-panel";
import { ToastProvider } from "@/components/ui/toast";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleMenuToggle = useCallback(() => {
    setMobileOpen((prev) => !prev);
  }, []);

  const handleMobileClose = useCallback(() => {
    setMobileOpen(false);
  }, []);

  return (
    <ToastProvider>
      <div className="flex min-h-screen bg-bastet-bg">
        <Sidebar mobileOpen={mobileOpen} onMobileClose={handleMobileClose} />
        <div className="flex-1 flex flex-col min-w-0">
          <Header onMenuToggle={handleMenuToggle} />
          <main className="flex-1 p-4 md:p-6 overflow-auto">{children}</main>
        </div>
        <AIChatPanel />
      </div>
    </ToastProvider>
  );
}
