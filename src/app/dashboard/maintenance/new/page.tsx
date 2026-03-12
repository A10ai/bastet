"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Loader2 } from "lucide-react";
import { MAINTENANCE_CATEGORIES, MAINTENANCE_PRIORITY_LEVELS } from "@/lib/constants";
import type { Apartment } from "@/types";

export default function NewMaintenancePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [apartments, setApartments] = useState<Apartment[]>([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("normal");
  const [apartmentId, setApartmentId] = useState("");
  const [estimatedCost, setEstimatedCost] = useState("");

  useEffect(() => {
    fetch("/api/v1/apartments")
      .then((r) => r.json())
      .then((json) => setApartments(json.data || []));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      const res = await fetch("/api/v1/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          category,
          priority,
          apartment_id: apartmentId || null,
          estimated_cost_gbp: estimatedCost ? parseFloat(estimatedCost) : null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Failed to create request");
        return;
      }

      const { data } = await res.json();
      router.push(`/dashboard/maintenance/${data.id}`);
    } catch {
      setError("Failed to create request");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/maintenance" className="p-2 rounded-lg hover:bg-bastet-card transition-colors">
          <ArrowLeft className="w-5 h-5 text-text-secondary" />
        </Link>
        <div>
          <h1 className="text-2xl font-display font-bold text-text-primary">New Maintenance Request</h1>
          <p className="text-sm text-text-secondary mt-1">Report an issue</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="max-w-2xl space-y-6">
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-text-primary">Issue Details</h3>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Input label="Title" id="title" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Brief description of the issue" />
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    required
                    className="w-full px-3 py-2.5 bg-bastet-bg border border-bastet-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-bastet-gold/50"
                    placeholder="Detailed description of the problem..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">Category</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      required
                      className="w-full px-3 py-2.5 bg-bastet-bg border border-bastet-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-bastet-gold/50"
                    >
                      <option value="">Select category...</option>
                      {MAINTENANCE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c.replace("_", " ")}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">Priority</label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                      className="w-full px-3 py-2.5 bg-bastet-bg border border-bastet-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-bastet-gold/50"
                    >
                      {MAINTENANCE_PRIORITY_LEVELS.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {(priority === "urgent" || priority === "emergency") && (
                  <div className="p-3 bg-status-error/10 border border-status-error/20 rounded-lg text-sm text-status-error">
                    {priority === "emergency" ? "Emergency" : "Urgent"} priority will set the apartment status to maintenance.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-text-primary">Location & Cost</h3>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">Apartment (Optional)</label>
                  <select
                    value={apartmentId}
                    onChange={(e) => setApartmentId(e.target.value)}
                    className="w-full px-3 py-2.5 bg-bastet-bg border border-bastet-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-bastet-gold/50"
                  >
                    <option value="">Common area / General</option>
                    {apartments.map((apt) => (
                      <option key={apt.id} value={apt.id}>
                        {apt.number} — {apt.apartment_type?.name || ""} ({apt.building?.name || ""})
                      </option>
                    ))}
                  </select>
                </div>
                <Input
                  label="Estimated Cost (GBP)"
                  type="number"
                  id="estimatedCost"
                  value={estimatedCost}
                  onChange={(e) => setEstimatedCost(e.target.value)}
                  min={0}
                  step="0.01"
                />
              </div>
            </CardContent>
          </Card>

          {error && (
            <div className="p-3 bg-status-error/10 border border-status-error/20 rounded-lg text-sm text-status-error">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Create Request
            </Button>
            <Link href="/dashboard/maintenance">
              <Button type="button" variant="secondary">Cancel</Button>
            </Link>
          </div>
        </div>
      </form>
    </div>
  );
}
