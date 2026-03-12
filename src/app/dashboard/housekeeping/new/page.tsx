"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Loader2 } from "lucide-react";
import { HOUSEKEEPING_TYPES, PRIORITY_LEVELS } from "@/lib/constants";
import type { Apartment, Staff } from "@/types";

export default function NewHousekeepingPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);

  const [apartmentId, setApartmentId] = useState("");
  const [type, setType] = useState("");
  const [priority, setPriority] = useState("normal");
  const [scheduledDate, setScheduledDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [assignedTo, setAssignedTo] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/v1/apartments").then((r) => r.json()),
      fetch("/api/v1/staff?is_active=true").then((r) => r.json()),
    ]).then(([aptRes, staffRes]) => {
      setApartments(aptRes.data || []);
      setStaffList(
        (staffRes.data || []).filter(
          (s: Staff) => s.role === "housekeeping" || s.role === "manager"
        )
      );
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      const res = await fetch("/api/v1/housekeeping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apartment_id: apartmentId,
          type,
          priority,
          scheduled_date: scheduledDate,
          assigned_to: assignedTo || null,
          notes: notes || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Failed to create task");
        return;
      }

      const { data } = await res.json();
      router.push(`/dashboard/housekeeping/${data.id}`);
    } catch {
      setError("Failed to create task");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/housekeeping" className="p-2 rounded-lg hover:bg-bastet-card transition-colors">
          <ArrowLeft className="w-5 h-5 text-text-secondary" />
        </Link>
        <div>
          <h1 className="text-2xl font-display font-bold text-text-primary">New Housekeeping Task</h1>
          <p className="text-sm text-text-secondary mt-1">Create a cleaning or inspection task</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="max-w-2xl space-y-6">
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-text-primary">Task Details</h3>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">Apartment</label>
                  <select
                    value={apartmentId}
                    onChange={(e) => setApartmentId(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 bg-bastet-bg border border-bastet-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-bastet-gold/50"
                  >
                    <option value="">Select apartment...</option>
                    {apartments.map((apt) => (
                      <option key={apt.id} value={apt.id}>
                        {apt.number} — {apt.apartment_type?.name || ""} ({apt.building?.name || ""})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">Type</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 bg-bastet-bg border border-bastet-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-bastet-gold/50"
                  >
                    <option value="">Select type...</option>
                    {HOUSEKEEPING_TYPES.map((t) => (
                      <option key={t} value={t}>{t.replace("_", " ")}</option>
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
                    {PRIORITY_LEVELS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <Input
                  label="Scheduled Date"
                  type="date"
                  id="scheduledDate"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  required
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-text-primary">Assignment</h3>
            </CardHeader>
            <CardContent>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Assign To (Optional)</label>
                <select
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  className="w-full px-3 py-2.5 bg-bastet-bg border border-bastet-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-bastet-gold/50"
                >
                  <option value="">Unassigned</option>
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.first_name} {s.last_name} ({s.role})
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-4">
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2.5 bg-bastet-bg border border-bastet-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-bastet-gold/50"
                  placeholder="Additional notes..."
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
              Create Task
            </Button>
            <Link href="/dashboard/housekeeping">
              <Button type="button" variant="secondary">Cancel</Button>
            </Link>
          </div>
        </div>
      </form>
    </div>
  );
}
