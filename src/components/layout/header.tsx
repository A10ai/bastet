"use client";

import { useAuth } from "@/providers/auth-provider";
import { LogOut, Menu, User } from "lucide-react";
import { NotificationBell } from "@/components/layout/notification-bell";

interface HeaderProps {
  onMenuToggle?: () => void;
}

export function Header({ onMenuToggle }: HeaderProps) {
  const { staff, signOut } = useAuth();

  return (
    <header className="h-16 bg-bastet-card border-b border-bastet-border flex items-center justify-between px-4 md:px-6">
      <div className="flex items-center gap-3">
        {/* Hamburger menu - mobile only */}
        {onMenuToggle && (
          <button
            onClick={onMenuToggle}
            className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bastet-bg transition-colors md:hidden"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <div>
          <h2 className="text-sm text-text-muted">
            HospitAI — Bastet Hurghada
          </h2>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-4">
        {/* Notifications */}
        <NotificationBell staffId={staff?.id} />

        {/* User menu */}
        <div className="flex items-center gap-2 md:gap-3">
          <div className="w-8 h-8 rounded-full bg-bastet-gold-muted flex items-center justify-center">
            <User className="w-4 h-4 text-bastet-gold" />
          </div>
          {staff && (
            <div className="hidden md:block">
              <p className="text-sm font-medium text-text-primary">
                {staff.first_name} {staff.last_name}
              </p>
              <p className="text-xs text-text-muted capitalize">
                {staff.role}
              </p>
            </div>
          )}
          <button
            onClick={signOut}
            className="p-2 rounded-lg text-text-secondary hover:text-status-error hover:bg-status-error/10 transition-colors"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
