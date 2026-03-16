"use client";

import { useEffect } from "react";
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
  const pathname = usePathname();

  // Close mobile drawer on route change
  useEffect(() => {
    if (mobileOpen && onMobileClose) {
      onMobileClose();
    }
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

  return (
    <>
      {/* Desktop sidebar — always icon-only, transparent */}
      <aside className="h-screen sticky top-0 w-16 bg-bastet-card/60 backdrop-blur-xl border-r border-bastet-border/50 flex-col hidden md:flex">
        {/* Logo */}
        <div className="h-16 flex items-center justify-center border-b border-bastet-border/50">
          <Link href="/dashboard">
            <span className="text-lg font-display font-bold text-white">
              H<span className="text-cyan-400">.</span>
            </span>
          </Link>
        </div>

        {/* Nav icons */}
        <nav className="flex-1 py-3 px-1.5 space-y-0.5 overflow-y-auto">
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
                className={cn(
                  "flex items-center justify-center w-11 h-11 mx-auto rounded-xl transition-all duration-200",
                  isActive
                    ? "bg-cyan-400/15 text-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.15)]"
                    : "text-text-muted hover:text-text-primary hover:bg-white/5"
                )}
                title={item.label}
              >
                {Icon && <Icon className="w-[18px] h-[18px]" />}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile overlay backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      {/* Mobile drawer — full sidebar with labels */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-bastet-card/95 backdrop-blur-xl border-r border-bastet-border/50 flex flex-col transition-transform duration-300 ease-in-out md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Brand + close */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-bastet-border/50">
          <Link href="/dashboard" onClick={onMobileClose}>
            <span className="text-xl font-display font-bold text-white">
              Hospit<span className="text-cyan-400">AI</span>
            </span>
          </Link>
          <button
            onClick={onMobileClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav with labels */}
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
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
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-cyan-400/15 text-cyan-400"
                    : "text-text-secondary hover:text-text-primary hover:bg-white/5"
                )}
              >
                {Icon && <Icon className="w-[18px] h-[18px] flex-shrink-0" />}
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
