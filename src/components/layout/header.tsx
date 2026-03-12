"use client";

import { useAuth } from "@/providers/auth-provider";
import { Bell, LogOut, User } from "lucide-react";

export function Header() {
  const { staff, signOut } = useAuth();

  return (
    <header className="h-16 bg-bastet-card border-b border-bastet-border flex items-center justify-between px-6">
      <div>
        <h2 className="text-sm text-text-muted">
          Bastet Aparthotels — Hurghada
        </h2>
      </div>

      <div className="flex items-center gap-4">
        {/* Notifications */}
        <button className="relative p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bastet-bg transition-colors">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-status-error rounded-full" />
        </button>

        {/* User menu */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-bastet-gold-muted flex items-center justify-center">
            <User className="w-4 h-4 text-bastet-gold" />
          </div>
          {staff && (
            <div className="hidden sm:block">
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
