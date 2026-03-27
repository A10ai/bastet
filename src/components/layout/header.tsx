"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useProperty } from "@/providers/property-provider";
import { useTheme } from "@/providers/theme-provider";
import { Building2, ChevronDown, LogOut, Menu, Moon, Sun, User } from "lucide-react";
import { NotificationBell } from "@/components/layout/notification-bell";

interface HeaderProps {
  onMenuToggle?: () => void;
}

export function Header({ onMenuToggle }: HeaderProps) {
  const { staff, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { properties, activeProperty, switchProperty } = useProperty();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const hasMultiple = properties.length > 1;

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  return (
    <header className="h-16 bg-bastet-card border-b border-bastet-border flex items-center justify-between px-4 md:px-6 theme-transition">
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
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => hasMultiple && setDropdownOpen((prev) => !prev)}
            className={`flex items-center gap-2 text-sm text-text-muted ${hasMultiple ? "hover:text-text-primary cursor-pointer" : "cursor-default"} transition-colors`}
          >
            <Building2 className="w-4 h-4 text-bastet-gold shrink-0" />
            <span>
              HospitAI{activeProperty?.name ? ` — ${activeProperty.name}` : ""}
            </span>
            {hasMultiple && (
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
            )}
          </button>

          {/* Dropdown */}
          {dropdownOpen && hasMultiple && (
            <div className="absolute top-full left-0 mt-1 w-64 bg-bastet-card border border-bastet-border rounded-lg shadow-lg py-1 z-50">
              {properties.map((property) => (
                <button
                  key={property.id}
                  onClick={() => {
                    switchProperty(property.id);
                    setDropdownOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition-colors ${
                    property.id === activeProperty?.id
                      ? "text-bastet-gold bg-bastet-gold/5"
                      : "text-text-secondary hover:text-text-primary hover:bg-bastet-bg"
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="truncate">{property.name}</p>
                    <p className="text-xs text-text-muted truncate">
                      {property.city}, {property.country}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-4">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bastet-bg transition-colors"
          aria-label={
            theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
          }
          title={
            theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
          }
        >
          {theme === "dark" ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </button>

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
