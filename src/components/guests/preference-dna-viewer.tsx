"use client";

import { useState } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Save, Loader2 } from "lucide-react";
import type { GuestPreferences } from "@/types";

interface PreferenceDnaViewerProps {
  preferences: GuestPreferences | null;
  guestId: string;
  editable?: boolean;
}

interface PreferenceSection {
  title: string;
  fields: { key: string; label: string; type: "text" | "number" | "boolean" | "array" | "select"; options?: string[] }[];
}

const SECTIONS: PreferenceSection[] = [
  {
    title: "Accommodation",
    fields: [
      { key: "floor_preference", label: "Floor Preference", type: "text" },
      { key: "view_preference", label: "View Preference", type: "select", options: ["sea", "pool", "garden", "city", "partial_sea", "no_preference"] },
      { key: "bed_type", label: "Bed Type", type: "select", options: ["single", "double", "queen", "king", "twin"] },
      { key: "pillow_type", label: "Pillow Type", type: "select", options: ["soft", "medium", "firm", "memory_foam"] },
      { key: "mattress_firmness", label: "Mattress Firmness", type: "select", options: ["soft", "medium", "firm"] },
    ],
  },
  {
    title: "Climate",
    fields: [
      { key: "ac_temperature_c", label: "AC Temperature (°C)", type: "number" },
      { key: "ac_mode", label: "AC Mode", type: "select", options: ["cool", "heat", "auto", "fan"] },
    ],
  },
  {
    title: "Housekeeping",
    fields: [
      { key: "housekeeping_frequency", label: "Cleaning Frequency", type: "select", options: ["daily", "every_other_day", "twice_weekly", "weekly", "on_request"] },
      { key: "housekeeping_time", label: "Preferred Time", type: "select", options: ["morning", "afternoon", "evening"] },
      { key: "towel_change_frequency", label: "Towel Change", type: "select", options: ["daily", "every_other_day", "twice_weekly", "weekly"] },
      { key: "linen_change_frequency", label: "Linen Change", type: "select", options: ["daily", "every_other_day", "twice_weekly", "weekly"] },
    ],
  },
  {
    title: "Dietary",
    fields: [
      { key: "dietary_needs", label: "Dietary Needs", type: "array" },
      { key: "food_allergies", label: "Food Allergies", type: "array" },
      { key: "cuisine_preferences", label: "Cuisine Preferences", type: "array" },
    ],
  },
  {
    title: "Beverages",
    fields: [
      { key: "coffee_type", label: "Coffee Type", type: "text" },
      { key: "tea_type", label: "Tea Type", type: "text" },
      { key: "milk_preference", label: "Milk Preference", type: "select", options: ["full_fat", "semi_skimmed", "skimmed", "oat", "almond", "soy", "none"] },
    ],
  },
  {
    title: "Communication",
    fields: [
      { key: "contact_method", label: "Preferred Contact", type: "select", options: ["email", "phone", "whatsapp", "sms"] },
      { key: "contact_language", label: "Contact Language", type: "select", options: ["en", "ar", "ru", "de"] },
    ],
  },
  {
    title: "Activities",
    fields: [
      { key: "interests", label: "Interests", type: "array" },
      { key: "activity_level", label: "Activity Level", type: "select", options: ["low", "moderate", "high", "very_high"] },
      { key: "pool_preference", label: "Pool Preference", type: "text" },
      { key: "beach_preference", label: "Beach Preference", type: "text" },
    ],
  },
  {
    title: "Family",
    fields: [
      { key: "has_children", label: "Has Children", type: "boolean" },
      { key: "children_ages", label: "Children Ages", type: "array" },
      { key: "childcare_needed", label: "Childcare Needed", type: "boolean" },
    ],
  },
  {
    title: "Transport",
    fields: [
      { key: "airport_transfer", label: "Airport Transfer", type: "boolean" },
      { key: "shuttle_preference", label: "Shuttle Preference", type: "text" },
    ],
  },
  {
    title: "Special Occasions",
    fields: [
      { key: "anniversary_date", label: "Anniversary Date", type: "text" },
      { key: "birthday_celebrations", label: "Birthday Celebrations", type: "boolean" },
    ],
  },
  {
    title: "Arrival / Departure",
    fields: [
      { key: "typical_arrival_time", label: "Typical Arrival Time", type: "text" },
      { key: "typical_departure_time", label: "Typical Departure Time", type: "text" },
      { key: "early_checkin_preference", label: "Early Check-in", type: "boolean" },
      { key: "late_checkout_preference", label: "Late Check-out", type: "boolean" },
    ],
  },
  {
    title: "Meta",
    fields: [
      { key: "auto_learned", label: "Auto-learned", type: "boolean" },
      { key: "confidence_score", label: "Confidence Score", type: "number" },
      { key: "last_updated_from", label: "Last Updated From", type: "text" },
    ],
  },
];

export function PreferenceDnaViewer({
  preferences,
  guestId,
  editable = false,
}: PreferenceDnaViewerProps) {
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<Record<string, unknown>>(
    preferences ? { ...preferences } : {}
  );
  const [saving, setSaving] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["Accommodation"]));

  const toggleSection = (title: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };

  const getValue = (key: string): unknown => {
    if (editMode) return editData[key];
    return preferences ? (preferences as unknown as Record<string, unknown>)[key] : null;
  };

  const setValue = (key: string, value: unknown) => {
    setEditData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/guests/${guestId}/preferences`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editData),
      });
      if (res.ok) {
        setEditMode(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const renderField = (field: { key: string; label: string; type: string; options?: string[] }) => {
    const val = getValue(field.key);

    if (!editMode) {
      // Display mode
      if (val === null || val === undefined || val === "") {
        return <span className="text-text-muted text-xs italic">Not set</span>;
      }
      if (field.type === "boolean") {
        return <span className="text-sm">{val ? "Yes" : "No"}</span>;
      }
      if (field.type === "array" && Array.isArray(val)) {
        return val.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {val.map((item, i) => (
              <span
                key={i}
                className="px-2 py-0.5 bg-bastet-bg border border-bastet-border rounded-full text-xs text-text-secondary"
              >
                {String(item)}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-text-muted text-xs italic">None</span>
        );
      }
      return <span className="text-sm text-text-primary capitalize">{String(val).replace(/_/g, " ")}</span>;
    }

    // Edit mode
    if (field.type === "boolean") {
      return (
        <button
          type="button"
          onClick={() => setValue(field.key, !val)}
          className={`px-3 py-1 rounded text-xs font-medium ${val ? "bg-status-success/20 text-status-success" : "bg-bastet-bg text-text-muted"}`}
        >
          {val ? "Yes" : "No"}
        </button>
      );
    }
    if (field.type === "select" && field.options) {
      return (
        <select
          value={String(val || "")}
          onChange={(e) => setValue(field.key, e.target.value || null)}
          className="px-2 py-1 bg-bastet-bg border border-bastet-border rounded text-sm text-text-primary"
        >
          <option value="">Not set</option>
          {field.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      );
    }
    if (field.type === "array") {
      const arrVal = Array.isArray(val) ? val : [];
      return (
        <input
          type="text"
          value={arrVal.join(", ")}
          onChange={(e) =>
            setValue(
              field.key,
              e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
            )
          }
          placeholder="Comma-separated"
          className="w-full px-2 py-1 bg-bastet-bg border border-bastet-border rounded text-sm text-text-primary"
        />
      );
    }
    if (field.type === "number") {
      return (
        <input
          type="number"
          value={val !== null && val !== undefined ? String(val) : ""}
          onChange={(e) => setValue(field.key, e.target.value ? parseFloat(e.target.value) : null)}
          className="w-24 px-2 py-1 bg-bastet-bg border border-bastet-border rounded text-sm text-text-primary font-mono"
        />
      );
    }
    return (
      <input
        type="text"
        value={String(val || "")}
        onChange={(e) => setValue(field.key, e.target.value || null)}
        className="w-full px-2 py-1 bg-bastet-bg border border-bastet-border rounded text-sm text-text-primary"
      />
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">
            Preference DNA
          </h3>
          {preferences?.confidence_score !== undefined && (
            <p className="text-xs text-text-muted mt-0.5">
              Confidence: {((preferences.confidence_score || 0) * 100).toFixed(0)}%
            </p>
          )}
        </div>
        {editable && (
          <div className="flex gap-2">
            {editMode ? (
              <>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span className="ml-1">Save</span>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditMode(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => {
                setEditData(preferences ? { ...preferences } : {});
                setEditMode(true);
              }}>
                Edit
              </Button>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-1 p-0">
        {SECTIONS.map((section) => (
          <div key={section.title} className="border-b border-bastet-border/50 last:border-0">
            <button
              type="button"
              onClick={() => toggleSection(section.title)}
              className="w-full flex items-center justify-between px-6 py-3 hover:bg-bastet-bg/50 transition-colors"
            >
              <span className="text-sm font-medium text-text-primary">{section.title}</span>
              {expandedSections.has(section.title) ? (
                <ChevronDown className="w-4 h-4 text-text-muted" />
              ) : (
                <ChevronRight className="w-4 h-4 text-text-muted" />
              )}
            </button>
            {expandedSections.has(section.title) && (
              <div className="px-6 pb-4 space-y-3">
                {section.fields.map((field) => (
                  <div key={field.key} className="flex items-start justify-between gap-4">
                    <span className="text-xs text-text-muted shrink-0 w-36 pt-1">
                      {field.label}
                    </span>
                    <div className="flex-1 text-right">{renderField(field)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
