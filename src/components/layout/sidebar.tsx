"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Brain,
  LayoutDashboard,
  Building2,
  CalendarDays,
  Users,
  UserCheck,
  LineChart,
  FileBarChart,
  Sparkles,
  Wrench,
  Wallet,
  Palmtree,
  UserCog,
  Shield,
  Settings,
  Workflow,
  Zap,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SIDEBAR_NAV } from "@/lib/constants";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Activity,
  Brain,
  LayoutDashboard,
  Building2,
  CalendarDays,
  Users,
  UserCheck,
  LineChart,
  FileBarChart,
  Sparkles,
  Wrench,
  Wallet,
  Palmtree,
  UserCog,
  Shield,
  Settings,
  Workflow,
  Zap,
};

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  // Close mobile drawer on route change
  useEffect(() => {
    if (mobileOpen && onMobileClose) {
      onMobileClose();
    }
    // Only trigger on pathname change, not on mobileOpen/onMobileClose changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Prevent body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const sidebarContent = (
    <>
      {/* Brand */}
      <div className="h-16 flex items-center px-4 border-b border-bastet-border">
        {!collapsed && (
          <Link
            href="/dashboard"
            className="flex items-center gap-2"
            onClick={onMobileClose}
          >
            <span className="text-xl font-display font-bold text-white">
              Hospit<span className="text-cyan-400">AI</span>
            </span>
          </Link>
        )}
        {collapsed && (
          <Link href="/dashboard" className="mx-auto" onClick={onMobileClose}>
            <span className="text-xl font-display font-bold text-white">
              H<span className="text-cyan-400">.</span>
            </span>
          </Link>
        )}
        {/* Mobile close button */}
        {onMobileClose && (
          <button
            onClick={onMobileClose}
            className="ml-auto p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bastet-bg transition-colors md:hidden"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {SIDEBAR_NAV.map((item) => {
          const Icon = iconMap[item.icon];
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" &&
              !SIDEBAR_NAV.some((other) => other.href !== item.href && other.href.startsWith(item.href)) &&
              pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onMobileClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-bastet-gold-muted text-bastet-gold"
                  : "text-text-secondary hover:text-text-primary hover:bg-bastet-bg",
                collapsed && "justify-center px-2 md:justify-center md:px-2"
              )}
              title={collapsed ? item.label : undefined}
            >
              {Icon && <Icon className="w-5 h-5 flex-shrink-0" />}
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle - desktop only */}
      <div className="p-2 border-t border-bastet-border hidden md:block">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bastet-bg transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar - hidden on mobile */}
      <aside
        className={cn(
          "h-screen sticky top-0 bg-bastet-card border-r border-bastet-border flex-col transition-all duration-300 hidden md:flex",
          collapsed ? "w-16" : "w-60"
        )}
      >
        {sidebarContent}
      </aside>

      {/* Mobile overlay backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 bg-bastet-card border-r border-bastet-border flex flex-col transition-transform duration-300 ease-in-out md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
