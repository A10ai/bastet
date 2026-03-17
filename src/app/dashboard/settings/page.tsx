"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Settings,
  Building2,
  CalendarClock,
  DollarSign,
  Users,
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";

/* ---------- types ---------- */

interface Property {
  id: string;
  name: string;
  slug: string;
  address: string;
  city: string;
  country: string;
  timezone: string;
  default_currency: string;
  reporting_currency: string;
  star_rating: number;
  total_apartments: number;
  status: string;
  phone: string;
  email: string;
  website: string;
}

interface ApartmentType {
  id: string;
  name: string;
  base_rate_gbp: number | null;
  base_weekly_rate_gbp: number | null;
  [key: string]: unknown;
}

interface BookingChannel {
  id: string;
  name: string;
  commission_rate: number | null;
  is_active: boolean;
  [key: string]: unknown;
}

interface BookingPolicies {
  check_in_time: string;
  check_out_time: string;
  cancellation_policy: string;
  minimum_stay: number;
  maximum_stay: number;
}

/* ---------- tab definitions ---------- */

const TABS = [
  { id: "property", label: "Property", icon: Building2 },
  { id: "policies", label: "Booking Policies", icon: CalendarClock },
  { id: "rates", label: "Rate Management", icon: DollarSign },
  { id: "channels", label: "Channel Commissions", icon: Users },
] as const;

type TabId = (typeof TABS)[number]["id"];

/* ---------- toast component ---------- */

function Toast({
  message,
  type,
  onClose,
}: {
  message: string;
  type: "success" | "error";
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg border transition-all ${
        type === "success"
          ? "bg-status-success/10 border-status-success/30 text-status-success"
          : "bg-status-error/10 border-status-error/30 text-status-error"
      }`}
      role="alert"
    >
      {type === "success" ? (
        <CheckCircle2 className="w-4 h-4 shrink-0" />
      ) : (
        <AlertCircle className="w-4 h-4 shrink-0" />
      )}
      <span className="text-sm font-medium">{message}</span>
    </div>
  );
}

/* ---------- local storage helpers ---------- */

const POLICIES_KEY = "bastet_booking_policies";

function loadPolicies(): BookingPolicies {
  if (typeof window === "undefined") {
    return defaultPolicies();
  }
  try {
    const raw = localStorage.getItem(POLICIES_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return defaultPolicies();
}

function savePoliciesLocal(policies: BookingPolicies) {
  localStorage.setItem(POLICIES_KEY, JSON.stringify(policies));
}

function defaultPolicies(): BookingPolicies {
  return {
    check_in_time: "15:00",
    check_out_time: "11:00",
    cancellation_policy: "",
    minimum_stay: 1,
    maximum_stay: 365,
  };
}

/* ========== main component ========== */

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("property");
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  /* --- property state --- */
  const [property, setProperty] = useState<Property | null>(null);
  const [propertyLoading, setPropertyLoading] = useState(true);
  const [propertySaving, setPropertySaving] = useState(false);

  /* --- policies state --- */
  const [policies, setPolicies] = useState<BookingPolicies>(defaultPolicies());

  /* --- rates state --- */
  const [apartmentTypes, setApartmentTypes] = useState<ApartmentType[]>([]);
  const [ratesLoading, setRatesLoading] = useState(true);
  const [ratesSaving, setRatesSaving] = useState(false);
  const [editedRates, setEditedRates] = useState<
    Record<string, Partial<ApartmentType>>
  >({});

  /* --- channels state --- */
  const [channels, setChannels] = useState<BookingChannel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [channelsSaving, setChannelsSaving] = useState(false);
  const [editedChannels, setEditedChannels] = useState<
    Record<string, Partial<BookingChannel>>
  >({});

  /* ---------- data fetching ---------- */

  const fetchProperty = useCallback(async () => {
    setPropertyLoading(true);
    try {
      const res = await fetch("/api/v1/properties");
      const json = await res.json();
      if (json.data && json.data.length > 0) {
        setProperty(json.data[0]);
      }
    } catch {
      setToast({ message: "Failed to load property", type: "error" });
    } finally {
      setPropertyLoading(false);
    }
  }, []);

  const fetchApartmentTypes = useCallback(async () => {
    setRatesLoading(true);
    try {
      const res = await fetch("/api/v1/apartment-types");
      const json = await res.json();
      setApartmentTypes(json.data || []);
    } catch {
      setToast({ message: "Failed to load apartment types", type: "error" });
    } finally {
      setRatesLoading(false);
    }
  }, []);

  const fetchChannels = useCallback(async () => {
    setChannelsLoading(true);
    try {
      const res = await fetch("/api/v1/booking-channels");
      const json = await res.json();
      setChannels(json.data || []);
    } catch {
      setToast({ message: "Failed to load channels", type: "error" });
    } finally {
      setChannelsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProperty();
    fetchApartmentTypes();
    fetchChannels();
    setPolicies(loadPolicies());
  }, [fetchProperty, fetchApartmentTypes, fetchChannels]);

  /* ---------- save handlers ---------- */

  const saveProperty = async () => {
    if (!property) return;
    setPropertySaving(true);
    try {
      const res = await fetch("/api/v1/properties", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(property),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Save failed");
      }
      setToast({ message: "Property settings saved", type: "success" });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to save property";
      setToast({ message, type: "error" });
    } finally {
      setPropertySaving(false);
    }
  };

  const savePolicies = () => {
    savePoliciesLocal(policies);
    setToast({
      message: "Booking policies saved locally",
      type: "success",
    });
  };

  const saveRates = async () => {
    const ids = Object.keys(editedRates);
    if (ids.length === 0) {
      setToast({ message: "No rate changes to save", type: "error" });
      return;
    }
    setRatesSaving(true);
    try {
      for (const id of ids) {
        const res = await fetch(`/api/v1/apartment-types/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editedRates[id]),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || `Failed to update type ${id}`);
        }
      }
      setEditedRates({});
      await fetchApartmentTypes();
      setToast({ message: "Rates saved successfully", type: "success" });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to save rates";
      setToast({ message, type: "error" });
    } finally {
      setRatesSaving(false);
    }
  };

  const saveChannels = async () => {
    const ids = Object.keys(editedChannels);
    if (ids.length === 0) {
      setToast({ message: "No channel changes to save", type: "error" });
      return;
    }
    setChannelsSaving(true);
    try {
      for (const id of ids) {
        const res = await fetch(`/api/v1/booking-channels/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editedChannels[id]),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || `Failed to update channel ${id}`);
        }
      }
      setEditedChannels({});
      await fetchChannels();
      setToast({
        message: "Channel commissions saved successfully",
        type: "success",
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to save channels";
      setToast({ message, type: "error" });
    } finally {
      setChannelsSaving(false);
    }
  };

  /* ---------- field change helpers ---------- */

  const updateProperty = (field: keyof Property, value: string | number) => {
    if (!property) return;
    setProperty({ ...property, [field]: value });
  };

  const updateRate = (
    id: string,
    field: "base_rate_gbp" | "base_weekly_rate_gbp",
    value: string
  ) => {
    const numVal = value === "" ? null : parseFloat(value);
    setEditedRates((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: numVal },
    }));
    setApartmentTypes((prev) =>
      prev.map((t) => (t.id === id ? { ...t, [field]: numVal } : t))
    );
  };

  const updateChannel = (id: string, value: string) => {
    const numVal = value === "" ? null : parseFloat(value);
    setEditedChannels((prev) => ({
      ...prev,
      [id]: { ...prev[id], commission_rate: numVal },
    }));
    setChannels((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, commission_rate: numVal } : c
      )
    );
  };

  /* ---------- render ---------- */

  return (
    <div className="space-y-6">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* header */}
      <div>
        <h1 className="text-2xl font-display font-bold text-text-primary">
          Settings
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Property configuration, booking policies, rates, and channel
          commissions
        </p>
      </div>

      {/* tabs */}
      <div
        className="flex gap-1 p-1 bg-bastet-card border border-bastet-border rounded-lg overflow-x-auto"
        role="tablist"
        aria-label="Settings sections"
      >
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? "bg-bastet-gold/10 text-bastet-gold border border-bastet-gold/20"
                  : "text-text-secondary hover:text-text-primary hover:bg-bastet-bg"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* tab panels */}
      <div role="tabpanel">
        {activeTab === "property" && (
          <PropertyTab
            property={property}
            loading={propertyLoading}
            saving={propertySaving}
            onChange={updateProperty}
            onSave={saveProperty}
          />
        )}
        {activeTab === "policies" && (
          <PoliciesTab
            policies={policies}
            onChange={setPolicies}
            onSave={savePolicies}
          />
        )}
        {activeTab === "rates" && (
          <RatesTab
            types={apartmentTypes}
            loading={ratesLoading}
            saving={ratesSaving}
            hasChanges={Object.keys(editedRates).length > 0}
            onUpdateRate={updateRate}
            onSave={saveRates}
          />
        )}
        {activeTab === "channels" && (
          <ChannelsTab
            channels={channels}
            loading={channelsLoading}
            saving={channelsSaving}
            hasChanges={Object.keys(editedChannels).length > 0}
            onUpdateChannel={updateChannel}
            onSave={saveChannels}
          />
        )}
      </div>
    </div>
  );
}

/* ========== Property Tab ========== */

function PropertyTab({
  property,
  loading,
  saving,
  onChange,
  onSave,
}: {
  property: Property | null;
  loading: boolean;
  saving: boolean;
  onChange: (field: keyof Property, value: string | number) => void;
  onSave: () => void;
}) {
  if (loading) return <LoadingCard />;
  if (!property) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertCircle className="w-8 h-8 text-text-muted mx-auto mb-2" />
          <p className="text-text-secondary">No property found</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              Property Settings
            </h2>
            <p className="text-sm text-text-secondary mt-0.5">
              Update your property details and configuration
            </p>
          </div>
          <Button onClick={onSave} disabled={saving} size="sm">
            {saving ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-1.5" />
            )}
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Input
            id="prop-name"
            label="Property Name"
            value={property.name || ""}
            onChange={(e) => onChange("name", e.target.value)}
          />
          <Input
            id="prop-address"
            label="Address"
            value={property.address || ""}
            onChange={(e) => onChange("address", e.target.value)}
          />
          <Input
            id="prop-city"
            label="City"
            value={property.city || ""}
            onChange={(e) => onChange("city", e.target.value)}
          />
          <Input
            id="prop-country"
            label="Country"
            value={property.country || ""}
            onChange={(e) => onChange("country", e.target.value)}
          />
          <Input
            id="prop-phone"
            label="Phone"
            type="tel"
            value={property.phone || ""}
            onChange={(e) => onChange("phone", e.target.value)}
          />
          <Input
            id="prop-email"
            label="Email"
            type="email"
            value={property.email || ""}
            onChange={(e) => onChange("email", e.target.value)}
          />
          <Input
            id="prop-website"
            label="Website"
            type="url"
            value={property.website || ""}
            onChange={(e) => onChange("website", e.target.value)}
          />
          <Input
            id="prop-timezone"
            label="Timezone"
            value={property.timezone || ""}
            onChange={(e) => onChange("timezone", e.target.value)}
            placeholder="Europe/London"
          />
          <Input
            id="prop-default-currency"
            label="Default Currency"
            value={property.default_currency || ""}
            onChange={(e) => onChange("default_currency", e.target.value)}
            placeholder="GBP"
          />
          <Input
            id="prop-reporting-currency"
            label="Reporting Currency"
            value={property.reporting_currency || ""}
            onChange={(e) => onChange("reporting_currency", e.target.value)}
            placeholder="GBP"
          />
          <Input
            id="prop-star-rating"
            label="Star Rating"
            type="number"
            min={1}
            max={5}
            value={property.star_rating ?? ""}
            onChange={(e) =>
              onChange("star_rating", parseInt(e.target.value) || 0)
            }
          />
          <Input
            id="prop-total-apartments"
            label="Total Apartments"
            type="number"
            min={0}
            value={property.total_apartments ?? ""}
            onChange={(e) =>
              onChange("total_apartments", parseInt(e.target.value) || 0)
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}

/* ========== Booking Policies Tab ========== */

function PoliciesTab({
  policies,
  onChange,
  onSave,
}: {
  policies: BookingPolicies;
  onChange: (p: BookingPolicies) => void;
  onSave: () => void;
}) {
  const update = (field: keyof BookingPolicies, value: string | number) => {
    onChange({ ...policies, [field]: value });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              Booking Policies
            </h2>
            <p className="text-sm text-text-secondary mt-0.5">
              Configure check-in/out times and stay requirements
            </p>
          </div>
          <Button onClick={onSave} size="sm">
            <Save className="w-4 h-4 mr-1.5" />
            Save Policies
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-text-muted mb-5 bg-bastet-bg px-3 py-2 rounded-lg border border-bastet-border">
          These policies are saved locally in your browser. A future update will
          persist them to the database.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Input
            id="pol-checkin"
            label="Check-in Time"
            type="time"
            value={policies.check_in_time}
            onChange={(e) => update("check_in_time", e.target.value)}
          />
          <Input
            id="pol-checkout"
            label="Check-out Time"
            type="time"
            value={policies.check_out_time}
            onChange={(e) => update("check_out_time", e.target.value)}
          />
          <Input
            id="pol-min-stay"
            label="Minimum Stay (nights)"
            type="number"
            min={1}
            value={policies.minimum_stay}
            onChange={(e) =>
              update("minimum_stay", parseInt(e.target.value) || 1)
            }
          />
          <Input
            id="pol-max-stay"
            label="Maximum Stay (nights)"
            type="number"
            min={1}
            value={policies.maximum_stay}
            onChange={(e) =>
              update("maximum_stay", parseInt(e.target.value) || 365)
            }
          />
          <div className="md:col-span-2">
            <label
              htmlFor="pol-cancellation"
              className="block text-sm font-medium text-text-secondary mb-1.5"
            >
              Cancellation Policy
            </label>
            <textarea
              id="pol-cancellation"
              rows={4}
              className="w-full px-3 py-2.5 bg-bastet-bg border border-bastet-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-bastet-gold/50 focus:border-bastet-gold transition-colors resize-y"
              placeholder="Describe your cancellation policy..."
              value={policies.cancellation_policy}
              onChange={(e) => update("cancellation_policy", e.target.value)}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ========== Rate Management Tab ========== */

function RatesTab({
  types,
  loading,
  saving,
  hasChanges,
  onUpdateRate,
  onSave,
}: {
  types: ApartmentType[];
  loading: boolean;
  saving: boolean;
  hasChanges: boolean;
  onUpdateRate: (
    id: string,
    field: "base_rate_gbp" | "base_weekly_rate_gbp",
    value: string
  ) => void;
  onSave: () => void;
}) {
  if (loading) return <LoadingCard />;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              Rate Management
            </h2>
            <p className="text-sm text-text-secondary mt-0.5">
              Set nightly and weekly base rates for each apartment type
            </p>
          </div>
          <Button
            onClick={onSave}
            disabled={saving || !hasChanges}
            size="sm"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-1.5" />
            )}
            {saving ? "Saving..." : "Save Rates"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {types.length === 0 ? (
          <p className="text-text-secondary text-sm py-8 text-center">
            No apartment types found
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" role="table">
              <thead>
                <tr className="border-b border-bastet-border">
                  <th className="text-left text-xs font-medium text-text-muted uppercase tracking-wider py-3 pr-4">
                    Apartment Type
                  </th>
                  <th className="text-left text-xs font-medium text-text-muted uppercase tracking-wider py-3 px-4">
                    Nightly Rate (GBP)
                  </th>
                  <th className="text-left text-xs font-medium text-text-muted uppercase tracking-wider py-3 pl-4">
                    Weekly Rate (GBP)
                  </th>
                </tr>
              </thead>
              <tbody>
                {types.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-bastet-border/50 last:border-0"
                  >
                    <td className="py-3 pr-4">
                      <span className="text-sm font-medium text-text-primary">
                        {t.name}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="w-32 px-3 py-1.5 bg-bastet-bg border border-bastet-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-bastet-gold/50 focus:border-bastet-gold transition-colors"
                        value={t.base_rate_gbp ?? ""}
                        onChange={(e) =>
                          onUpdateRate(t.id, "base_rate_gbp", e.target.value)
                        }
                        aria-label={`Nightly rate for ${t.name}`}
                      />
                    </td>
                    <td className="py-3 pl-4">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="w-32 px-3 py-1.5 bg-bastet-bg border border-bastet-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-bastet-gold/50 focus:border-bastet-gold transition-colors"
                        value={t.base_weekly_rate_gbp ?? ""}
                        onChange={(e) =>
                          onUpdateRate(
                            t.id,
                            "base_weekly_rate_gbp",
                            e.target.value
                          )
                        }
                        aria-label={`Weekly rate for ${t.name}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ========== Channel Commissions Tab ========== */

function ChannelsTab({
  channels,
  loading,
  saving,
  hasChanges,
  onUpdateChannel,
  onSave,
}: {
  channels: BookingChannel[];
  loading: boolean;
  saving: boolean;
  hasChanges: boolean;
  onUpdateChannel: (id: string, value: string) => void;
  onSave: () => void;
}) {
  if (loading) return <LoadingCard />;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              Channel Commissions
            </h2>
            <p className="text-sm text-text-secondary mt-0.5">
              Set commission rates for each booking channel
            </p>
          </div>
          <Button
            onClick={onSave}
            disabled={saving || !hasChanges}
            size="sm"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-1.5" />
            )}
            {saving ? "Saving..." : "Save Commissions"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {channels.length === 0 ? (
          <p className="text-text-secondary text-sm py-8 text-center">
            No booking channels found
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" role="table">
              <thead>
                <tr className="border-b border-bastet-border">
                  <th className="text-left text-xs font-medium text-text-muted uppercase tracking-wider py-3 pr-4">
                    Channel
                  </th>
                  <th className="text-left text-xs font-medium text-text-muted uppercase tracking-wider py-3 px-4">
                    Status
                  </th>
                  <th className="text-left text-xs font-medium text-text-muted uppercase tracking-wider py-3 pl-4">
                    Commission Rate (%)
                  </th>
                </tr>
              </thead>
              <tbody>
                {channels.map((ch) => (
                  <tr
                    key={ch.id}
                    className="border-b border-bastet-border/50 last:border-0"
                  >
                    <td className="py-3 pr-4">
                      <span className="text-sm font-medium text-text-primary">
                        {ch.name}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          ch.is_active
                            ? "bg-status-success/10 text-status-success"
                            : "bg-text-muted/10 text-text-muted"
                        }`}
                      >
                        {ch.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="py-3 pl-4">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        className="w-28 px-3 py-1.5 bg-bastet-bg border border-bastet-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-bastet-gold/50 focus:border-bastet-gold transition-colors"
                        value={ch.commission_rate ?? ""}
                        onChange={(e) =>
                          onUpdateChannel(ch.id, e.target.value)
                        }
                        aria-label={`Commission rate for ${ch.name}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ========== Loading Card ========== */

function LoadingCard() {
  return (
    <Card>
      <CardContent className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-text-muted animate-spin" />
        <span className="ml-2 text-sm text-text-secondary">Loading...</span>
      </CardContent>
    </Card>
  );
}
