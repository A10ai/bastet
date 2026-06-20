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
        {/* Skip to content link for keyboard / screen reader users */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-bastet-gold focus:px-4 focus:py-2 focus:text-bastet-bg"
        >
          Skip to content
        </a>
        <Sidebar mobileOpen={mobileOpen} onMobileClose={handleMobileClose} />
        <div className="flex-1 flex flex-col min-w-0">
          <Header onMenuToggle={handleMenuToggle} />
          <main
            id="main-content"
            className="flex-1 p-4 md:p-6 overflow-auto"
            role="main"
            aria-label="Dashboard content"
          >
            {children}
          </main>
        </div>
        <AIChatPanel />
      </div>
    </ToastProvider>
  );
}
