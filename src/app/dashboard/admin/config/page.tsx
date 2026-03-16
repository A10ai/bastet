"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/providers/auth-provider";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Shield,
  Settings,
  Loader2,
  Save,
  Building2,
  DollarSign,
  Globe,
  Percent,
} from "lucide-react";

interface Toast {
  id: number;
  message: string;
  type: "success" | "error";
}

interface PropertyData {
  id: string;
  name: string;
  address: string;
  city: string;
  country: string;
  timezone: string;
  default_currency: string;
  reporting_currency: string;
  phone: string | null;
  email: string;
  website: string | null;
  [key: string]: any;
}

interface RateRow {
  id: string;
  apartment_type_id: string;
  season: string;
  start_date: string;
  end_date: string;
  weekly_rate_gbp: number;
  min_nights: number;
  [key: string]: any;
}

interface ChannelRow {
  id: string;
  name: string;
  code: string;
  commission_rate: number;
  is_active: boolean;
  [key: string]: any;
}

interface CurrencyRow {
  id: string;
  base_currency: string;
  target_currency: string;
  rate: number;
  source: string;
  [key: string]: any;
}

export default function SystemConfigPage() {
  const { staff, loading: authLoading } = useAuth();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [activeTab, setActiveTab] = useState<
    "property" | "rates" | "channels" | "currency"
  >("property");

  // Property state
  const [property, setProperty] = useState<PropertyData | null>(null);
  const [propertyLoading, setPropertyLoading] = useState(true);
  const [propertySaving, setPropertySaving] = useState(false);

  // Rates state
  const [rates, setRates] = useState<RateRow[]>([]);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [editingRate, setEditingRate] = useState<string | null>(null);
  const [rateEdits, setRateEdits] = useState<Partial<RateRow>>({});

  // Channels state
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [editingChannel, setEditingChannel] = useState<string | null>(null);
  const [channelEdits, setChannelEdits] = useState<Partial<ChannelRow>>({});

  // Currency rates state
  const [currencyRates, setCurrencyRates] = useState<CurrencyRow[]>([]);
  const [currencyLoading, setCurrencyLoading] = useState(false);
  const [editingCurrency, setEditingCurrency] = useState<string | null>(null);
  const [currencyEdits, setCurrencyEdits] = useState<Partial<CurrencyRow>>({});

  const showToast = (message: string, type: Toast["type"] = "success") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  // Fetch property
  const fetchProperty = useCallback(async () => {
    setPropertyLoading(true);
    try {
      const res = await fetch("/api/v1/admin/database?table=properties&page=1");
      const json = await res.json();
      if (json.data && json.data.length > 0) {
        setProperty(json.data[0]);
      }
    } catch {
      showToast("Failed to load property", "error");
    } finally {
      setPropertyLoading(false);
    }
  }, []);

  // Fetch rates
  const fetchRates = useCallback(async () => {
    setRatesLoading(true);
    try {
      const res = await fetch(
        "/api/v1/admin/database?table=rates&page=1&sort=start_date&dir=asc"
      );
      const json = await res.json();
      setRates(json.data || []);
    } catch {
      showToast("Failed to load rates", "error");
    } finally {
      setRatesLoading(false);
    }
  }, []);

  // Fetch channels
  const fetchChannels = useCallback(async () => {
    setChannelsLoading(true);
    try {
      const res = await fetch(
        "/api/v1/admin/database?table=booking_channels&page=1"
      );
      const json = await res.json();
      setChannels(json.data || []);
    } catch {
      showToast("Failed to load channels", "error");
    } finally {
      setChannelsLoading(false);
    }
  }, []);

  // Fetch currency rates
  const fetchCurrencyRates = useCallback(async () => {
    setCurrencyLoading(true);
    try {
      const res = await fetch(
        "/api/v1/admin/database?table=currency_rates&page=1"
      );
      const json = await res.json();
      setCurrencyRates(json.data || []);
    } catch {
      showToast("Failed to load currency rates", "error");
    } finally {
      setCurrencyLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProperty();
  }, [fetchProperty]);

  useEffect(() => {
    if (activeTab === "rates" && rates.length === 0) fetchRates();
    if (activeTab === "channels" && channels.length === 0) fetchChannels();
    if (activeTab === "currency" && currencyRates.length === 0)
      fetchCurrencyRates();
  }, [
    activeTab,
    rates.length,
    channels.length,
    currencyRates.length,
    fetchRates,
    fetchChannels,
    fetchCurrencyRates,
  ]);

  // Save property
  const saveProperty = async () => {
    if (!property) return;
    setPropertySaving(true);
    try {
      const res = await fetch("/api/v1/admin/database", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table: "properties",
          id: property.id,
          updates: {
            name: property.name,
            address: property.address,
            city: property.city,
            country: property.country,
            timezone: property.timezone,
            default_currency: property.default_currency,
            reporting_currency: property.reporting_currency,
            phone: property.phone,
            email: property.email,
            website: property.website,
          },
        }),
      });
      const json = await res.json();
      if (json.error) {
        showToast(json.error, "error");
        return;
      }
      showToast("Property settings saved");
    } catch {
      showToast("Failed to save", "error");
    } finally {
      setPropertySaving(false);
    }
  };

  // Save rate
  const saveRate = async (id: string) => {
    try {
      const res = await fetch("/api/v1/admin/database", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table: "rates",
          id,
          updates: rateEdits,
        }),
      });
      const json = await res.json();
      if (json.error) {
        showToast(json.error, "error");
        return;
      }
      showToast("Rate updated");
      setEditingRate(null);
      fetchRates();
    } catch {
      showToast("Failed to save rate", "error");
    }
  };

  // Save channel
  const saveChannel = async (id: string) => {
    try {
      const res = await fetch("/api/v1/admin/database", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table: "booking_channels",
          id,
          updates: channelEdits,
        }),
      });
      const json = await res.json();
      if (json.error) {
        showToast(json.error, "error");
        return;
      }
      showToast("Channel updated");
      setEditingChannel(null);
      fetchChannels();
    } catch {
      showToast("Failed to save channel", "error");
    }
  };

  // Save currency rate
  const saveCurrency = async (id: string) => {
    try {
      const res = await fetch("/api/v1/admin/database", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table: "currency_rates",
          id,
          updates: currencyEdits,
        }),
      });
      const json = await res.json();
      if (json.error) {
        showToast(json.error, "error");
        return;
      }
      showToast("Currency rate updated");
      setEditingCurrency(null);
      fetchCurrencyRates();
    } catch {
      showToast("Failed to save currency rate", "error");
    }
  };

  // Access control
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  if (!staff || !["owner", "admin"].includes(staff.role)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <Shield className="w-16 h-16 text-status-error mb-4" />
        <h1 className="text-2xl font-display font-bold text-text-primary mb-2">
          Access Denied
        </h1>
        <p className="text-text-secondary">
          You need owner or admin privileges to access this page.
        </p>
      </div>
    );
  }

  const inputClass =
    "w-full bg-bastet-bg border border-bastet-border rounded-lg text-sm text-text-primary px-3 py-2 placeholder:text-text-muted focus:outline-none focus:border-cyan-400/40";

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
      <div className="flex gap-1 bg-bastet-card border border-bastet-border rounded-lg p-1 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-cyan-400 text-bastet-bg"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Property Settings Tab */}
      {activeTab === "property" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-display font-semibold text-text-primary">
                Property Settings
              </h2>
              <Button
                size="sm"
                onClick={saveProperty}
                disabled={propertySaving || !property}
              >
                {propertySaving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save Changes
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {propertyLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
              </div>
            ) : property ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wider">
                    Property Name
                  </label>
                  <input
                    type="text"
                    value={property.name}
                    onChange={(e) =>
                      setProperty((p) =>
                        p ? { ...p, name: e.target.value } : p
                      )
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wider">
                    Email
                  </label>
                  <input
                    type="email"
                    value={property.email}
                    onChange={(e) =>
                      setProperty((p) =>
                        p ? { ...p, email: e.target.value } : p
                      )
                    }
                    className={inputClass}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wider">
                    Address
                  </label>
                  <input
                    type="text"
                    value={property.address}
                    onChange={(e) =>
                      setProperty((p) =>
                        p ? { ...p, address: e.target.value } : p
                      )
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wider">
                    City
                  </label>
                  <input
                    type="text"
                    value={property.city}
                    onChange={(e) =>
                      setProperty((p) =>
                        p ? { ...p, city: e.target.value } : p
                      )
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wider">
                    Country
                  </label>
                  <input
                    type="text"
                    value={property.country}
                    onChange={(e) =>
                      setProperty((p) =>
                        p ? { ...p, country: e.target.value } : p
                      )
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wider">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={property.phone || ""}
                    onChange={(e) =>
                      setProperty((p) =>
                        p ? { ...p, phone: e.target.value || null } : p
                      )
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wider">
                    Website
                  </label>
                  <input
                    type="url"
                    value={property.website || ""}
                    onChange={(e) =>
                      setProperty((p) =>
                        p ? { ...p, website: e.target.value || null } : p
                      )
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wider">
                    Timezone
                  </label>
                  <input
                    type="text"
                    value={property.timezone}
                    onChange={(e) =>
                      setProperty((p) =>
                        p ? { ...p, timezone: e.target.value } : p
                      )
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wider">
                    Default Currency
                  </label>
                  <input
                    type="text"
                    value={property.default_currency}
                    onChange={(e) =>
                      setProperty((p) =>
                        p
                          ? { ...p, default_currency: e.target.value }
                          : p
                      )
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wider">
                    Reporting Currency
                  </label>
                  <input
                    type="text"
                    value={property.reporting_currency}
                    onChange={(e) =>
                      setProperty((p) =>
                        p
                          ? { ...p, reporting_currency: e.target.value }
                          : p
                      )
                    }
                    className={inputClass}
                  />
                </div>
              </div>
            ) : (
              <p className="text-text-muted text-sm py-8 text-center">
                No property found
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Rates Tab */}
      {activeTab === "rates" && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-display font-semibold text-text-primary">
              Seasonal Rates
            </h2>
          </CardHeader>
          <CardContent className="p-0">
            {ratesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-bastet-border bg-bastet-bg/50">
                      <th className="text-left text-xs font-medium text-cyan-400/80 px-4 py-3">
                        Season
                      </th>
                      <th className="text-left text-xs font-medium text-cyan-400/80 px-4 py-3">
                        Start Date
                      </th>
                      <th className="text-left text-xs font-medium text-cyan-400/80 px-4 py-3">
                        End Date
                      </th>
                      <th className="text-left text-xs font-medium text-cyan-400/80 px-4 py-3">
                        Weekly Rate (GBP)
                      </th>
                      <th className="text-left text-xs font-medium text-cyan-400/80 px-4 py-3">
                        Min Nights
                      </th>
                      <th className="text-right text-xs font-medium text-text-muted px-4 py-3">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rates.map((rate, idx) => (
                      <tr
                        key={rate.id}
                        className={`border-b border-bastet-border last:border-0 hover:bg-bastet-bg/50 transition-colors ${
                          idx % 2 === 1 ? "bg-bastet-bg/20" : ""
                        }`}
                      >
                        <td className="px-4 py-2.5">
                          {editingRate === rate.id ? (
                            <input
                              type="text"
                              value={
                                rateEdits.season ?? rate.season
                              }
                              onChange={(e) =>
                                setRateEdits((r) => ({
                                  ...r,
                                  season: e.target.value,
                                }))
                              }
                              className="bg-bastet-bg border border-cyan-400/40 rounded px-2 py-1 text-xs text-text-primary focus:outline-none w-28"
                            />
                          ) : (
                            <span className="text-text-primary capitalize">
                              {rate.season}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {editingRate === rate.id ? (
                            <input
                              type="date"
                              value={
                                rateEdits.start_date ?? rate.start_date
                              }
                              onChange={(e) =>
                                setRateEdits((r) => ({
                                  ...r,
                                  start_date: e.target.value,
                                }))
                              }
                              className="bg-bastet-bg border border-cyan-400/40 rounded px-2 py-1 text-xs text-text-primary focus:outline-none"
                            />
                          ) : (
                            <span className="text-text-secondary text-xs">
                              {rate.start_date}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {editingRate === rate.id ? (
                            <input
                              type="date"
                              value={
                                rateEdits.end_date ?? rate.end_date
                              }
                              onChange={(e) =>
                                setRateEdits((r) => ({
                                  ...r,
                                  end_date: e.target.value,
                                }))
                              }
                              className="bg-bastet-bg border border-cyan-400/40 rounded px-2 py-1 text-xs text-text-primary focus:outline-none"
                            />
                          ) : (
                            <span className="text-text-secondary text-xs">
                              {rate.end_date}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {editingRate === rate.id ? (
                            <input
                              type="number"
                              value={
                                rateEdits.weekly_rate_gbp ??
                                rate.weekly_rate_gbp
                              }
                              onChange={(e) =>
                                setRateEdits((r) => ({
                                  ...r,
                                  weekly_rate_gbp: parseFloat(
                                    e.target.value
                                  ),
                                }))
                              }
                              className="bg-bastet-bg border border-cyan-400/40 rounded px-2 py-1 text-xs text-text-primary focus:outline-none w-24"
                            />
                          ) : (
                            <span className="text-text-primary font-mono">
                              {Number(rate.weekly_rate_gbp).toFixed(2)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {editingRate === rate.id ? (
                            <input
                              type="number"
                              value={
                                rateEdits.min_nights ?? rate.min_nights
                              }
                              onChange={(e) =>
                                setRateEdits((r) => ({
                                  ...r,
                                  min_nights: parseInt(e.target.value),
                                }))
                              }
                              className="bg-bastet-bg border border-cyan-400/40 rounded px-2 py-1 text-xs text-text-primary focus:outline-none w-16"
                            />
                          ) : (
                            <span className="text-text-secondary">
                              {rate.min_nights}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {editingRate === rate.id ? (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => saveRate(rate.id)}
                                className="px-2 py-1 bg-status-success/10 text-status-success text-xs rounded hover:bg-status-success/20 transition-colors"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingRate(null)}
                                className="px-2 py-1 text-text-muted text-xs hover:text-text-primary transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingRate(rate.id);
                                setRateEdits({});
                              }}
                              className="px-2 py-1 text-text-muted text-xs hover:text-cyan-400 transition-colors"
                            >
                              Edit
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {rates.length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className="text-center py-12 text-text-muted text-sm"
                        >
                          No rates configured
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Channels Tab */}
      {activeTab === "channels" && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-display font-semibold text-text-primary">
              Booking Channel Commissions
            </h2>
          </CardHeader>
          <CardContent className="p-0">
            {channelsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-bastet-border bg-bastet-bg/50">
                      <th className="text-left text-xs font-medium text-cyan-400/80 px-4 py-3">
                        Channel Name
                      </th>
                      <th className="text-left text-xs font-medium text-cyan-400/80 px-4 py-3">
                        Code
                      </th>
                      <th className="text-left text-xs font-medium text-cyan-400/80 px-4 py-3">
                        Commission Rate
                      </th>
                      <th className="text-left text-xs font-medium text-cyan-400/80 px-4 py-3">
                        Active
                      </th>
                      <th className="text-right text-xs font-medium text-text-muted px-4 py-3">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {channels.map((ch, idx) => (
                      <tr
                        key={ch.id}
                        className={`border-b border-bastet-border last:border-0 hover:bg-bastet-bg/50 transition-colors ${
                          idx % 2 === 1 ? "bg-bastet-bg/20" : ""
                        }`}
                      >
                        <td className="px-4 py-2.5">
                          {editingChannel === ch.id ? (
                            <input
                              type="text"
                              value={channelEdits.name ?? ch.name}
                              onChange={(e) =>
                                setChannelEdits((c) => ({
                                  ...c,
                                  name: e.target.value,
                                }))
                              }
                              className="bg-bastet-bg border border-cyan-400/40 rounded px-2 py-1 text-xs text-text-primary focus:outline-none"
                            />
                          ) : (
                            <span className="text-text-primary font-medium">
                              {ch.name}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-text-muted font-mono text-xs">
                            {ch.code}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          {editingChannel === ch.id ? (
                            <input
                              type="number"
                              step="0.01"
                              value={
                                channelEdits.commission_rate ??
                                ch.commission_rate
                              }
                              onChange={(e) =>
                                setChannelEdits((c) => ({
                                  ...c,
                                  commission_rate: parseFloat(
                                    e.target.value
                                  ),
                                }))
                              }
                              className="bg-bastet-bg border border-cyan-400/40 rounded px-2 py-1 text-xs text-text-primary focus:outline-none w-20"
                            />
                          ) : (
                            <span className="text-text-primary font-mono">
                              {(Number(ch.commission_rate) * 100).toFixed(1)}%
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {editingChannel === ch.id ? (
                            <button
                              onClick={() =>
                                setChannelEdits((c) => ({
                                  ...c,
                                  is_active: !(
                                    c.is_active ?? ch.is_active
                                  ),
                                }))
                              }
                              className={`px-2 py-0.5 rounded text-xs font-medium ${
                                (channelEdits.is_active ?? ch.is_active)
                                  ? "bg-status-success/10 text-status-success"
                                  : "bg-status-error/10 text-status-error"
                              }`}
                            >
                              {(channelEdits.is_active ?? ch.is_active)
                                ? "Active"
                                : "Inactive"}
                            </button>
                          ) : (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                ch.is_active
                                  ? "bg-status-success/10 text-status-success"
                                  : "bg-status-error/10 text-status-error"
                              }`}
                            >
                              {ch.is_active ? "Active" : "Inactive"}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {editingChannel === ch.id ? (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => saveChannel(ch.id)}
                                className="px-2 py-1 bg-status-success/10 text-status-success text-xs rounded hover:bg-status-success/20 transition-colors"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingChannel(null)}
                                className="px-2 py-1 text-text-muted text-xs hover:text-text-primary transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingChannel(ch.id);
                                setChannelEdits({});
                              }}
                              className="px-2 py-1 text-text-muted text-xs hover:text-cyan-400 transition-colors"
                            >
                              Edit
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {channels.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="text-center py-12 text-text-muted text-sm"
                        >
                          No channels configured
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Currency Rates Tab */}
      {activeTab === "currency" && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-display font-semibold text-text-primary">
              Currency Exchange Rates
            </h2>
          </CardHeader>
          <CardContent className="p-0">
            {currencyLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-bastet-border bg-bastet-bg/50">
                      <th className="text-left text-xs font-medium text-cyan-400/80 px-4 py-3">
                        Base Currency
                      </th>
                      <th className="text-left text-xs font-medium text-cyan-400/80 px-4 py-3">
                        Target Currency
                      </th>
                      <th className="text-left text-xs font-medium text-cyan-400/80 px-4 py-3">
                        Rate
                      </th>
                      <th className="text-left text-xs font-medium text-cyan-400/80 px-4 py-3">
                        Source
                      </th>
                      <th className="text-right text-xs font-medium text-text-muted px-4 py-3">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {currencyRates.map((cr, idx) => (
                      <tr
                        key={cr.id}
                        className={`border-b border-bastet-border last:border-0 hover:bg-bastet-bg/50 transition-colors ${
                          idx % 2 === 1 ? "bg-bastet-bg/20" : ""
                        }`}
                      >
                        <td className="px-4 py-2.5">
                          <span className="text-text-primary font-mono">
                            {cr.base_currency}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-text-primary font-mono">
                            {cr.target_currency}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          {editingCurrency === cr.id ? (
                            <input
                              type="number"
                              step="0.0001"
                              value={
                                currencyEdits.rate ?? cr.rate
                              }
                              onChange={(e) =>
                                setCurrencyEdits((c) => ({
                                  ...c,
                                  rate: parseFloat(e.target.value),
                                }))
                              }
                              className="bg-bastet-bg border border-cyan-400/40 rounded px-2 py-1 text-xs text-text-primary focus:outline-none w-28"
                            />
                          ) : (
                            <span className="text-text-primary font-mono">
                              {Number(cr.rate).toFixed(4)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-text-muted text-xs">
                            {cr.source}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {editingCurrency === cr.id ? (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => saveCurrency(cr.id)}
                                className="px-2 py-1 bg-status-success/10 text-status-success text-xs rounded hover:bg-status-success/20 transition-colors"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingCurrency(null)}
                                className="px-2 py-1 text-text-muted text-xs hover:text-text-primary transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingCurrency(cr.id);
                                setCurrencyEdits({});
                              }}
                              className="px-2 py-1 text-text-muted text-xs hover:text-cyan-400 transition-colors"
                            >
                              Edit
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {currencyRates.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="text-center py-12 text-text-muted text-sm"
                        >
                          No currency rates configured
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
