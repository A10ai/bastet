"use client";

import { AdminLoading, AccessDenied, isAdminRole } from "@/components/admin/admin-gate";
import { useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/providers/auth-provider";
import { Settings, Building2, DollarSign, Globe, Percent } from "lucide-react";
import { PropertyTab } from "@/components/admin/config/property-tab";
import { RatesTab } from "@/components/admin/config/rates-tab";
import { ChannelsTab } from "@/components/admin/config/channels-tab";
import { CurrencyTab } from "@/components/admin/config/currency-tab";
import type { Toast } from "@/components/admin/config/types";

export default function SystemConfigPage() {
  const { staff, loading: authLoading } = useAuth();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [activeTab, setActiveTab] = useState<
    "property" | "rates" | "channels" | "currency"
  >("property");

  const showToast = useCallback((message: string, type: Toast["type"] = "success") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  // Access control
  if (authLoading) return <AdminLoading />;
  if (!staff || !isAdminRole(staff.role)) return <AccessDenied />;

  const inputClass =
    "w-full bg-brand-bg border border-brand-border rounded-lg text-sm text-text-primary px-3 py-2 placeholder:text-text-muted focus:outline-none focus:border-cyan-400/40";

  const tabs = [
    { key: "property" as const, label: "Property", icon: Building2 },
    { key: "rates" as const, label: "Rates", icon: DollarSign },
    { key: "channels" as const, label: "Channels", icon: Percent },
    { key: "currency" as const, label: "Currency", icon: Globe },
  ];

  return (
    <div className="space-y-6">
      {/* Toasts */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-lg text-sm font-medium shadow-lg ${
              toast.type === "success"
                ? "bg-status-success/20 text-status-success border border-status-success/30"
                : "bg-status-error/20 text-status-error border border-status-error/30"
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-text-muted mb-1">
          <Link
            href="/dashboard/admin"
            className="hover:text-cyan-400 transition-colors"
          >
            Admin
          </Link>
          <span>/</span>
          <span className="text-text-secondary">System Config</span>
        </div>
        <div className="flex items-center gap-3">
          <Settings className="w-6 h-6 text-cyan-400" />
          <h1 className="text-2xl font-display font-bold text-text-primary">
            System Configuration
          </h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-brand-card border border-brand-border rounded-lg p-1 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-cyan-400 text-brand-bg"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Property Settings Tab */}
      {activeTab === "property" && <PropertyTab showToast={showToast} inputClass={inputClass} />}
      {/* Rates Tab */}
      {activeTab === "rates" && <RatesTab showToast={showToast} />}
      {/* Channels Tab */}
      {activeTab === "channels" && <ChannelsTab showToast={showToast} />}
      {/* Currency Rates Tab */}
      {activeTab === "currency" && <CurrencyTab showToast={showToast} />}
    </div>
  );
}
